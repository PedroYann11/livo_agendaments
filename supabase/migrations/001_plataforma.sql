-- =====================================================================
-- 001 — Plataforma: negócios, membros, configuração e as portas públicas
--
-- Baseline LIMPA da Livo Agenda (projeto Supabase `livo-agenda`).
-- Adaptada de livo@d74d591 · migrations 001, 003, 005, 008, 014, 026, 051 —
-- lá as 8 primeiras nunca foram versionadas (D-18); aqui o banco nasce
-- inteiro do repositório.
--
-- O QUE ESTA MIGRATION FAZ (backend BÁSICO: entrar e navegar)
--   1. tenants, tenant_members, platform_admins, store_settings;
--   2. is_member / has_role / is_platform_admin (base de toda RLS futura);
--   3. RLS ligada em TODAS as tabelas, no mesmo lote (tabela sem policy é
--      vazamento — lição da 027 do livo);
--   4. portas:
--        negocio_publico(slug)   anon   → identidade e tema da página
--        meus_negocios()         logado → em quais negócios a pessoa entra
--        criar_negocio(...)      só platform admin
--        vincular_membro(...)    só SQL Editor (service_role/postgres)
--   5. os três negócios de DEMONSTRAÇÃO (dados fictícios).
--
-- O QUE FICA PARA A FASE DE BACKEND COMPLETO
--   serviços, profissionais, clientes, agendamentos (com EXCLUDE anti-
--   conflito), financeiro, fichas — docs/PLANEJAMENTO.md, seção 4.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Tabelas
-- ---------------------------------------------------------------------

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique
    check (slug ~ '^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$'),
  nome text not null check (char_length(nome) between 2 and 80),
  nicho text not null default 'outro'
    check (nicho in ('depilacao','barbearia','unhas','salao','estetica','sobrancelha','saude','outro')),
  pele text not null default 'generica'
    check (pele in ('beleza','barbearia','delicada','generica')),
  status text not null default 'active' check (status in ('active','suspended')),
  custom_domain text unique,
  plano text not null default 'piloto',
  demo boolean not null default false,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

comment on table public.tenants is 'Cada negócio (cliente da Livo Agenda). O slug é o caminho público: agenda.livo.tec.br/<slug>.';

create table public.tenant_members (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  papel text not null default 'owner'
    check (papel in ('owner','admin','reception','professional')),
  criado_em timestamptz not null default now(),
  primary key (tenant_id, user_id)
);
create index tenant_members_user_idx on public.tenant_members(user_id);

create table public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  criado_em timestamptz not null default now()
);

-- chave/valor por negócio (padrão do livo): config nova não pede DDL
create table public.store_settings (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  chave text not null check (char_length(chave) between 1 and 60),
  valor jsonb not null,
  atualizado_em timestamptz not null default now(),
  primary key (tenant_id, chave)
);

create or replace function public.set_atualizado_em()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.atualizado_em := now();
  return new;
end $$;

create trigger tenants_atualizado before update on public.tenants
  for each row execute function public.set_atualizado_em();
create trigger store_settings_atualizado before update on public.store_settings
  for each row execute function public.set_atualizado_em();

-- ---------------------------------------------------------------------
-- 2. Funções de autorização (SECURITY DEFINER: leem por baixo da RLS,
--    evitando recursão nas policies que as chamam)
-- ---------------------------------------------------------------------

create or replace function public.is_member(t uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.tenant_members m
    where m.tenant_id = t and m.user_id = (select auth.uid())
  )
$$;

create or replace function public.has_role(t uuid, variadic papeis text[])
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.tenant_members m
    where m.tenant_id = t and m.user_id = (select auth.uid()) and m.papel = any(papeis)
  )
$$;

create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.platform_admins p where p.user_id = (select auth.uid()))
$$;

-- ---------------------------------------------------------------------
-- 3. RLS — ligada em todas, no mesmo lote
-- ---------------------------------------------------------------------

alter table public.tenants enable row level security;
alter table public.tenant_members enable row level security;
alter table public.platform_admins enable row level security;
alter table public.store_settings enable row level security;

-- tenants: o membro vê o próprio negócio; status/slug só a plataforma muda
create policy tenants_ler on public.tenants for select to authenticated
  using (public.is_member(id) or public.is_platform_admin());
create policy tenants_plataforma on public.tenants for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

-- membros: cada um vê o próprio vínculo; dono/admin vê a equipe.
-- ESCRITA fechada aqui (como na 027 do livo): um membro que inserisse em
-- tenant_members se promoveria a dono. Vínculo nasce por função.
create policy membros_ler on public.tenant_members for select to authenticated
  using (user_id = (select auth.uid()) or public.has_role(tenant_id, 'owner', 'admin') or public.is_platform_admin());

create policy admins_ler on public.platform_admins for select to authenticated
  using (user_id = (select auth.uid()));

-- configuração: toda a equipe lê; dono e admin escrevem
create policy config_ler on public.store_settings for select to authenticated
  using (public.is_member(tenant_id) or public.is_platform_admin());
create policy config_inserir on public.store_settings for insert to authenticated
  with check (public.has_role(tenant_id, 'owner', 'admin'));
create policy config_alterar on public.store_settings for update to authenticated
  using (public.has_role(tenant_id, 'owner', 'admin'))
  with check (public.has_role(tenant_id, 'owner', 'admin'));
create policy config_apagar on public.store_settings for delete to authenticated
  using (public.has_role(tenant_id, 'owner', 'admin'));

-- anon nunca lê tabela de negócio direto: só pelas RPCs abaixo
revoke all on public.tenants, public.tenant_members, public.platform_admins, public.store_settings from anon;

-- ---------------------------------------------------------------------
-- 4. Portas
-- ---------------------------------------------------------------------

-- A página pública: identidade e tema, colunas em whitelist, só negócio ativo.
create or replace function public.negocio_publico(p_slug text)
returns table (id uuid, slug text, nome text, nicho text, pele text, tagline text, descricao text, tema jsonb)
language sql stable security definer set search_path = '' as $$
  select t.id, t.slug, t.nome, t.nicho, t.pele,
         coalesce(m.valor ->> 'tagline', ''),
         coalesce(m.valor ->> 'descricao', ''),
         coalesce(te.valor, '{}'::jsonb)
  from public.tenants t
  left join public.store_settings m on m.tenant_id = t.id and m.chave = 'marca'
  left join public.store_settings te on te.tenant_id = t.id and te.chave = 'tema'
  where t.slug = lower(p_slug) and t.status = 'active'
  limit 1
$$;

-- Depois do login: em quais negócios esta pessoa entra, e com que papel.
create or replace function public.meus_negocios()
returns table (slug text, nome text, papel text)
language sql stable security definer set search_path = '' as $$
  select t.slug, t.nome, m.papel
  from public.tenant_members m
  join public.tenants t on t.id = m.tenant_id
  where m.user_id = (select auth.uid()) and t.status = 'active'
  order by m.criado_em
$$;

-- Provisionar um negócio: transacional (tudo ou nada), só a plataforma.
-- A conta do dono (auth.users) precisa existir antes — criar login é Admin API.
create or replace function public.criar_negocio(p_slug text, p_nome text, p_nicho text, p_dono uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  novo uuid;
begin
  if not public.is_platform_admin() then
    raise exception 'apenas a plataforma cria negócios' using errcode = '42501';
  end if;
  insert into public.tenants (slug, nome, nicho, pele)
  values (
    lower(p_slug), p_nome, p_nicho,
    case p_nicho when 'barbearia' then 'barbearia' when 'unhas' then 'delicada' when 'sobrancelha' then 'delicada'
                 when 'saude' then 'generica' when 'outro' then 'generica' else 'beleza' end
  )
  returning id into novo;
  insert into public.tenant_members (tenant_id, user_id, papel) values (novo, p_dono, 'owner');
  -- config NEUTRA: negócio novo não herda nada de ninguém (D-1 do livo)
  insert into public.store_settings (tenant_id, chave, valor) values
    (novo, 'marca', jsonb_build_object('tagline', '', 'descricao', '')),
    (novo, 'tema', jsonb_build_object('marca', '#1f5c4b', 'sobreMarca', '#ffffff', 'fundo', '#f6f5f2',
      'superficie', '#ffffff', 'texto', '#1c1c20', 'textoSuave', '#5f5f69', 'acento', '#c9a46a'));
  return novo;
end $$;

-- Ligar um login a um negócio. Só pelo SQL Editor (postgres/service_role):
--   select public.vincular_membro('dono@clinica.com', 'minha-clinica', 'owner');
create or replace function public.vincular_membro(p_email text, p_slug text, p_papel text default 'owner')
returns void language plpgsql security definer set search_path = '' as $$
declare
  uid uuid;
  tid uuid;
begin
  select id into uid from auth.users where lower(email) = lower(p_email);
  if uid is null then raise exception 'usuário % não existe em Authentication', p_email; end if;
  select id into tid from public.tenants where slug = lower(p_slug);
  if tid is null then raise exception 'negócio % não existe', p_slug; end if;
  insert into public.tenant_members (tenant_id, user_id, papel) values (tid, uid, p_papel)
  on conflict (tenant_id, user_id) do update set papel = excluded.papel;
end $$;

-- Supabase dá EXECUTE a PUBLIC por padrão: fechar tudo e abrir só o necessário.
revoke execute on function public.is_member(uuid) from public, anon;
revoke execute on function public.has_role(uuid, text[]) from public, anon;
revoke execute on function public.is_platform_admin() from public, anon;
revoke execute on function public.negocio_publico(text) from public;
revoke execute on function public.meus_negocios() from public, anon;
revoke execute on function public.criar_negocio(text, text, text, uuid) from public, anon;
revoke execute on function public.vincular_membro(text, text, text) from public, anon, authenticated;
revoke execute on function public.set_atualizado_em() from public, anon, authenticated;

grant execute on function public.is_member(uuid) to authenticated;
grant execute on function public.has_role(uuid, text[]) to authenticated;
grant execute on function public.is_platform_admin() to authenticated;
grant execute on function public.negocio_publico(text) to anon, authenticated;
grant execute on function public.meus_negocios() to authenticated;
grant execute on function public.criar_negocio(text, text, text, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 5. Demonstração (fictícia) — os três nichos de exemplo
-- ---------------------------------------------------------------------

insert into public.tenants (id, slug, nome, nicho, pele, demo) values
  ('4b1c2f7e-0a6d-4f51-9a3e-0c2f1d7e8a10', 'ambar', 'Âmbar Depilação', 'depilacao', 'beleza', true),
  ('8e3d5a90-7b21-4c6e-b1f4-2a9c6d0e3b55', 'navalha', 'Navalha Barbearia', 'barbearia', 'barbearia', true),
  ('c7a9e2d1-5f3b-4a8c-9d6e-1b2f3a4c5d66', 'jade', 'Jade Nails', 'unhas', 'delicada', true);

insert into public.store_settings (tenant_id, chave, valor) values
  ('4b1c2f7e-0a6d-4f51-9a3e-0c2f1d7e8a10', 'marca', jsonb_build_object(
    'tagline', 'Pele lisa, cuidado de verdade.',
    'descricao', 'Depilação a laser, cera e design de sobrancelha num espaço pensado para você se sentir à vontade do começo ao fim.')),
  ('4b1c2f7e-0a6d-4f51-9a3e-0c2f1d7e8a10', 'tema', jsonb_build_object(
    'marca', '#9a4a2b', 'sobreMarca', '#ffffff', 'fundo', '#f5ede4', 'superficie', '#fffaf4',
    'texto', '#2a1b14', 'textoSuave', '#76604f', 'acento', '#d39a5c')),
  ('8e3d5a90-7b21-4c6e-b1f4-2a9c6d0e3b55', 'marca', jsonb_build_object(
    'tagline', 'Corte afiado. Conversa boa. Sem fila.',
    'descricao', 'Barbearia clássica com atendimento hora marcada, cerveja gelada e o melhor degradê da região.')),
  ('8e3d5a90-7b21-4c6e-b1f4-2a9c6d0e3b55', 'tema', jsonb_build_object(
    'marca', '#d4a24c', 'sobreMarca', '#15130f', 'fundo', '#121110', 'superficie', '#1d1b18',
    'texto', '#efe8dc', 'textoSuave', '#a89e8f', 'acento', '#b8442f')),
  ('c7a9e2d1-5f3b-4a8c-9d6e-1b2f3a4c5d66', 'marca', jsonb_build_object(
    'tagline', 'Unhas impecáveis, no seu tempo.',
    'descricao', 'Estúdio de unhas com atendimento individual. Gel, fibra e cuidados para mãos e pés.')),
  ('c7a9e2d1-5f3b-4a8c-9d6e-1b2f3a4c5d66', 'tema', jsonb_build_object(
    'marca', '#2f6b58', 'sobreMarca', '#ffffff', 'fundo', '#fbf6f2', 'superficie', '#ffffff',
    'texto', '#22302a', 'textoSuave', '#66766f', 'acento', '#e3a49e'));
