-- =====================================================================
-- 008 — Cadastro com pagamento: quem PAGA cria a conta e o negócio
--
-- Regra do Pedro (09/10/2026): conta só nasce depois do pagamento. Quem
-- comprou recebe um link de convite; com ele cria o próprio login e senha
-- e, já logado e com o e-mail confirmado, o próprio negócio — sem a Livo
-- criar acesso para ninguém.
--
-- A compra vira uma LICENÇA (uma por negócio), presa ao e-mail de quem
-- pagou. Ela é conferida em dois pontos, no banco:
--   1. antes de a conta existir: hook_antes_de_criar_conta, chamado pela
--      Supabase Auth ("Before User Created", ligado no painel da Supabase);
--   2. ao criar o negócio: negocio_criar_meu gasta a licença.
--
--   licencas                       só a plataforma lê (RLS); tenants nunca
--   licenca_emitir(email, …)       SQL Editor / service_role → convite
--   convite_publico(codigo)        anon → para quem é o convite
--   hook_antes_de_criar_conta(ev)  supabase_auth_admin → aceita ou recusa
--   slug_reservado / slug_disponivel   endereço livre?
--   negocio_criar_meu(dono, neg)   logado + e-mail confirmado + licença paga
--
-- O negócio nasce com o plano da licença e com a configuração NEUTRA que o
-- app manda, gravada por negocio_salvar (007) — a mesma porta, com as
-- mesmas checagens, que o painel usa depois. Depende da 007.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Licenças: uma compra paga = um negócio
-- ---------------------------------------------------------------------

create table public.licencas (
  id uuid primary key default gen_random_uuid(),
  -- o segredo do link de convite (144 bits)
  codigo text not null unique default encode(extensions.gen_random_bytes(18), 'hex'),
  email text not null check (email = lower(btrim(email)) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  plano text not null default 'mensal' check (char_length(plano) between 1 and 40),
  valor numeric(10,2) not null default 0 check (valor >= 0),
  situacao text not null default 'paga' check (situacao in ('paga', 'usada', 'cancelada')),
  -- de onde veio o pagamento (manual, pix, o gateway…) e o id dele lá: o mesmo pagamento não gera duas licenças
  origem text not null default 'manual' check (char_length(origem) between 1 and 40),
  referencia text unique,
  tenant_id uuid references public.tenants(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  criada_em timestamptz not null default now(),
  usada_em timestamptz
);
create index licencas_email_idx on public.licencas (email) where situacao = 'paga';

comment on table public.licencas is 'Compras pagas. Cada uma dá direito a criar um negócio; presa ao e-mail de quem pagou.';

alter table public.licencas enable row level security;
create policy licencas_plataforma on public.licencas for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());
revoke all on public.licencas from anon;

/**
 * Registra um pagamento e devolve o convite. Só pelo SQL Editor (ou, depois,
 * pelo webhook do meio de pagamento com a service_role):
 *   select public.licenca_emitir('cliente@email.com', 'mensal', 49.90, 'pix');
 * Com p_referencia (o id do pagamento), chamar de novo devolve o mesmo convite.
 */
create or replace function public.licenca_emitir(
  p_email text,
  p_plano text default 'mensal',
  p_valor numeric default 0,
  p_origem text default 'manual',
  p_referencia text default null
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  l public.licencas;
begin
  if p_referencia is not null then
    select * into l from public.licencas where referencia = p_referencia;
  end if;
  if l.id is null then
    insert into public.licencas (email, plano, valor, origem, referencia)
    values (lower(btrim(p_email)), p_plano, p_valor, p_origem, p_referencia)
    returning * into l;
  end if;
  return jsonb_build_object(
    'email', l.email, 'plano', l.plano, 'situacao', l.situacao, 'codigo', l.codigo,
    'link', 'https://agenda.livo.tec.br/painel/criar-conta?convite=' || l.codigo);
end $$;

/** A tela de cadastro com o link de convite: para quem é (o e-mail fica travado nele). */
create or replace function public.convite_publico(p_codigo text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case l.situacao
    when 'paga' then jsonb_build_object('email', l.email, 'plano', l.plano)
    when 'usada' then jsonb_build_object('usado', true)
  end
  from public.licencas l
  where l.codigo = p_codigo and l.situacao in ('paga', 'usada')
$$;

/**
 * "Before User Created" da Supabase Auth: a conta só nasce para um e-mail com
 * licença paga e ainda não usada. Ligar em Authentication › Hooks.
 */
create or replace function public.hook_antes_de_criar_conta(event jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if exists (select 1 from public.licencas l
             where l.situacao = 'paga' and l.email = lower(btrim(event #>> '{user,email}'))) then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object('error', jsonb_build_object(
    'http_code', 403,
    'message', 'Para criar a conta, use o link de convite que você recebeu depois do pagamento.'));
end $$;

-- ---------------------------------------------------------------------
-- 2. Endereço da página
-- ---------------------------------------------------------------------

create or replace function public.slug_reservado(p_slug text)
returns boolean language sql immutable set search_path = '' as $$
  -- espelho de RESERVADOS em lib/enderecos.ts (o teste confere os dois)
  select lower(coalesce(p_slug, '')) = any (array[
    'painel', 'api', 'entrar', 'sair', 'admin', 'app', 'agenda', 'livo', 'www', 'demo', 'ajuda', 'precos',
    'termos', 'privacidade', 'cadastro', 'criar', 'conta', 'login', 'suporte', 'blog', 'contato', 'sobre',
    'planos', 'status', 'static', 'assets'])
$$;

/** Para o formulário de cadastro conferir o endereço enquanto a pessoa digita. */
create or replace function public.slug_disponivel(p_slug text)
returns text language sql stable security definer set search_path = '' as $$
  select case
    when coalesce(p_slug, '') !~ '^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$' then 'invalido'
    when public.slug_reservado(p_slug) then 'reservado'
    when exists (select 1 from public.tenants t where t.slug = p_slug) then 'em_uso'
    else 'ok'
  end
$$;

-- ---------------------------------------------------------------------
-- 3. Criar o próprio negócio (gasta uma licença)
-- ---------------------------------------------------------------------

/**
 * Cria o negócio de quem chamou e o torna dono. Tudo ou nada.
 * p_dono: o nome da pessoa (vira a primeira profissional da agenda).
 * p_negocio: o negócio no formato do app (slug, nome, nicho, pele, tema,
 *            horario, regras, modulos, contato…).
 */
create or replace function public.negocio_criar_meu(p_dono text, p_negocio jsonb)
returns text language plpgsql volatile security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  slug text := coalesce(p_negocio ->> 'slug', '');
  nome text := btrim(regexp_replace(coalesce(p_negocio ->> 'nome', ''), '\s+', ' ', 'g'));
  nicho text := coalesce(p_negocio ->> 'nicho', '');
  dono text := left(btrim(regexp_replace(coalesce(p_dono, ''), '\s+', ' ', 'g')), 80);
  email_conta text;
  lic public.licencas;
  tid uuid;
begin
  if uid is null then
    raise exception 'Entre na sua conta para criar o negócio.' using errcode = '42501';
  end if;
  select u.email into email_conta from auth.users u where u.id = uid and u.email_confirmed_at is not null;
  if email_conta is null then
    raise exception 'Confirme seu e-mail antes de criar o negócio. O link está na sua caixa de entrada.';
  end if;
  -- a compra deste e-mail; trancada até o fim: dois cliques não gastam a mesma licença duas vezes
  select * into lic from public.licencas l
  where l.email = lower(email_conta) and l.situacao = 'paga'
  order by l.criada_em, l.id
  limit 1
  for update;
  if lic.id is null then
    raise exception 'Não encontramos uma compra para este e-mail. Use o link de convite que você recebeu depois do pagamento.'
      using hint = 'licenca';
  end if;

  if char_length(dono) < 2 then raise exception 'Diga seu nome.'; end if;
  if char_length(nome) not between 2 and 80 then
    raise exception 'O nome do negócio precisa ter de 2 a 80 letras.' using hint = 'nome';
  end if;
  if nicho not in ('depilacao', 'barbearia', 'unhas', 'salao', 'estetica', 'sobrancelha', 'saude', 'outro') then
    raise exception 'Escolha o tipo do negócio.' using hint = 'nicho';
  end if;
  case public.slug_disponivel(slug)
    when 'ok' then null;
    when 'invalido' then
      raise exception 'O endereço só pode ter letras minúsculas, números e hífen (até 40).' using hint = 'slug';
    else
      raise exception 'Esse endereço já está em uso. Escolha outro.' using hint = 'slug';
  end case;

  begin
    insert into public.tenants (slug, nome, nicho, plano) values (slug, nome, nicho, lic.plano)
    returning id into tid;
  exception when unique_violation then
    raise exception 'Esse endereço acabou de ser escolhido por outra pessoa. Escolha outro.' using hint = 'slug';
  end;
  insert into public.tenant_members (tenant_id, user_id, papel) values (tid, uid, 'owner');

  -- identidade, tema e configuração: pela porta do painel, com as checagens dela
  perform public.negocio_salvar(tid, p_negocio || jsonb_build_object('nome', nome));

  -- a agenda nasce com uma pessoa atendendo: quem criou, no horário da semana do negócio
  insert into public.profissionais (tenant_id, id, nome, ordem, servicos_ids, horario, acesso)
  values (tid, 'dono', dono, 0, '{}',
          case when jsonb_typeof(p_negocio -> 'horario') = 'object' then p_negocio -> 'horario' else '{}'::jsonb end,
          jsonb_build_object('email', email_conta, 'papel', 'owner'));

  update public.licencas set situacao = 'usada', usada_em = now(), tenant_id = tid, user_id = uid
  where id = lic.id;

  return slug;
end $$;

-- ---------------------------------------------------------------------
-- 4. Permissões: fechar tudo e abrir só o necessário
-- ---------------------------------------------------------------------

revoke execute on function
  public.licenca_emitir(text, text, numeric, text, text), public.convite_publico(text),
  public.hook_antes_de_criar_conta(jsonb), public.slug_reservado(text), public.slug_disponivel(text),
  public.negocio_criar_meu(text, jsonb)
from public, anon, authenticated;

grant execute on function public.convite_publico(text), public.slug_disponivel(text) to anon, authenticated;
grant execute on function public.negocio_criar_meu(text, jsonb) to authenticated;
grant execute on function public.licenca_emitir(text, text, numeric, text, text) to service_role;
grant usage on schema public to supabase_auth_admin;
grant execute on function public.hook_antes_de_criar_conta(jsonb) to supabase_auth_admin;
