-- =====================================================================
-- 013 — Aviso no celular quando a cliente agenda, remarca ou cancela
--
-- O PROBLEMA
-- O dono só fica sabendo de um agendamento novo quando abre o painel (que
-- relê a agenda a cada 30 s). Com o painel fechado, nada chega.
--
-- O CAMINHO (o mesmo da Livo dos restaurantes, livo@d74d591: migrations
-- 004/016/034 e a edge notify-new-order)
--   1. O aparelho do dono pede para receber avisos (Web Push). O navegador
--      devolve um endereço de entrega e duas chaves; o painel guarda tudo em
--      aparelhos_aviso pela porta aviso_aparelho_salvar.
--   2. Quando a CLIENTE agenda, remarca ou cancela pelo site, o gatilho de
--      agendamentos monta o texto aqui no banco (nome, serviço, dia e hora no
--      fuso do negócio) e o entrega à edge function "avisos" pelo pg_net —
--      depois do commit, sem atrasar o agendamento.
--   3. A edge assina e cifra o aviso com as chaves VAPID e o manda a cada
--      aparelho do negócio. Aparelho que não existe mais é esquecido.
--
-- O QUE NÃO VIRA AVISO
--   O que a própria equipe faz no painel (quem mudou é membro do negócio) e
--   o que não veio pelo site (SQL Editor, pg_cron, rotinas com service_role).
--   Avisar o dono do que ele acabou de fazer ensina a ignorar o aviso (lição
--   da 034 do livo).
--
-- SEGREDOS (todos no Vault, nenhum no código)
--   avisos_segredo        combinado entre o banco e a edge; nasce aqui,
--                         aleatório, e não sai do Supabase.
--   avisos_vapid_privada  o par VAPID nasce DENTRO da edge (aviso_preparar,
--   avisos_vapid_publica  uma vez) e é guardado por aviso_chaves_guardar. A
--                         chave privada não passa por código nem conversa.
--
-- O AGENDAMENTO NUNCA DEPENDE DO AVISO: falha no envio vira WARNING e o
-- agendamento grava normalmente.
--
-- REMOÇÃO SUAVE: desligar os avisos num aparelho só o marca como inativo
-- (ativo = false), como o resto do banco. Nada é apagado.
--
-- PARA DESFAZER: remover o gatilho agendamentos_avisar, as funções aviso_*
-- e a tabela aparelhos_aviso. Os segredos podem ficar no Vault.
-- =====================================================================

begin;

-- pg_net: o banco chama a edge e não espera a resposta. No Postgres
-- descartável dos testes ele não existe; lá um substituto anota os pedidos
-- (supabase/tests/00_ambiente.sql).
do $$ begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1. Os aparelhos que recebem aviso
-- ---------------------------------------------------------------------

/** Só os serviços de push dos navegadores (Apple, Google, Mozilla, Microsoft). */
create or replace function public.endereco_de_push_valido(p text)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(char_length(p) <= 1000 and p ~ ('^https://(fcm\.googleapis\.com|android\.googleapis\.com'
    || '|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)/[^[:space:]]+$'), false)
$$;

create table public.aparelhos_aviso (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  usuario_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null check (public.endereco_de_push_valido(endpoint)),
  -- as duas chaves do aparelho para cifrar o aviso (base64url)
  p256dh text not null check (p256dh ~ '^[A-Za-z0-9_=-]{80,100}$'),
  auth text not null check (auth ~ '^[A-Za-z0-9_=-]{16,32}$'),
  -- "iPhone", "Android", "Computador" — para a pessoa reconhecer o aparelho
  nome text not null default '' check (char_length(nome) <= 80),
  -- desligado neste aparelho (pela pessoa, pelo limite ou pelo serviço de push)
  ativo boolean not null default true,
  -- quando os avisos foram ligados pela última vez neste aparelho
  ligado_em timestamptz not null default clock_timestamp(),
  testado_em timestamptz,
  primary key (tenant_id, id),
  unique (tenant_id, endpoint)
);

-- escrita só pelas portas abaixo; cada pessoa enxerga os próprios aparelhos
alter table public.aparelhos_aviso enable row level security;
revoke all on public.aparelhos_aviso from anon, authenticated;
grant select on public.aparelhos_aviso to authenticated;
create policy aparelhos_aviso_ler on public.aparelhos_aviso for select to authenticated
  using (ativo and usuario_id = (select auth.uid()) and public.is_member(tenant_id));

-- ---------------------------------------------------------------------
-- 2. Segredos e a chamada à edge
-- ---------------------------------------------------------------------

do $$ begin
  if not exists (select 1 from vault.secrets where name = 'avisos_segredo') then
    perform vault.create_secret(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
      'avisos_segredo', 'Combinado entre o banco e a edge function avisos (migration 013)');
  end if;
end $$;

/** Lê do Vault — só os três segredos dos avisos. Para a edge (service_role). */
create or replace function public.aviso_segredo(p_nome text)
returns text language sql stable security definer set search_path = '' as $$
  select s.decrypted_secret from vault.decrypted_secrets s
  where s.name = p_nome and p_nome in ('avisos_segredo', 'avisos_vapid_publica', 'avisos_vapid_privada')
  order by s.created_at desc limit 1
$$;

/** A edge gerou o par VAPID: guarda uma vez só. Devolve a chave pública que vale. */
create or replace function public.aviso_chaves_guardar(p_publica text, p_privada text)
returns text language plpgsql volatile security definer set search_path = '' as $$
declare
  atual text;
begin
  if coalesce(p_publica, '') !~ '^[A-Za-z0-9_-]{86,88}$' or coalesce(p_privada, '') !~ '^[A-Za-z0-9_-]{42,44}$' then
    raise exception 'Chaves VAPID em formato inválido.';
  end if;
  -- duas chamadas ao mesmo tempo: a segunda espera e fica com o par da primeira
  perform pg_advisory_xact_lock(hashtext('avisos_vapid'));
  atual := public.aviso_segredo('avisos_vapid_publica');
  if atual is not null then return atual; end if;
  perform vault.create_secret(p_privada, 'avisos_vapid_privada', 'Web Push: chave privada VAPID (nasceu na edge avisos)');
  perform vault.create_secret(p_publica, 'avisos_vapid_publica', 'Web Push: chave pública VAPID');
  return p_publica;
end $$;

/** Pede à edge, com o segredo combinado. Falso se ainda não dá para pedir. */
create or replace function public.aviso_chamar_edge(p_corpo jsonb)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
declare
  segredo text := public.aviso_segredo('avisos_segredo');
begin
  if segredo is null or not exists (select 1 from pg_catalog.pg_proc p
      where p.pronamespace = to_regnamespace('net') and p.proname = 'http_post') then
    return false;
  end if;
  perform net.http_post(
    url := 'https://tgjbrabbimdwafvcshtx.supabase.co/functions/v1/avisos',
    body := p_corpo,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-avisos-segredo', segredo),
    timeout_milliseconds := 10000);
  return true;
end $$;

/** Uma vez, depois de publicar a edge: ela gera e guarda o par VAPID. */
create or replace function public.aviso_preparar()
returns boolean language sql volatile security definer set search_path = '' as $$
  select public.aviso_chamar_edge(jsonb_build_object('acao', 'preparar'))
$$;

/**
 * Manda um aviso aos aparelhos do negócio (ou só aos de uma pessoa).
 * Nunca derruba quem chamou: qualquer falha vira WARNING.
 */
create or replace function public.aviso_disparar(p_tenant uuid, p_aviso jsonb, p_usuario uuid default null)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.aparelhos_aviso a
                 where a.tenant_id = p_tenant and a.ativo and (p_usuario is null or a.usuario_id = p_usuario)) then
    return false;
  end if;
  return public.aviso_chamar_edge(jsonb_build_object(
    'acao', 'avisar', 'tenant_id', p_tenant, 'usuario_id', p_usuario, 'aviso', p_aviso));
exception when others then
  raise warning 'aviso não enviado: %', sqlerrm;
  return false;
end $$;

-- ---------------------------------------------------------------------
-- 3. O texto do aviso, decidido aqui (fuso e nomes moram no banco)
-- ---------------------------------------------------------------------

/** "hoje às 15:00", "amanhã às 09:30", "sáb, 14/11 às 09:00" */
create or replace function public.aviso_quando(p_ts timestamptz, p_fuso text)
returns text language sql stable set search_path = '' as $$
  select case (p_ts at time zone p_fuso)::date - (now() at time zone p_fuso)::date
           when 0 then 'hoje'
           when 1 then 'amanhã'
           else (array['dom','seg','ter','qua','qui','sex','sáb'])[extract(dow from p_ts at time zone p_fuso)::int + 1]
                || ', ' || to_char(p_ts at time zone p_fuso, 'DD/MM')
         end || ' às ' || to_char(p_ts at time zone p_fuso, 'HH24:MI')
$$;

create or replace function public.aviso_do_agendamento(p_tipo text, a public.agendamentos, p_antes timestamptz)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  fuso text := public.fuso_de(a.tenant_id);
  negocio text;
  cliente text;
  servicos text;
  quem text := '';
  titulo text;
  corpo text;
begin
  select t.nome into negocio from public.tenants t where t.id = a.tenant_id;
  select c.nome into cliente from public.clientes c where c.tenant_id = a.tenant_id and c.id = a.cliente_id;
  select string_agg(x ->> 'nome', ' + ') into servicos from jsonb_array_elements(a.itens) x;
  cliente := coalesce(nullif(btrim(cliente), ''), 'Cliente');
  servicos := coalesce(nullif(servicos, ''), 'atendimento');
  -- com mais de uma pessoa atendendo, diz com quem é
  if (select count(*) from public.profissionais p where p.tenant_id = a.tenant_id and p.ativo) > 1 then
    select ' · com ' || p.nome into quem from public.profissionais p
    where p.tenant_id = a.tenant_id and p.id = a.profissional_id;
    quem := coalesce(quem, '');
  end if;

  if p_tipo = 'novo' and a.status = 'pendente' then
    titulo := 'Pedido de agendamento';
    corpo := cliente || ' · ' || servicos || ' · ' || public.aviso_quando(a.inicio, fuso) || quem
             || '. Aguarda a sua confirmação.';
  elsif p_tipo = 'novo' then
    titulo := 'Novo agendamento';
    corpo := cliente || ' · ' || servicos || ' · ' || public.aviso_quando(a.inicio, fuso) || quem;
  elsif p_tipo = 'remarcou' then
    titulo := 'Agendamento remarcado';
    corpo := cliente || ' · ' || servicos || ' · de ' || public.aviso_quando(p_antes, fuso)
             || ' para ' || public.aviso_quando(a.inicio, fuso) || quem;
  else
    titulo := 'Agendamento cancelado';
    corpo := cliente || ' · ' || servicos || ' · ' || public.aviso_quando(a.inicio, fuso) || quem
             || '. O horário ficou livre.';
  end if;

  return jsonb_build_object(
    'titulo', titulo || coalesce(' · ' || negocio, ''),
    'corpo', left(corpo, 240),
    -- tocar no aviso abre a agenda no dia
    'url', '/painel/agenda?data=' || to_char(a.inicio at time zone fuso, 'YYYY-MM-DD'),
    -- etiqueta única: dois avisos seguidos não se substituem na tela
    'tag', 'ag-' || a.id || '-' || p_tipo || '-' || floor(extract(epoch from clock_timestamp()) * 1000)::bigint);
end $$;

-- ---------------------------------------------------------------------
-- 4. O gatilho: só o que a cliente fez pelo site
-- ---------------------------------------------------------------------

/**
 * A mudança veio de alguém pelo site: a API da Supabase marca cada pedido com
 * o papel anon ou authenticated (auth.role()). SQL Editor, pg_cron e rotinas
 * com service_role não são "alguém pelo site".
 */
create or replace function public.pedido_do_site()
returns boolean language sql stable set search_path = '' as $$
  select coalesce(auth.role(), current_setting('role', true)) in ('anon', 'authenticated')
$$;

create or replace function public.agendamentos_avisar()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  tipo text;
begin
  -- veio pelo site e não foi a equipe
  if not public.pedido_do_site() or public.is_member(new.tenant_id) then
    return null;
  end if;
  if tg_op = 'INSERT' then
    if new.canal = 'online' then tipo := 'novo'; end if;
  elsif new.status = 'cancelado' and old.status in ('pendente', 'confirmado') then
    tipo := 'cancelou';
  elsif new.inicio <> old.inicio and new.status in ('pendente', 'confirmado') then
    tipo := 'remarcou';
  end if;
  if tipo is not null then
    perform public.aviso_disparar(new.tenant_id,
      public.aviso_do_agendamento(tipo, new, case when tg_op = 'UPDATE' then old.inicio end));
  end if;
  return null;
exception when others then
  raise warning 'aviso do agendamento %: %', new.id, sqlerrm;
  return null;
end $$;

create trigger agendamentos_avisar after insert or update of status, inicio on public.agendamentos
  for each row execute function public.agendamentos_avisar();

-- ---------------------------------------------------------------------
-- 5. Portas do painel
-- ---------------------------------------------------------------------

create or replace function public.aviso_negocio(p_slug text)
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare
  tid uuid;
begin
  select id into tid from public.tenants where slug = lower(p_slug) and status = 'active';
  if tid is null or not public.is_member(tid) then
    raise exception 'Sem acesso a este negócio.' using errcode = '42501';
  end if;
  return tid;
end $$;

/** O que o painel precisa para desenhar o interruptor deste aparelho. */
create or replace function public.aviso_situacao(p_slug text, p_endpoint text default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  tid uuid := public.aviso_negocio(p_slug);
begin
  return jsonb_build_object(
    -- sem chave pública, o servidor ainda não está pronto para avisar
    'chave', public.aviso_segredo('avisos_vapid_publica'),
    'esteAparelho', exists (select 1 from public.aparelhos_aviso a where a.tenant_id = tid and a.ativo and a.endpoint = p_endpoint),
    'aparelhos', (select count(*) from public.aparelhos_aviso a where a.tenant_id = tid and a.ativo));
end $$;

create or replace function public.aviso_aparelho_salvar(p_slug text, p_endpoint text, p_p256dh text, p_auth text, p_nome text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  tid uuid := public.aviso_negocio(p_slug);
begin
  if not public.endereco_de_push_valido(p_endpoint) then
    raise exception 'Este navegador não é aceito para avisos.';
  end if;
  insert into public.aparelhos_aviso as a (tenant_id, usuario_id, endpoint, p256dh, auth, nome)
  values (tid, (select auth.uid()), p_endpoint, p_p256dh, p_auth, left(coalesce(p_nome, ''), 80))
  on conflict (tenant_id, endpoint) do update set
    usuario_id = excluded.usuario_id, p256dh = excluded.p256dh, auth = excluded.auth, nome = excluded.nome,
    ativo = true, ligado_em = clock_timestamp();
  -- até 20 aparelhos ligados por negócio: o mais antigo é desligado
  update public.aparelhos_aviso a set ativo = false where a.tenant_id = tid and a.id in (
    select x.id from public.aparelhos_aviso x where x.tenant_id = tid and x.ativo order by x.ligado_em desc offset 20);
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.aviso_aparelho_remover(p_slug text, p_endpoint text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  tid uuid := public.aviso_negocio(p_slug);
begin
  update public.aparelhos_aviso a set ativo = false where a.tenant_id = tid and a.endpoint = p_endpoint;
  return jsonb_build_object('ok', true);
end $$;

/** "Mandar um aviso de teste": só para os aparelhos de quem pediu, um a cada 15 s. */
create or replace function public.aviso_teste(p_slug text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  tid uuid := public.aviso_negocio(p_slug);
  eu uuid := (select auth.uid());
  n int;
begin
  if not exists (select 1 from public.aparelhos_aviso a where a.tenant_id = tid and a.ativo and a.usuario_id = eu) then
    raise exception 'Ligue os avisos neste aparelho primeiro.';
  end if;
  update public.aparelhos_aviso a set testado_em = now()
  where a.tenant_id = tid and a.ativo and a.usuario_id = eu
    and (a.testado_em is null or a.testado_em < now() - interval '15 seconds');
  get diagnostics n = row_count;
  if n = 0 then raise exception 'Aviso de teste enviado há pouco. Espere alguns segundos.'; end if;
  if not public.aviso_disparar(tid, jsonb_build_object(
      'titulo', 'Avisos ligados',
      'corpo', 'É assim que um agendamento novo vai aparecer neste aparelho.',
      'url', '/painel/agenda',
      'tag', 'teste-' || floor(extract(epoch from clock_timestamp()) * 1000)::bigint), eu) then
    raise exception 'Os avisos ainda não estão prontos no servidor. Tente de novo mais tarde.';
  end if;
  return jsonb_build_object('ok', true, 'aparelhos', n);
end $$;

-- ---------------------------------------------------------------------
-- 6. Portas da edge (service_role)
-- ---------------------------------------------------------------------

create or replace function public.aviso_destinos(p_tenant uuid, p_usuario uuid default null)
returns table (id uuid, endpoint text, p256dh text, auth text)
language sql stable security definer set search_path = '' as $$
  select a.id, a.endpoint, a.p256dh, a.auth from public.aparelhos_aviso a
  where a.tenant_id = p_tenant and a.ativo and (p_usuario is null or a.usuario_id = p_usuario)
$$;

/** O serviço de push disse que o aparelho não existe mais (404/410): desliga. */
create or replace function public.aviso_esquecer(p_tenant uuid, p_id uuid)
returns void language sql volatile security definer set search_path = '' as $$
  update public.aparelhos_aviso a set ativo = false where a.tenant_id = p_tenant and a.id = p_id
$$;

-- ---------------------------------------------------------------------
-- 7. Quem pode chamar o quê
-- ---------------------------------------------------------------------

revoke all on function
  public.endereco_de_push_valido(text), public.aviso_segredo(text), public.aviso_chaves_guardar(text, text),
  public.aviso_chamar_edge(jsonb), public.aviso_preparar(), public.aviso_disparar(uuid, jsonb, uuid),
  public.aviso_quando(timestamptz, text), public.aviso_do_agendamento(text, public.agendamentos, timestamptz),
  public.pedido_do_site(), public.agendamentos_avisar(), public.aviso_negocio(text), public.aviso_situacao(text, text),
  public.aviso_aparelho_salvar(text, text, text, text, text), public.aviso_aparelho_remover(text, text),
  public.aviso_teste(text), public.aviso_destinos(uuid, uuid), public.aviso_esquecer(uuid, uuid)
from public, anon, authenticated, service_role;

grant execute on function public.endereco_de_push_valido(text) to authenticated, service_role;
grant execute on function
  public.aviso_situacao(text, text), public.aviso_aparelho_salvar(text, text, text, text, text),
  public.aviso_aparelho_remover(text, text), public.aviso_teste(text)
to authenticated;
grant execute on function
  public.aviso_segredo(text), public.aviso_chaves_guardar(text, text),
  public.aviso_destinos(uuid, uuid), public.aviso_esquecer(uuid, uuid)
to service_role;

commit;
