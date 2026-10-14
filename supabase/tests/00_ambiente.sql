-- =====================================================================
-- Ambiente de teste local — o mínimo do Supabase num Postgres puro.
-- Origem: livo@d74d591 · supabase/tests/00_ambiente.sql (reduzido)
--
-- FIEL: papéis anon/authenticated/service_role, GRANTs amplos por padrão
-- (quem barra é a RLS), auth.uid() lendo o "JWT" por GUC.
-- =====================================================================

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key,
  email text,
  email_confirmed_at timestamptz,
  raw_user_meta_data jsonb
);

create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
  -- quem chama os hooks da Supabase Auth (o "antes de criar conta", 008)
  if not exists (select 1 from pg_roles where rolname='supabase_auth_admin') then
    create role supabase_auth_admin nologin noinherit;
  end if;
end $$;

-- igual à da Supabase: o papel do pedido, pelas claims do JWT
create or replace function auth.role() returns text
language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''),
                  (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'))::text
$$;

grant usage on schema public, auth to anon, authenticated, service_role;
grant execute on function auth.uid(), auth.role() to anon, authenticated, service_role;

alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;

-- Storage: as duas tabelas e a função que as policies usam, como na Supabase.
-- O arquivo em si não mora no banco (lá fica no S3; aqui, no servidor de bolso);
-- o que importa testar é a RLS de storage.objects, que decide quem envia o quê.
create schema if not exists storage;

create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean default false,
  file_size_limit bigint,
  allowed_mime_types text[],
  created_at timestamptz default now()
);

create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text not null,
  owner uuid,
  metadata jsonb,
  created_at timestamptz default now(),
  unique (bucket_id, name)
);
alter table storage.objects enable row level security;
alter table storage.buckets enable row level security;

-- igual à da Supabase: as pastas do caminho, sem o nome do arquivo
create or replace function storage.foldername(name text) returns text[]
language plpgsql as $$
declare
  _parts text[];
begin
  select string_to_array(name, '/') into _parts;
  return _parts[1:array_length(_parts, 1) - 1];
end $$;

grant usage on schema storage to anon, authenticated, service_role;
grant all on storage.objects, storage.buckets to anon, authenticated, service_role;
grant execute on function storage.foldername(text) to anon, authenticated, service_role;

-- Vault: na Supabase os segredos ficam cifrados; aqui, guardados como vieram.
-- Mesmos nomes de tabela, visão e função que as migrations usam.
create schema if not exists vault;
create table if not exists vault.secrets (
  id uuid primary key default gen_random_uuid(),
  name text unique,
  description text not null default '',
  secret text not null,
  created_at timestamptz not null default now()
);
create or replace view vault.decrypted_secrets as
  select id, name, description, secret, secret as decrypted_secret, created_at from vault.secrets;
create or replace function vault.create_secret(new_secret text, new_name text default null,
  new_description text default '', new_key_id uuid default null) returns uuid
language sql as $$
  insert into vault.secrets (name, description, secret) values (new_name, new_description, new_secret) returning id
$$;

-- pg_net: aqui nenhum pedido sai; cada chamada fica anotada em
-- net.pedidos_teste para a suíte conferir o que seria enviado.
create schema if not exists net;
create table if not exists net.pedidos_teste (
  id bigserial primary key,
  url text,
  headers jsonb,
  body jsonb,
  criado_em timestamptz not null default clock_timestamp()
);
create or replace function net.http_post(url text, body jsonb default '{}'::jsonb, params jsonb default '{}'::jsonb,
  headers jsonb default '{"Content-Type": "application/json"}'::jsonb, timeout_milliseconds int default 5000)
returns bigint language sql as $$
  insert into net.pedidos_teste (url, headers, body) values (url, headers, body) returning id
$$;
