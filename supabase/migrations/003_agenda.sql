-- =====================================================================
-- 003 — A agenda no banco
--
-- O QUE FAZ
--   1. tabelas do negócio: categorias, servicos, profissionais, bloqueios,
--      clientes, agendamentos e registros (as coleções menores — financeiro,
--      pacotes, fichas, cupons, avaliações, modelos de mensagem — em jsonb,
--      até cada uma ganhar regra própria no banco);
--   2. RLS ligada em TODAS, no mesmo lote; anon fora de todas;
--   3. o MOTOR de horários, porta linha a linha de lib/disponibilidade.ts.
--      A mesma função mostra as vagas ao cliente e valida a gravação; a
--      constraint `sem_conflito` (EXCLUDE) impede dois horários sobrepostos
--      para a mesma profissional, mesmo com dois cliques no mesmo segundo;
--   4. portas públicas (anon): sempre por slug de negócio ATIVO e, para um
--      agendamento, pelo token dele — pagina_publica, vagas_publicas,
--      agendar, agendamento_publico/cancelar/confirmar/remarcar/avaliar,
--      ficha_enviar, cupom_publico;
--   5. portas do painel (logado; quem decide é a RLS): painel_dados,
--      painel_salvar (SECURITY INVOKER) e negocio_salvar (só dono/admin);
--   6. DepiLED: catálogo, agenda e regras saem do código e entram aqui.
--      Só dado PÚBLICO — clientes entram depois, por carga própria.
--
-- HORA DE PAREDE
--   O app fala "2026-10-10T08:00" (hora do negócio). O banco guarda
--   timestamptz. Quem converte é o banco, com o fuso do negócio
--   (config.regras.fuso) — o navegador nunca decide fuso.
--
-- REVERTER (não há dado de cliente antes da carga):
--   drop table public.agendamentos, public.bloqueios, public.clientes,
--     public.registros, public.profissionais, public.servicos,
--     public.categorias cascade;
--   delete from public.store_settings where chave = 'config';
--   e as funções criadas abaixo.
-- =====================================================================

create schema if not exists extensions;
create extension if not exists btree_gist with schema extensions;
create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
-- 1. Tabelas
--    Chave (tenant_id, id): o id vem do app ("sv_…", "ag_…") e só é único
--    dentro do negócio. Toda FK carrega o tenant_id — um agendamento nunca
--    aponta para o cliente de outro negócio.
-- ---------------------------------------------------------------------

create table public.categorias (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  id text not null check (char_length(id) between 1 and 80),
  nome text not null check (char_length(nome) between 1 and 80),
  descricao text not null default '' check (char_length(descricao) <= 300),
  ordem int not null default 0,
  pausada boolean not null default false,
  atualizado_em timestamptz not null default now(),
  primary key (tenant_id, id)
);

create table public.servicos (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  id text not null check (char_length(id) between 1 and 80),
  categoria_id text,
  nome text not null check (char_length(nome) <= 120),
  descricao text not null default '' check (char_length(descricao) <= 1000),
  duracao_min int not null check (duracao_min between 1 and 1440),
  intervalo_min int not null default 0 check (intervalo_min between 0 and 480),
  preco numeric(10,2) not null default 0 check (preco >= 0),
  modo_preco text not null default 'fixo' check (modo_preco in ('fixo','a_partir_de','oculto')),
  online boolean not null default true,
  ativo boolean not null default true,
  pausado boolean not null default false,
  destaque boolean not null default false,
  ordem int not null default 0,
  retorno_dias int check (retorno_dias is null or retorno_dias between 1 and 3650),
  ficha_id text,
  foto_url text,
  atualizado_em timestamptz not null default now(),
  primary key (tenant_id, id),
  -- apagar a categoria solta os serviços dela (vão para "Outros")
  foreign key (tenant_id, categoria_id) references public.categorias (tenant_id, id) on delete set null (categoria_id)
);

create table public.profissionais (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  id text not null check (char_length(id) between 1 and 80),
  nome text not null check (char_length(nome) <= 80),
  cargo text not null default '',
  bio text not null default '',
  cor int not null default 0,
  foto_url text,
  comissao_pct numeric(5,2) not null default 0 check (comissao_pct between 0 and 100),
  ativo boolean not null default true,
  ordem int not null default 0,
  servicos_ids text[] not null default '{}',
  -- {"0": [{"inicio":"08:00","fim":"12:00"}], …, "6": []} — 0 = domingo
  horario jsonb not null default '{}' check (jsonb_typeof(horario) = 'object'),
  acesso jsonb,
  atualizado_em timestamptz not null default now(),
  primary key (tenant_id, id)
);

create table public.bloqueios (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  id text not null check (char_length(id) between 1 and 80),
  -- null = o negócio inteiro
  profissional_id text,
  inicio timestamptz not null,
  fim timestamptz not null,
  motivo text not null default '' check (char_length(motivo) <= 200),
  atualizado_em timestamptz not null default now(),
  primary key (tenant_id, id),
  foreign key (tenant_id, profissional_id) references public.profissionais (tenant_id, id),
  check (fim > inicio)
);
create index bloqueios_quando on public.bloqueios (tenant_id, inicio);

create table public.clientes (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  id text not null check (char_length(id) between 1 and 80),
  nome text not null check (char_length(nome) between 1 and 120),
  -- só dígitos, com DDD; vazio = sem telefone (há clientes antigos assim)
  telefone text not null default '' check (telefone ~ '^[0-9]{0,15}$'),
  email text not null default '' check (char_length(email) <= 200),
  nascimento date,
  observacoes text not null default '' check (char_length(observacoes) <= 4000),
  tags text[] not null default '{}',
  origem text not null default 'painel' check (origem in ('online','painel','importado')),
  consentimento_whats boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  primary key (tenant_id, id)
);
-- busca por telefone (quem agenda pelo link é reconhecido por ele). Não é
-- única: listas antigas trazem duplicadas; juntar é decisão do dono.
create index clientes_telefone on public.clientes (tenant_id, telefone) where telefone <> '';

create table public.agendamentos (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  id text not null check (char_length(id) between 1 and 80),
  -- o link do cliente: /<negocio>/a/<token>
  token text not null check (char_length(token) between 8 and 40),
  cliente_id text not null,
  profissional_id text not null,
  inicio timestamptz not null,
  fim timestamptz not null,
  -- limpeza/preparo depois do fim: ocupa a agenda, o cliente não vê
  intervalo_min int not null default 0 check (intervalo_min between 0 and 480),
  -- fim + intervalo, calculado pelo gatilho abaixo (base da sem_conflito)
  ocupa_ate timestamptz not null,
  status text not null default 'confirmado'
    check (status in ('pendente','confirmado','concluido','cancelado','faltou')),
  canal text not null default 'painel' check (canal in ('online','painel','whatsapp')),
  -- serviços CONGELADOS no momento do agendamento (nome, preço, duração)
  itens jsonb not null default '[]' check (jsonb_typeof(itens) = 'array'),
  total numeric(10,2) not null default 0,
  desconto numeric(10,2) not null default 0,
  observacao text not null default '' check (char_length(observacao) <= 1000),
  criado_em timestamptz not null default now(),
  confirmado_em timestamptz,
  lembrete_em timestamptz,
  cancelado_por text check (cancelado_por in ('cliente','negocio')),
  motivo_cancelamento text not null default '',
  pagamento jsonb,
  sinal jsonb,
  pacote_cliente_id text,
  cupom text,
  atualizado_em timestamptz not null default now(),
  primary key (tenant_id, id),
  unique (tenant_id, token),
  foreign key (tenant_id, cliente_id) references public.clientes (tenant_id, id),
  foreign key (tenant_id, profissional_id) references public.profissionais (tenant_id, id),
  check (fim > inicio),
  -- A GARANTIA: dois horários que ocupam a agenda nunca se sobrepõem para a
  -- mesma profissional. Encostar ([08:00,08:15) e [08:15,…)) é permitido.
  constraint sem_conflito exclude using gist (
    tenant_id with =,
    profissional_id with =,
    tstzrange(inicio, ocupa_ate) with &&
  ) where (status in ('pendente','confirmado','concluido'))
);
create index agendamentos_quando on public.agendamentos (tenant_id, inicio);
create index agendamentos_cliente on public.agendamentos (tenant_id, cliente_id);

-- coleções menores, guardadas como o app as conhece (jsonb por item)
create table public.registros (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  colecao text not null check (colecao in (
    'lancamentos','pacotes','pacotesClientes','modelosFicha','fichas',
    'mensagens','registrosMensagem','depoimentos','cupons')),
  id text not null check (char_length(id) between 1 and 80),
  dados jsonb not null check (jsonb_typeof(dados) = 'object' and pg_column_size(dados) <= 262144),
  atualizado_em timestamptz not null default now(),
  primary key (tenant_id, colecao, id)
);

create or replace function public.agendamento_ocupacao()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.ocupa_ate := new.fim + make_interval(mins => new.intervalo_min);
  return new;
end $$;

create trigger agendamentos_ocupacao before insert or update on public.agendamentos
  for each row execute function public.agendamento_ocupacao();

create trigger categorias_atualizado before update on public.categorias for each row execute function public.set_atualizado_em();
create trigger servicos_atualizado before update on public.servicos for each row execute function public.set_atualizado_em();
create trigger profissionais_atualizado before update on public.profissionais for each row execute function public.set_atualizado_em();
create trigger bloqueios_atualizado before update on public.bloqueios for each row execute function public.set_atualizado_em();
create trigger clientes_atualizado before update on public.clientes for each row execute function public.set_atualizado_em();
create trigger agendamentos_atualizado before update on public.agendamentos for each row execute function public.set_atualizado_em();
create trigger registros_atualizado before update on public.registros for each row execute function public.set_atualizado_em();

-- ---------------------------------------------------------------------
-- 2. RLS — ligada em todas, no mesmo lote
--    Leitura: a equipe do negócio. Catálogo e equipe: dono e admin.
--    Agenda, bloqueios e clientes: toda a equipe (recepção marca horário).
-- ---------------------------------------------------------------------

alter table public.categorias enable row level security;
alter table public.servicos enable row level security;
alter table public.profissionais enable row level security;
alter table public.bloqueios enable row level security;
alter table public.clientes enable row level security;
alter table public.agendamentos enable row level security;
alter table public.registros enable row level security;

create policy categorias_ler on public.categorias for select to authenticated
  using (public.is_member(tenant_id));
create policy categorias_escrever on public.categorias for all to authenticated
  using (public.has_role(tenant_id, 'owner', 'admin'))
  with check (public.has_role(tenant_id, 'owner', 'admin'));

create policy servicos_ler on public.servicos for select to authenticated
  using (public.is_member(tenant_id));
create policy servicos_escrever on public.servicos for all to authenticated
  using (public.has_role(tenant_id, 'owner', 'admin'))
  with check (public.has_role(tenant_id, 'owner', 'admin'));

create policy profissionais_ler on public.profissionais for select to authenticated
  using (public.is_member(tenant_id));
create policy profissionais_escrever on public.profissionais for all to authenticated
  using (public.has_role(tenant_id, 'owner', 'admin'))
  with check (public.has_role(tenant_id, 'owner', 'admin'));

create policy bloqueios_ler on public.bloqueios for select to authenticated
  using (public.is_member(tenant_id));
create policy bloqueios_escrever on public.bloqueios for all to authenticated
  using (public.is_member(tenant_id))
  with check (public.is_member(tenant_id));

create policy clientes_ler on public.clientes for select to authenticated
  using (public.is_member(tenant_id));
create policy clientes_inserir on public.clientes for insert to authenticated
  with check (public.is_member(tenant_id));
create policy clientes_alterar on public.clientes for update to authenticated
  using (public.is_member(tenant_id))
  with check (public.is_member(tenant_id));
create policy clientes_apagar on public.clientes for delete to authenticated
  using (public.has_role(tenant_id, 'owner', 'admin'));

create policy agendamentos_ler on public.agendamentos for select to authenticated
  using (public.is_member(tenant_id));
create policy agendamentos_inserir on public.agendamentos for insert to authenticated
  with check (public.is_member(tenant_id));
create policy agendamentos_alterar on public.agendamentos for update to authenticated
  using (public.is_member(tenant_id))
  with check (public.is_member(tenant_id));
create policy agendamentos_apagar on public.agendamentos for delete to authenticated
  using (public.has_role(tenant_id, 'owner', 'admin'));

-- financeiro só dono/admin (a recepção vende pacote, e a venda lança a
-- receita: inserir é da equipe; ler, mudar e apagar lançamento, não)
create policy registros_ler on public.registros for select to authenticated
  using (public.is_member(tenant_id) and (colecao <> 'lancamentos' or public.has_role(tenant_id, 'owner', 'admin')));
create policy registros_inserir on public.registros for insert to authenticated
  with check (public.is_member(tenant_id));
create policy registros_alterar on public.registros for update to authenticated
  using (public.is_member(tenant_id) and (colecao not in ('lancamentos','cupons','pacotes','modelosFicha','mensagens') or public.has_role(tenant_id, 'owner', 'admin')))
  with check (public.is_member(tenant_id));
create policy registros_apagar on public.registros for delete to authenticated
  using (public.is_member(tenant_id) and (colecao not in ('lancamentos','cupons','pacotes','modelosFicha','mensagens') or public.has_role(tenant_id, 'owner', 'admin')));

-- anon nunca lê tabela de negócio direto: só pelas portas abaixo
revoke all on public.categorias, public.servicos, public.profissionais, public.bloqueios,
  public.clientes, public.agendamentos, public.registros from anon;

-- ---------------------------------------------------------------------
-- 3. Peças comuns: configuração, fuso, hora de parede e o formato do app
-- ---------------------------------------------------------------------

create or replace function public.config_de(p_tenant uuid)
returns jsonb language sql stable set search_path = '' as $$
  select coalesce(
    (select s.valor from public.store_settings s where s.tenant_id = p_tenant and s.chave = 'config'),
    '{}'::jsonb)
$$;

create or replace function public.fuso_de(p_tenant uuid)
returns text language sql stable set search_path = '' as $$
  select coalesce(public.config_de(p_tenant) #>> '{regras,fuso}', 'America/Fortaleza')
$$;

/** timestamptz → "2026-10-10T08:00" no fuso do negócio */
create or replace function public.parede(p_ts timestamptz, p_fuso text)
returns text language sql stable set search_path = '' as $$
  select to_char(p_ts at time zone p_fuso, 'YYYY-MM-DD"T"HH24:MI')
$$;

/** "2026-10-10T08:00" (hora do negócio) → timestamptz */
create or replace function public.de_parede(p_texto text, p_fuso text)
returns timestamptz language sql stable set search_path = '' as $$
  select case when coalesce(p_texto, '') = '' then null else p_texto::timestamp at time zone p_fuso end
$$;

create or replace function public.hora_do_min(p_min int)
returns text language sql immutable set search_path = '' as $$
  select lpad((p_min / 60)::text, 2, '0') || ':' || lpad((p_min % 60)::text, 2, '0')
$$;

create or replace function public.min_do_dia(p_hora text)
returns int language sql immutable set search_path = '' as $$
  select split_part(p_hora, ':', 1)::int * 60 + coalesce(nullif(split_part(p_hora, ':', 2), '')::int, 0)
$$;

create or replace function public.novo_token()
returns text language sql volatile set search_path = '' as $$
  select string_agg(substr('abcdefghjkmnpqrstuvwxyz23456789', (get_byte(b.x, i) % 31) + 1, 1), '' order by i)
  from (select extensions.gen_random_bytes(12) as x) b, generate_series(0, 11) i
$$;

create or replace function public.categoria_json(c public.categorias)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object('id', c.id, 'nome', c.nome, 'descricao', c.descricao, 'ordem', c.ordem, 'pausada', c.pausada)
$$;

create or replace function public.servico_json(s public.servicos)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id', s.id, 'categoriaId', s.categoria_id, 'nome', s.nome, 'descricao', s.descricao,
    'duracaoMin', s.duracao_min, 'intervaloMin', s.intervalo_min, 'preco', s.preco,
    'modoPreco', s.modo_preco, 'online', s.online, 'ativo', s.ativo, 'pausado', s.pausado,
    'destaque', s.destaque, 'ordem', s.ordem, 'retornoDias', s.retorno_dias,
    'fichaId', s.ficha_id, 'fotoUrl', s.foto_url)
$$;

/** p_privado = false: o que a página pública pode mostrar (sem comissão nem acesso) */
create or replace function public.profissional_json(p public.profissionais, p_privado boolean)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id', p.id, 'nome', p.nome, 'cargo', p.cargo, 'bio', p.bio, 'cor', p.cor, 'fotoUrl', p.foto_url,
    'comissaoPct', case when p_privado then p.comissao_pct else 0 end,
    'ativo', p.ativo, 'ordem', p.ordem, 'servicosIds', to_jsonb(p.servicos_ids), 'horario', p.horario,
    'acesso', case when p_privado then p.acesso end)
$$;

create or replace function public.bloqueio_json(b public.bloqueios, p_fuso text)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id', b.id, 'profissionalId', b.profissional_id,
    'inicio', public.parede(b.inicio, p_fuso), 'fim', public.parede(b.fim, p_fuso), 'motivo', b.motivo)
$$;

create or replace function public.cliente_json(c public.clientes, p_fuso text)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id', c.id, 'nome', c.nome, 'telefone', c.telefone, 'email', c.email,
    'nascimento', to_char(c.nascimento, 'YYYY-MM-DD'), 'observacoes', c.observacoes,
    'tags', to_jsonb(c.tags), 'origem', c.origem, 'criadoEm', public.parede(c.criado_em, p_fuso),
    'consentimentoWhats', c.consentimento_whats)
$$;

/** p_privado = false: o que o dono do link vê (sem o pagamento) */
create or replace function public.agendamento_json(a public.agendamentos, p_fuso text, p_privado boolean)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id', a.id, 'token', a.token, 'clienteId', a.cliente_id, 'profissionalId', a.profissional_id,
    'inicio', public.parede(a.inicio, p_fuso), 'fim', public.parede(a.fim, p_fuso),
    'intervaloMin', a.intervalo_min, 'status', a.status, 'canal', a.canal, 'itens', a.itens,
    'total', a.total, 'desconto', a.desconto, 'observacao', a.observacao,
    'criadoEm', public.parede(a.criado_em, p_fuso), 'confirmadoEm', public.parede(a.confirmado_em, p_fuso),
    'lembreteEm', public.parede(a.lembrete_em, p_fuso), 'canceladoPor', a.cancelado_por,
    'motivoCancelamento', a.motivo_cancelamento,
    'pagamento', case when p_privado then a.pagamento end,
    'sinal', a.sinal, 'pacoteClienteId', a.pacote_cliente_id, 'cupom', a.cupom)
$$;

/** O que o cliente pode agendar pelo link: ativo, não pausado, online e de categoria no ar. */
create or replace function public.servico_visivel(s public.servicos)
returns boolean language sql stable set search_path = '' as $$
  select s.ativo and s.online and not s.pausado and not exists (
    select 1 from public.categorias c
    where c.tenant_id = s.tenant_id and c.id = s.categoria_id and c.pausada)
$$;

-- ---------------------------------------------------------------------
-- 4. O motor de horários (porta de lib/disponibilidade.ts)
--
--   1. duração = soma dos serviços; a agenda ocupa duração + intervalo;
--   2. janela do dia: dia avulso (config.aberturas) se houver, senão a
--      semana da profissional; dia fechado (config.datasEspeciais) não tem;
--   3. menos bloqueios e agendamentos que ocupam a agenda;
--   4. candidatos = passos de intervaloSlotsMin + o fim de cada ocupação
--      (atendimento de 15 min às 08:00 libera 08:15, sem buraco);
--   5. corta antecedência mínima e janela máxima (o painel pode ignorar);
--   6. "qualquer profissional": quem tem menos agenda no dia leva o horário.
-- ---------------------------------------------------------------------

create or replace function public.janelas_do_dia(p_config jsonb, p_horario jsonb, p_data date)
returns table (ini int, fim int) language sql stable set search_path = '' as $$
  with avulsas as (
    select e ->> 'inicio' as i, e ->> 'fim' as f
    from jsonb_array_elements(coalesce(p_config -> 'aberturas', '[]'::jsonb)) e
    where e ->> 'data' = p_data::text
  ),
  semana as (
    select e ->> 'inicio' as i, e ->> 'fim' as f
    from jsonb_array_elements(coalesce(p_horario -> extract(dow from p_data)::int::text, '[]'::jsonb)) e
  ),
  escolhidas as (
    select i, f from avulsas
    union all
    select i, f from semana where not exists (select 1 from avulsas)
  )
  select public.min_do_dia(i), public.min_do_dia(f)
  from escolhidas
  where not exists (
    select 1 from jsonb_array_elements(coalesce(p_config -> 'datasEspeciais', '[]'::jsonb)) d
    where d ->> 'data' = p_data::text)
$$;

create or replace function public.vagas_do_dia(
  p_tenant uuid,
  p_servicos text[],
  p_profissional text,
  p_data date,
  p_agora timestamp,
  p_ignorar text default null,
  p_ignorar_regras boolean default false
) returns table (hora text, profissional_id text)
language plpgsql stable set search_path = '' as $$
declare
  cfg jsonb := public.config_de(p_tenant);
  fuso text := coalesce(cfg #>> '{regras,fuso}', 'America/Fortaleza');
  passo int := greatest(coalesce((cfg #>> '{regras,intervaloSlotsMin}')::int, 15), 1);
  antecedencia int := round(coalesce((cfg #>> '{regras,antecedenciaMinHoras}')::numeric, 0) * 60)::int;
  janela int := coalesce((cfg #>> '{regras,janelaMaxDias}')::int, 45);
  agora timestamp := date_trunc('minute', p_agora);
  atendimento int;
  intervalo int;
  n int;
  limite timestamp;
  dia_ini timestamptz := p_data::timestamp at time zone fuso;
  dia_fim timestamptz := (p_data + 1)::timestamp at time zone fuso;
begin
  select coalesce(sum(s.duracao_min), 0), coalesce(max(s.intervalo_min), 0), count(*)
    into atendimento, intervalo, n
  from public.servicos s
  where s.tenant_id = p_tenant and s.id = any(p_servicos);
  if n = 0 then return; end if;
  if exists (select 1 from jsonb_array_elements(coalesce(cfg -> 'datasEspeciais', '[]'::jsonb)) d
             where d ->> 'data' = p_data::text) then
    return;
  end if;
  if p_ignorar_regras then
    limite := agora;
  else
    if p_data < agora::date or p_data > agora::date + janela then return; end if;
    limite := agora + make_interval(mins => antecedencia);
  end if;

  return query
  with pros as (
    select p.id, p.ordem, p.horario
    from public.profissionais p
    where p.tenant_id = p_tenant and p.ativo and p.servicos_ids @> p_servicos
      and (p_profissional is null or p.id = p_profissional)
  ),
  -- ocupação em minutos do dia; o agendamento ignorado (remarcação) conta
  -- na carga, mas não bloqueia — igual ao motor do navegador
  ocup as (
    select a.profissional_id as pro,
           round(extract(epoch from (a.inicio at time zone fuso) - p_data::timestamp) / 60)::int as i,
           round(extract(epoch from (a.inicio at time zone fuso) - p_data::timestamp) / 60)::int
             + round(extract(epoch from a.fim - a.inicio) / 60)::int + a.intervalo_min as f,
           a.id is not distinct from p_ignorar as ignorado
    from public.agendamentos a
    where a.tenant_id = p_tenant
      and a.status in ('pendente', 'confirmado', 'concluido')
      and a.inicio >= dia_ini and a.inicio < dia_fim
      and a.profissional_id in (select id from pros)
    union all
    select pr.id,
           round(extract(epoch from greatest(b.inicio at time zone fuso, p_data::timestamp) - p_data::timestamp) / 60)::int,
           round(extract(epoch from least(b.fim at time zone fuso, (p_data + 1)::timestamp) - p_data::timestamp) / 60)::int,
           false
    from public.bloqueios b
    join pros pr on b.profissional_id is null or b.profissional_id = pr.id
    where b.tenant_id = p_tenant and b.inicio < dia_fim and b.fim > dia_ini
  ),
  carga as (
    select o.pro, sum(o.f - o.i) as minutos from ocup o group by o.pro
  ),
  faixas as (
    select pr.id as pro, pr.ordem, j.ini, j.fim
    from pros pr
    cross join lateral public.janelas_do_dia(cfg, pr.horario, p_data) j
    where j.fim > j.ini
  ),
  candidatos as (
    select fx.pro, fx.ordem, fx.fim, g.t
    from faixas fx
    cross join lateral generate_series(((fx.ini + passo - 1) / passo) * passo, fx.fim - 1, passo) g(t)
    union
    select fx.pro, fx.ordem, fx.fim, o.f
    from faixas fx
    join ocup o on o.pro = fx.pro and not o.ignorado and o.f > fx.ini and o.f < fx.fim
  ),
  livres as (
    select c.pro, c.ordem, c.t
    from candidatos c
    where c.t + atendimento <= c.fim
      -- o intervalo de limpeza pode passar do fim do expediente
      and not exists (
        select 1 from ocup o
        where o.pro = c.pro and not o.ignorado and c.t < o.f and o.i < c.t + atendimento + intervalo)
      and p_data::timestamp + make_interval(mins => c.t) >= limite
  )
  select distinct on (l.t) public.hora_do_min(l.t), l.pro
  from livres l
  left join carga cg on cg.pro = l.pro
  order by l.t, coalesce(cg.minutos, 0), l.ordem, l.pro;
end $$;

/** Vagas de todos os dias da janela: {"2026-10-10": [{"hora","profissionalId"}], …} — só dias com vaga. */
create or replace function public.vagas_da_janela(
  p_tenant uuid,
  p_servicos text[],
  p_profissional text,
  p_agora timestamp,
  p_ignorar text default null
) returns jsonb language plpgsql stable set search_path = '' as $$
declare
  janela int := coalesce((public.config_de(p_tenant) #>> '{regras,janelaMaxDias}')::int, 45);
  dia date;
  v jsonb;
  r jsonb := '{}'::jsonb;
begin
  for i in 0 .. janela loop
    dia := p_agora::date + i;
    select jsonb_agg(jsonb_build_object('hora', x.hora, 'profissionalId', x.profissional_id) order by x.hora)
      into v
    from public.vagas_do_dia(p_tenant, p_servicos, p_profissional, dia, p_agora, p_ignorar, false) x;
    if v is not null then r := r || jsonb_build_object(dia::text, v); end if;
  end loop;
  return r;
end $$;

-- ---------------------------------------------------------------------
-- 5. Portas públicas (anon). Sempre: negócio ATIVO pelo slug; agendamento
--    só pelo token, e só dentro do negócio do endereço.
-- ---------------------------------------------------------------------

create or replace function public.negocio_json(t public.tenants, p_privado boolean)
returns jsonb language sql stable set search_path = '' as $$
  select (case when p_privado then cfg else cfg - 'metaMensal' end)
    || jsonb_build_object(
      'id', t.id, 'slug', t.slug, 'nome', t.nome, 'nicho', t.nicho, 'pele', t.pele,
      'tagline', coalesce(m.valor ->> 'tagline', ''), 'descricao', coalesce(m.valor ->> 'descricao', ''),
      'tema', coalesce(te.valor, '{}'::jsonb))
  from (select public.config_de(t.id) as cfg) c
  left join public.store_settings m on m.tenant_id = t.id and m.chave = 'marca'
  left join public.store_settings te on te.tenant_id = t.id and te.chave = 'tema'
$$;

/** Tudo o que a página do negócio mostra — nada de cliente, nada de agenda. */
create or replace function public.pagina_publica(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  t public.tenants;
begin
  select * into t from public.tenants where slug = lower(p_slug) and status = 'active';
  if t.id is null then return null; end if;
  return jsonb_build_object(
    'negocio', public.negocio_json(t, false),
    'categorias', coalesce((select jsonb_agg(public.categoria_json(c) order by c.ordem, c.id)
      from public.categorias c where c.tenant_id = t.id and not c.pausada), '[]'::jsonb),
    'servicos', coalesce((select jsonb_agg(public.servico_json(s) order by s.ordem, s.id)
      from public.servicos s where s.tenant_id = t.id and public.servico_visivel(s)), '[]'::jsonb),
    'profissionais', coalesce((select jsonb_agg(public.profissional_json(p, false) order by p.ordem, p.id)
      from public.profissionais p where p.tenant_id = t.id and p.ativo), '[]'::jsonb),
    'depoimentos', coalesce((select jsonb_agg(r.dados order by r.dados ->> 'data' desc)
      from public.registros r
      where r.tenant_id = t.id and r.colecao = 'depoimentos' and r.dados -> 'visivel' = 'true'::jsonb), '[]'::jsonb)
  );
end $$;

/** Vagas para o calendário do cliente. Com token (remarcar): os serviços e a profissional DAQUELE horário. */
create or replace function public.vagas_publicas(
  p_slug text,
  p_servicos text[],
  p_profissional text default null,
  p_token text default null
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  tid uuid;
  cfg jsonb;
  agora timestamp;
  ids text[];
  pro text := nullif(p_profissional, '');
  ag public.agendamentos;
begin
  select id into tid from public.tenants where slug = lower(p_slug) and status = 'active';
  if tid is null then return '{}'::jsonb; end if;
  cfg := public.config_de(tid);
  agora := date_trunc('minute', now() at time zone coalesce(cfg #>> '{regras,fuso}', 'America/Fortaleza'));
  if nullif(p_token, '') is not null then
    select * into ag from public.agendamentos a where a.tenant_id = tid and a.token = p_token;
    if ag.id is null then return '{}'::jsonb; end if;
    ids := array(select x ->> 'servicoId' from jsonb_array_elements(ag.itens) x);
    pro := ag.profissional_id;
  else
    ids := array(select distinct x from unnest(p_servicos) x where x is not null);
    if coalesce(cardinality(ids), 0) not between 1 and 10 then return '{}'::jsonb; end if;
    if exists (select 1 from unnest(ids) i where not exists (
        select 1 from public.servicos s where s.tenant_id = tid and s.id = i and public.servico_visivel(s))) then
      return '{}'::jsonb;
    end if;
    if not coalesce((cfg #>> '{regras,escolherProfissional}')::boolean, true) then pro := null; end if;
  end if;
  return public.vagas_da_janela(tid, ids, pro, agora, ag.id);
end $$;

/** Cupom digitado no agendamento: só os dados para o desconto, se estiver valendo. */
create or replace function public.cupom_publico(p_slug text, p_codigo text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  tid uuid;
  hoje text;
  r jsonb;
begin
  select id into tid from public.tenants where slug = lower(p_slug) and status = 'active';
  if tid is null or coalesce(btrim(p_codigo), '') = '' then return null; end if;
  hoje := (now() at time zone public.fuso_de(tid))::date::text;
  select x.dados into r from public.registros x
  where x.tenant_id = tid and x.colecao = 'cupons' and x.dados -> 'ativo' = 'true'::jsonb
    and upper(x.dados ->> 'codigo') = upper(btrim(p_codigo))
    and (coalesce(x.dados ->> 'validoAte', '') = '' or x.dados ->> 'validoAte' >= hoje)
  limit 1;
  if r is null then return null; end if;
  return jsonb_build_object('id', r ->> 'id', 'codigo', r ->> 'codigo', 'tipo', r ->> 'tipo',
    'valor', (r ->> 'valor')::numeric, 'ativo', true, 'validoAte', r ->> 'validoAte', 'usos', 0);
end $$;

/**
 * O agendamento pelo link. O PREÇO e a VAGA são decididos aqui, nunca por
 * quem pediu: o motor confere o horário (a mesma função que o mostrou) e a
 * sem_conflito segura a corrida de dois cliques no mesmo segundo.
 *
 * p_pedido: {servicosIds, profissionalId, data, hora, observacao, cupom,
 *            cliente: {nome, telefone, email, nascimento}}
 */
create or replace function public.agendar(p_slug text, p_pedido jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  tid uuid;
  cfg jsonb;
  fuso text;
  agora timestamp;
  ids text[];
  pro text;
  dia date;
  hora_pedida text := p_pedido ->> 'hora';
  nome text := btrim(regexp_replace(coalesce(p_pedido #>> '{cliente,nome}', ''), '\s+', ' ', 'g'));
  tel text := regexp_replace(coalesce(p_pedido #>> '{cliente,telefone}', ''), '\D', '', 'g');
  vaga record;
  cli public.clientes;
  atendimento int;
  intervalo int;
  total numeric;
  itens jsonb;
  desconto numeric := 0;
  cupom jsonb;
  sinal jsonb;
  pacote text;
  inicio timestamptz;
  novo public.agendamentos;
begin
  select id into tid from public.tenants where slug = lower(p_slug) and status = 'active';
  if tid is null then raise exception 'Negócio não encontrado.'; end if;
  cfg := public.config_de(tid);
  fuso := coalesce(cfg #>> '{regras,fuso}', 'America/Fortaleza');
  agora := date_trunc('minute', now() at time zone fuso);

  -- o pedido
  begin
    ids := array(select distinct x from jsonb_array_elements_text(p_pedido -> 'servicosIds') x);
    dia := (p_pedido ->> 'data')::date;
  exception when others then
    raise exception 'Pedido inválido.';
  end;
  if coalesce(cardinality(ids), 0) not between 1 and 10 then raise exception 'Escolha pelo menos um serviço.'; end if;
  if hora_pedida is null or hora_pedida !~ '^[0-2][0-9]:[0-5][0-9]$' then raise exception 'Horário inválido.'; end if;
  if char_length(nome) < 3 or char_length(nome) > 120 or nome !~ '\s' then
    raise exception 'Escreva nome e sobrenome.';
  end if;
  if char_length(tel) not between 10 and 13 then raise exception 'Confira o número com DDD.'; end if;
  if exists (select 1 from unnest(ids) i where not exists (
      select 1 from public.servicos s where s.tenant_id = tid and s.id = i and public.servico_visivel(s))) then
    raise exception 'Algum serviço escolhido não está mais disponível.';
  end if;
  if cardinality(ids) > 1 and not coalesce((cfg #>> '{regras,multiplosServicos}')::boolean, true) then
    raise exception 'Escolha um serviço por vez.';
  end if;
  pro := case when coalesce((cfg #>> '{regras,escolherProfissional}')::boolean, true)
              then nullif(p_pedido ->> 'profissionalId', '') end;

  -- a vaga: a MESMA função que mostrou o horário
  select * into vaga from public.vagas_do_dia(tid, ids, pro, dia, agora) v where v.hora = hora_pedida limit 1;
  if vaga.profissional_id is null then
    raise exception 'Esse horário acabou de ser ocupado. Escolha outro, por favor.' using errcode = 'P0001', hint = 'horario';
  end if;

  -- o cliente, reconhecido pelo telefone (o nome guardado não muda por aqui)
  select * into cli from public.clientes c
  where c.tenant_id = tid and c.telefone = tel order by c.criado_em limit 1;
  if cli.id is null then
    insert into public.clientes (tenant_id, id, nome, telefone, email, nascimento, origem)
    values (tid, 'cl_' || gen_random_uuid(), nome, tel,
            left(coalesce(p_pedido #>> '{cliente,email}', ''), 200),
            case when coalesce(p_pedido #>> '{cliente,nascimento}', '') ~ '^\d{4}-\d{2}-\d{2}$'
                 then (p_pedido #>> '{cliente,nascimento}')::date end,
            'online')
    returning * into cli;
  end if;

  -- freio contra abuso: o mesmo telefone com muitos horários em aberto
  if (select count(*) from public.agendamentos a
      where a.tenant_id = tid and a.cliente_id = cli.id and a.status in ('pendente', 'confirmado') and a.inicio > now()) >= 5 then
    raise exception 'Você já tem vários horários marcados. Fale com o negócio para marcar mais.';
  end if;

  -- preço e duração vêm do banco, congelados no agendamento
  select sum(s.duracao_min), max(s.intervalo_min), sum(s.preco),
         jsonb_agg(jsonb_build_object('servicoId', s.id, 'nome', s.nome, 'preco', s.preco, 'duracaoMin', s.duracao_min)
                   order by array_position(ids, s.id))
    into atendimento, intervalo, total, itens
  from public.servicos s where s.tenant_id = tid and s.id = any(ids);

  if coalesce(btrim(p_pedido ->> 'cupom'), '') <> '' then
    select x.dados into cupom from public.registros x
    where x.tenant_id = tid and x.colecao = 'cupons' and x.dados -> 'ativo' = 'true'::jsonb
      and upper(x.dados ->> 'codigo') = upper(btrim(p_pedido ->> 'cupom'))
      and (coalesce(x.dados ->> 'validoAte', '') = '' or x.dados ->> 'validoAte' >= agora::date::text)
    limit 1;
    if cupom is not null then
      desconto := case when cupom ->> 'tipo' = 'percentual'
                       then round(total * (cupom ->> 'valor')::numeric) / 100
                       else least(total, (cupom ->> 'valor')::numeric) end;
      update public.registros x
      set dados = jsonb_set(x.dados, '{usos}', to_jsonb(coalesce((x.dados ->> 'usos')::int, 0) + 1))
      where x.tenant_id = tid and x.colecao = 'cupons' and x.id = cupom ->> 'id';
    end if;
  end if;

  if coalesce((cfg #>> '{modulos,sinal}')::boolean, false)
     and exists (select 1 from jsonb_array_elements_text(coalesce(cfg #> '{sinal,servicosIds}', '[]'::jsonb)) x where x = any(ids)) then
    sinal := jsonb_build_object(
      'valor', round((total - desconto) * coalesce((cfg #>> '{sinal,percentual}')::numeric, 30) / 100),
      'pago', false);
  end if;

  -- pacote do cliente que cobre um dos serviços
  select pc.id into pacote
  from public.registros pc
  join public.registros p on p.tenant_id = pc.tenant_id and p.colecao = 'pacotes' and p.id = pc.dados ->> 'pacoteId'
  where pc.tenant_id = tid and pc.colecao = 'pacotesClientes' and pc.dados ->> 'clienteId' = cli.id
    and p.dados ->> 'servicoId' = any(ids)
    and coalesce((pc.dados ->> 'sessoesUsadas')::int, 0) < coalesce((p.dados ->> 'sessoes')::int, 0)
    and pc.dados ->> 'validoAte' >= dia::text
  limit 1;

  inicio := (dia + hora_pedida::time) at time zone fuso;
  begin
    insert into public.agendamentos (
      tenant_id, id, token, cliente_id, profissional_id, inicio, fim, intervalo_min, status, canal,
      itens, total, desconto, observacao, confirmado_em, sinal, pacote_cliente_id, cupom)
    values (
      tid, 'ag_' || gen_random_uuid(), public.novo_token(), cli.id, vaga.profissional_id,
      inicio, inicio + make_interval(mins => atendimento), intervalo,
      case when cfg #>> '{regras,confirmacao}' = 'manual' then 'pendente' else 'confirmado' end,
      'online', itens, total - desconto, desconto, left(coalesce(p_pedido ->> 'observacao', ''), 1000),
      case when cfg #>> '{regras,confirmacao}' = 'manual' then null else now() end,
      sinal, pacote, cupom ->> 'codigo')
    returning * into novo;
  exception when exclusion_violation then
    raise exception 'Esse horário acabou de ser ocupado. Escolha outro, por favor.' using errcode = 'P0001', hint = 'horario';
  end;

  -- o nome devolvido é o que a pessoa digitou: o telefone não revela o
  -- nome de ninguém
  return jsonb_build_object(
    'agendamento', public.agendamento_json(novo, fuso, false),
    'cliente', jsonb_build_object('id', cli.id, 'nome', nome));
end $$;

/** O link do cliente: o agendamento, o nome dele e o que a ficha precisa. */
create or replace function public.agendamento_publico(p_slug text, p_token text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  tid uuid;
  cfg jsonb;
  ag public.agendamentos;
  cli public.clientes;
begin
  select id into tid from public.tenants where slug = lower(p_slug) and status = 'active';
  if tid is null or coalesce(p_token, '') = '' then return null; end if;
  select * into ag from public.agendamentos a where a.tenant_id = tid and a.token = p_token;
  if ag.id is null then return null; end if;
  cfg := public.config_de(tid);
  select * into cli from public.clientes c where c.tenant_id = tid and c.id = ag.cliente_id;
  return jsonb_build_object(
    'agendamento', public.agendamento_json(ag, coalesce(cfg #>> '{regras,fuso}', 'America/Fortaleza'), false),
    'cliente', jsonb_build_object('id', cli.id, 'nome', cli.nome),
    'servicos', coalesce((select jsonb_agg(public.servico_json(s)) from public.servicos s
      where s.tenant_id = tid and s.id in (select x ->> 'servicoId' from jsonb_array_elements(ag.itens) x)), '[]'::jsonb),
    'modelosFicha', case when coalesce((cfg #>> '{modulos,anamnese}')::boolean, false) then
      coalesce((select jsonb_agg(r.dados) from public.registros r
        where r.tenant_id = tid and r.colecao = 'modelosFicha' and r.dados -> 'ativo' = 'true'::jsonb
          and r.id in (select s.ficha_id from public.servicos s
                       where s.tenant_id = tid and s.id in (select x ->> 'servicoId' from jsonb_array_elements(ag.itens) x))),
        '[]'::jsonb) else '[]'::jsonb end,
    -- só a ficha DESTE horário: o link não conta o histórico de ninguém
    'fichas', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'modeloId', r.dados ->> 'modeloId',
        'clienteId', r.dados ->> 'clienteId', 'agendamentoId', r.dados ->> 'agendamentoId',
        'respostas', '{}'::jsonb, 'preenchidaEm', r.dados ->> 'preenchidaEm', 'assinatura', ''))
      from public.registros r where r.tenant_id = tid and r.colecao = 'fichas' and r.dados ->> 'agendamentoId' = ag.id), '[]'::jsonb)
  );
end $$;

/** Pré-condição comum de cancelar e remarcar pelo link: ativo, futuro e dentro do prazo. */
create or replace function public.agendamento_do_link(p_slug text, p_token text, p_acao text)
returns public.agendamentos language plpgsql stable set search_path = '' as $$
declare
  tid uuid;
  ag public.agendamentos;
  prazo numeric;
begin
  select id into tid from public.tenants where slug = lower(p_slug) and status = 'active';
  if tid is null then raise exception 'Negócio não encontrado.'; end if;
  select * into ag from public.agendamentos a where a.tenant_id = tid and a.token = p_token;
  if ag.id is null then raise exception 'Link não encontrado.'; end if;
  if ag.status not in ('pendente', 'confirmado') or ag.inicio <= now() then
    raise exception 'Este horário não pode mais ser alterado pelo link.';
  end if;
  prazo := coalesce((public.config_de(tid) #>> '{regras,cancelamentoAteHoras}')::numeric, 0);
  if ag.inicio - now() < make_interval(mins => (prazo * 60)::int) then
    raise exception 'Faltam menos de % h para o horário. Para %, fale direto com o negócio.', prazo, p_acao;
  end if;
  return ag;
end $$;

create or replace function public.agendamento_cancelar(p_slug text, p_token text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  ag public.agendamentos := public.agendamento_do_link(p_slug, p_token, 'cancelar');
begin
  update public.agendamentos a
  set status = 'cancelado', cancelado_por = 'cliente', motivo_cancelamento = 'Cancelado pelo link'
  where a.tenant_id = ag.tenant_id and a.id = ag.id
  returning * into ag;
  return public.agendamento_json(ag, public.fuso_de(ag.tenant_id), false);
end $$;

create or replace function public.agendamento_remarcar(p_slug text, p_token text, p_data date, p_hora text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  ag public.agendamentos := public.agendamento_do_link(p_slug, p_token, 'remarcar');
  fuso text := public.fuso_de(ag.tenant_id);
  ids text[] := array(select x ->> 'servicoId' from jsonb_array_elements(ag.itens) x);
  duracao int := (select coalesce(sum((x ->> 'duracaoMin')::int), 0) from jsonb_array_elements(ag.itens) x);
  novo_inicio timestamptz;
begin
  if p_hora is null or p_hora !~ '^[0-2][0-9]:[0-5][0-9]$' then raise exception 'Horário inválido.'; end if;
  if not exists (
    select 1 from public.vagas_do_dia(ag.tenant_id, ids, ag.profissional_id, p_data,
                                      now() at time zone fuso, ag.id) v
    where v.hora = p_hora) then
    raise exception 'Esse horário acabou de ser ocupado. Escolha outro, por favor.' using errcode = 'P0001', hint = 'horario';
  end if;
  novo_inicio := (p_data + p_hora::time) at time zone fuso;
  begin
    update public.agendamentos a
    set inicio = novo_inicio, fim = novo_inicio + make_interval(mins => duracao), lembrete_em = null
    where a.tenant_id = ag.tenant_id and a.id = ag.id
    returning * into ag;
  exception when exclusion_violation then
    raise exception 'Esse horário acabou de ser ocupado. Escolha outro, por favor.' using errcode = 'P0001', hint = 'horario';
  end;
  return public.agendamento_json(ag, fuso, false);
end $$;

/** "Confirmar presença": só quando o negócio confirma sozinho e o horário espera o cliente. */
create or replace function public.agendamento_confirmar(p_slug text, p_token text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  tid uuid;
  ag public.agendamentos;
begin
  select id into tid from public.tenants where slug = lower(p_slug) and status = 'active';
  if tid is null then raise exception 'Negócio não encontrado.'; end if;
  update public.agendamentos a
  set status = 'confirmado', confirmado_em = now()
  where a.tenant_id = tid and a.token = p_token and a.status = 'pendente' and a.inicio > now()
    and coalesce(public.config_de(tid) #>> '{regras,confirmacao}', 'automatica') = 'automatica'
  returning * into ag;
  if ag.id is null then raise exception 'Este horário não pode ser confirmado pelo link.'; end if;
  return public.agendamento_json(ag, public.fuso_de(tid), false);
end $$;

/** Avaliação depois do atendimento: entra escondida, o dono aprova. Uma por horário. */
create or replace function public.agendamento_avaliar(p_slug text, p_token text, p_nota int, p_texto text)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  tid uuid;
  ag public.agendamentos;
  cli public.clientes;
  partes text[];
begin
  select id into tid from public.tenants where slug = lower(p_slug) and status = 'active';
  if tid is null then raise exception 'Negócio não encontrado.'; end if;
  if not coalesce((public.config_de(tid) #>> '{modulos,avaliacoes}')::boolean, false) then
    raise exception 'Avaliações desligadas.';
  end if;
  select * into ag from public.agendamentos a where a.tenant_id = tid and a.token = p_token and a.status = 'concluido';
  if ag.id is null then raise exception 'Só dá para avaliar depois do atendimento.'; end if;
  if p_nota not between 1 and 5 then raise exception 'Nota de 1 a 5.'; end if;
  select * into cli from public.clientes c where c.tenant_id = tid and c.id = ag.cliente_id;
  partes := regexp_split_to_array(btrim(cli.nome), '\s+');
  insert into public.registros (tenant_id, colecao, id, dados) values (tid, 'depoimentos', 'dp_' || ag.id,
    jsonb_build_object(
      'id', 'dp_' || ag.id,
      'nome', partes[1] || case when cardinality(partes) > 1 then ' ' || left(partes[cardinality(partes)], 1) || '.' else '' end,
      'texto', coalesce(nullif(left(btrim(coalesce(p_texto, '')), 500), ''), 'Ótimo atendimento.'),
      'nota', p_nota,
      'data', (now() at time zone public.fuso_de(tid))::date::text,
      'servico', coalesce(ag.itens -> 0 ->> 'nome', ''),
      'visivel', false))
  on conflict (tenant_id, colecao, id) do nothing;
end $$;

/** Ficha de anamnese preenchida pelo cliente: dado de SAÚDE, só a equipe lê depois. */
create or replace function public.ficha_enviar(p_slug text, p_token text, p_respostas jsonb, p_assinatura text)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  tid uuid;
  ag public.agendamentos;
  modelo text;
begin
  select id into tid from public.tenants where slug = lower(p_slug) and status = 'active';
  if tid is null then raise exception 'Negócio não encontrado.'; end if;
  if not coalesce((public.config_de(tid) #>> '{modulos,anamnese}')::boolean, false) then
    raise exception 'Ficha desligada.';
  end if;
  select * into ag from public.agendamentos a where a.tenant_id = tid and a.token = p_token;
  if ag.id is null then raise exception 'Link não encontrado.'; end if;
  select r.id into modelo from public.registros r
  where r.tenant_id = tid and r.colecao = 'modelosFicha' and r.dados -> 'ativo' = 'true'::jsonb
    and r.id in (select s.ficha_id from public.servicos s
                 where s.tenant_id = tid and s.id in (select x ->> 'servicoId' from jsonb_array_elements(ag.itens) x))
  limit 1;
  if modelo is null then raise exception 'Nenhuma ficha para preencher.'; end if;
  if jsonb_typeof(p_respostas) <> 'object' or pg_column_size(p_respostas) > 65536 then
    raise exception 'Respostas inválidas.';
  end if;
  if char_length(btrim(coalesce(p_assinatura, ''))) not between 3 and 120 then raise exception 'Assine com nome e sobrenome.'; end if;
  insert into public.registros (tenant_id, colecao, id, dados) values (tid, 'fichas', 'fc_' || ag.id,
    jsonb_build_object(
      'id', 'fc_' || ag.id, 'modeloId', modelo, 'clienteId', ag.cliente_id, 'agendamentoId', ag.id,
      'respostas', p_respostas, 'preenchidaEm', public.parede(now(), public.fuso_de(tid)),
      'assinatura', btrim(p_assinatura)))
  on conflict (tenant_id, colecao, id) do update set dados = excluded.dados;
end $$;

-- ---------------------------------------------------------------------
-- 6. Portas do painel
--    painel_dados e painel_salvar rodam como QUEM CHAMOU (security
--    invoker): cada linha lida ou gravada passa pela RLS acima. A
--    identidade do negócio (nome, aparência) mora em tenants, que só a
--    plataforma altera — por isso negocio_salvar é definer, com a
--    checagem de papel explícita.
-- ---------------------------------------------------------------------

create or replace function public.negocio_salvar(p_tenant uuid, p_negocio jsonb)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  n jsonb := p_negocio;
  fuso text := coalesce(p_negocio #>> '{regras,fuso}', 'America/Fortaleza');
  tema jsonb;
  cfg jsonb;
begin
  if not public.has_role(p_tenant, 'owner', 'admin') then
    raise exception 'Só o dono ou um administrador muda os dados do negócio.' using errcode = '42501';
  end if;
  if jsonb_typeof(n) is distinct from 'object' then raise exception 'Dados do negócio inválidos.'; end if;
  if char_length(coalesce(n ->> 'nome', '')) not between 2 and 80 then
    raise exception 'O nome do negócio precisa ter de 2 a 80 letras.';
  end if;
  if coalesce(n ->> 'pele', '') not in ('beleza', 'barbearia', 'delicada', 'generica') then
    raise exception 'Aparência inválida.';
  end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = fuso) then
    raise exception 'Fuso inválido.';
  end if;
  if coalesce((n #>> '{regras,intervaloSlotsMin}')::int, 15) not between 5 and 240
     or coalesce((n #>> '{regras,janelaMaxDias}')::int, 45) not between 1 and 365
     or coalesce((n #>> '{regras,antecedenciaMinHoras}')::numeric, 0) not between 0 and 720
     or coalesce((n #>> '{regras,cancelamentoAteHoras}')::numeric, 0) not between 0 and 720 then
    raise exception 'Regras de agendamento fora do limite.';
  end if;
  -- só as 7 cores, e só no formato #rrggbb
  select coalesce(jsonb_object_agg(k, n -> 'tema' ->> k), '{}'::jsonb) into tema
  from unnest(array['marca','sobreMarca','fundo','superficie','texto','textoSuave','acento']) k
  where coalesce(n -> 'tema' ->> k, '') ~ '^#[0-9a-fA-F]{6}$';
  cfg := n - array['id', 'slug', 'nome', 'nicho', 'pele', 'tagline', 'descricao', 'tema'];
  if pg_column_size(cfg) > 2097152 then raise exception 'Imagens grandes demais para a página.'; end if;

  update public.tenants set nome = n ->> 'nome', pele = n ->> 'pele' where id = p_tenant;
  insert into public.store_settings (tenant_id, chave, valor) values
    (p_tenant, 'marca', jsonb_build_object(
      'tagline', left(coalesce(n ->> 'tagline', ''), 160), 'descricao', left(coalesce(n ->> 'descricao', ''), 600))),
    (p_tenant, 'tema', tema),
    (p_tenant, 'config', cfg)
  on conflict (tenant_id, chave) do update set valor = excluded.valor;
end $$;

/** Tudo do negócio para o painel, no formato do app. A RLS decide o que cada papel lê. */
create or replace function public.painel_dados(p_slug text)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  t public.tenants;
  fuso text;
begin
  select * into t from public.tenants where slug = lower(p_slug) and status = 'active';
  if t.id is null or not public.is_member(t.id) then
    raise exception 'Sem acesso a este negócio.' using errcode = '42501';
  end if;
  fuso := public.fuso_de(t.id);
  return jsonb_build_object(
    'negocio', public.negocio_json(t, true),
    'categorias', coalesce((select jsonb_agg(public.categoria_json(c) order by c.ordem, c.id)
      from public.categorias c where c.tenant_id = t.id), '[]'::jsonb),
    'servicos', coalesce((select jsonb_agg(public.servico_json(s) order by s.ordem, s.id)
      from public.servicos s where s.tenant_id = t.id), '[]'::jsonb),
    'profissionais', coalesce((select jsonb_agg(public.profissional_json(p, true) order by p.ordem, p.id)
      from public.profissionais p where p.tenant_id = t.id), '[]'::jsonb),
    'bloqueios', coalesce((select jsonb_agg(public.bloqueio_json(b, fuso) order by b.inicio)
      from public.bloqueios b where b.tenant_id = t.id), '[]'::jsonb),
    'clientes', coalesce((select jsonb_agg(public.cliente_json(c, fuso) order by c.criado_em, c.id)
      from public.clientes c where c.tenant_id = t.id), '[]'::jsonb),
    'agendamentos', coalesce((select jsonb_agg(public.agendamento_json(a, fuso, true) order by a.inicio)
      from public.agendamentos a where a.tenant_id = t.id), '[]'::jsonb),
    'registros', coalesce((select jsonb_agg(jsonb_build_object('colecao', r.colecao, 'id', r.id, 'dados', r.dados))
      from public.registros r where r.tenant_id = t.id), '[]'::jsonb)
  );
end $$;

/**
 * Grava um LOTE de mudanças do painel, tudo ou nada.
 * p_lote: {negocio?, categorias?: {salvar: [...], remover: [ids]}, servicos?, profissionais?,
 *          bloqueios?, clientes?, agendamentos?, registros?: {salvar: [{colecao,id,dados}], remover: [{colecao,id}]}}
 */
create or replace function public.painel_salvar(p_slug text, p_lote jsonb)
returns jsonb language plpgsql volatile security invoker set search_path = '' as $$
declare
  tid uuid;
  fuso text;
begin
  select id into tid from public.tenants where slug = lower(p_slug) and status = 'active';
  if tid is null or not public.is_member(tid) then
    raise exception 'Sem acesso a este negócio.' using errcode = '42501';
  end if;
  if p_lote ? 'negocio' then perform public.negocio_salvar(tid, p_lote -> 'negocio'); end if;
  fuso := public.fuso_de(tid);

  insert into public.categorias as c (tenant_id, id, nome, descricao, ordem, pausada)
  select tid, x ->> 'id', x ->> 'nome', coalesce(x ->> 'descricao', ''), coalesce((x ->> 'ordem')::int, 0),
         coalesce((x ->> 'pausada')::boolean, false)
  from jsonb_array_elements(coalesce(p_lote #> '{categorias,salvar}', '[]'::jsonb)) x
  on conflict (tenant_id, id) do update set
    nome = excluded.nome, descricao = excluded.descricao, ordem = excluded.ordem, pausada = excluded.pausada;

  insert into public.servicos as s (tenant_id, id, categoria_id, nome, descricao, duracao_min, intervalo_min, preco,
    modo_preco, online, ativo, pausado, destaque, ordem, retorno_dias, ficha_id, foto_url)
  select tid, x ->> 'id', nullif(x ->> 'categoriaId', ''), coalesce(x ->> 'nome', ''), coalesce(x ->> 'descricao', ''),
         (x ->> 'duracaoMin')::int, coalesce((x ->> 'intervaloMin')::int, 0), coalesce((x ->> 'preco')::numeric, 0),
         coalesce(x ->> 'modoPreco', 'fixo'), coalesce((x ->> 'online')::boolean, true),
         coalesce((x ->> 'ativo')::boolean, true), coalesce((x ->> 'pausado')::boolean, false),
         coalesce((x ->> 'destaque')::boolean, false), coalesce((x ->> 'ordem')::int, 0),
         (x ->> 'retornoDias')::int, nullif(x ->> 'fichaId', ''), nullif(x ->> 'fotoUrl', '')
  from jsonb_array_elements(coalesce(p_lote #> '{servicos,salvar}', '[]'::jsonb)) x
  on conflict (tenant_id, id) do update set
    categoria_id = excluded.categoria_id, nome = excluded.nome, descricao = excluded.descricao,
    duracao_min = excluded.duracao_min, intervalo_min = excluded.intervalo_min, preco = excluded.preco,
    modo_preco = excluded.modo_preco, online = excluded.online, ativo = excluded.ativo, pausado = excluded.pausado,
    destaque = excluded.destaque, ordem = excluded.ordem, retorno_dias = excluded.retorno_dias,
    ficha_id = excluded.ficha_id, foto_url = excluded.foto_url;

  insert into public.profissionais as p (tenant_id, id, nome, cargo, bio, cor, foto_url, comissao_pct, ativo, ordem,
    servicos_ids, horario, acesso)
  select tid, x ->> 'id', coalesce(x ->> 'nome', ''), coalesce(x ->> 'cargo', ''), coalesce(x ->> 'bio', ''),
         coalesce((x ->> 'cor')::int, 0), nullif(x ->> 'fotoUrl', ''), coalesce((x ->> 'comissaoPct')::numeric, 0),
         coalesce((x ->> 'ativo')::boolean, true), coalesce((x ->> 'ordem')::int, 0),
         array(select jsonb_array_elements_text(coalesce(x -> 'servicosIds', '[]'::jsonb))),
         coalesce(x -> 'horario', '{}'::jsonb), case when jsonb_typeof(x -> 'acesso') = 'object' then x -> 'acesso' end
  from jsonb_array_elements(coalesce(p_lote #> '{profissionais,salvar}', '[]'::jsonb)) x
  on conflict (tenant_id, id) do update set
    nome = excluded.nome, cargo = excluded.cargo, bio = excluded.bio, cor = excluded.cor, foto_url = excluded.foto_url,
    comissao_pct = excluded.comissao_pct, ativo = excluded.ativo, ordem = excluded.ordem,
    servicos_ids = excluded.servicos_ids, horario = excluded.horario, acesso = excluded.acesso;

  insert into public.clientes as c (tenant_id, id, nome, telefone, email, nascimento, observacoes, tags, origem,
    consentimento_whats, criado_em)
  select tid, x ->> 'id', x ->> 'nome', regexp_replace(coalesce(x ->> 'telefone', ''), '\D', '', 'g'),
         coalesce(x ->> 'email', ''), nullif(x ->> 'nascimento', '')::date, coalesce(x ->> 'observacoes', ''),
         array(select jsonb_array_elements_text(coalesce(x -> 'tags', '[]'::jsonb))),
         coalesce(x ->> 'origem', 'painel'), coalesce((x ->> 'consentimentoWhats')::boolean, true),
         coalesce(public.de_parede(x ->> 'criadoEm', fuso), now())
  from jsonb_array_elements(coalesce(p_lote #> '{clientes,salvar}', '[]'::jsonb)) x
  on conflict (tenant_id, id) do update set
    nome = excluded.nome, telefone = excluded.telefone, email = excluded.email, nascimento = excluded.nascimento,
    observacoes = excluded.observacoes, tags = excluded.tags, origem = excluded.origem,
    consentimento_whats = excluded.consentimento_whats;

  insert into public.bloqueios as b (tenant_id, id, profissional_id, inicio, fim, motivo)
  select tid, x ->> 'id', nullif(x ->> 'profissionalId', ''), public.de_parede(x ->> 'inicio', fuso),
         public.de_parede(x ->> 'fim', fuso), coalesce(x ->> 'motivo', '')
  from jsonb_array_elements(coalesce(p_lote #> '{bloqueios,salvar}', '[]'::jsonb)) x
  on conflict (tenant_id, id) do update set
    profissional_id = excluded.profissional_id, inicio = excluded.inicio, fim = excluded.fim, motivo = excluded.motivo;

  begin
    insert into public.agendamentos as a (tenant_id, id, token, cliente_id, profissional_id, inicio, fim, intervalo_min,
      status, canal, itens, total, desconto, observacao, criado_em, confirmado_em, lembrete_em, cancelado_por,
      motivo_cancelamento, pagamento, sinal, pacote_cliente_id, cupom)
    select tid, x ->> 'id', x ->> 'token', x ->> 'clienteId', x ->> 'profissionalId',
           public.de_parede(x ->> 'inicio', fuso), public.de_parede(x ->> 'fim', fuso),
           coalesce((x ->> 'intervaloMin')::int, 0), coalesce(x ->> 'status', 'confirmado'), coalesce(x ->> 'canal', 'painel'),
           coalesce(x -> 'itens', '[]'::jsonb), coalesce((x ->> 'total')::numeric, 0), coalesce((x ->> 'desconto')::numeric, 0),
           coalesce(x ->> 'observacao', ''), coalesce(public.de_parede(x ->> 'criadoEm', fuso), now()),
           public.de_parede(x ->> 'confirmadoEm', fuso), public.de_parede(x ->> 'lembreteEm', fuso),
           nullif(x ->> 'canceladoPor', ''), coalesce(x ->> 'motivoCancelamento', ''),
           case when jsonb_typeof(x -> 'pagamento') = 'object' then x -> 'pagamento' end,
           case when jsonb_typeof(x -> 'sinal') = 'object' then x -> 'sinal' end,
           nullif(x ->> 'pacoteClienteId', ''), nullif(x ->> 'cupom', '')
    from jsonb_array_elements(coalesce(p_lote #> '{agendamentos,salvar}', '[]'::jsonb)) x
    on conflict (tenant_id, id) do update set
      cliente_id = excluded.cliente_id, profissional_id = excluded.profissional_id, inicio = excluded.inicio,
      fim = excluded.fim, intervalo_min = excluded.intervalo_min, status = excluded.status, canal = excluded.canal,
      itens = excluded.itens, total = excluded.total, desconto = excluded.desconto, observacao = excluded.observacao,
      confirmado_em = excluded.confirmado_em, lembrete_em = excluded.lembrete_em,
      cancelado_por = excluded.cancelado_por, motivo_cancelamento = excluded.motivo_cancelamento,
      pagamento = excluded.pagamento, sinal = excluded.sinal, pacote_cliente_id = excluded.pacote_cliente_id,
      cupom = excluded.cupom;
  exception when exclusion_violation then
    raise exception 'Esse horário acabou de ser ocupado. Escolha outro, por favor.' using errcode = 'P0001', hint = 'horario';
  end;

  insert into public.registros as r (tenant_id, colecao, id, dados)
  select tid, x ->> 'colecao', x ->> 'id', x -> 'dados'
  from jsonb_array_elements(coalesce(p_lote #> '{registros,salvar}', '[]'::jsonb)) x
  on conflict (tenant_id, colecao, id) do update set dados = excluded.dados;

  -- remoções, na ordem inversa das dependências
  delete from public.registros r
  using jsonb_array_elements(coalesce(p_lote #> '{registros,remover}', '[]'::jsonb)) x
  where r.tenant_id = tid and r.colecao = x ->> 'colecao' and r.id = x ->> 'id';
  delete from public.bloqueios b where b.tenant_id = tid
    and b.id in (select jsonb_array_elements_text(coalesce(p_lote #> '{bloqueios,remover}', '[]'::jsonb)));
  delete from public.clientes c where c.tenant_id = tid
    and c.id in (select jsonb_array_elements_text(coalesce(p_lote #> '{clientes,remover}', '[]'::jsonb)));
  delete from public.profissionais p where p.tenant_id = tid
    and p.id in (select jsonb_array_elements_text(coalesce(p_lote #> '{profissionais,remover}', '[]'::jsonb)));
  delete from public.servicos s where s.tenant_id = tid
    and s.id in (select jsonb_array_elements_text(coalesce(p_lote #> '{servicos,remover}', '[]'::jsonb)));
  delete from public.categorias c where c.tenant_id = tid
    and c.id in (select jsonb_array_elements_text(coalesce(p_lote #> '{categorias,remover}', '[]'::jsonb)));

  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------------
-- 7. Quem executa o quê. O Supabase dá EXECUTE a todos por padrão:
--    fecha tudo e abre só o necessário.
-- ---------------------------------------------------------------------

revoke execute on function
  public.agendamento_ocupacao(),
  public.config_de(uuid), public.fuso_de(uuid), public.parede(timestamptz, text), public.de_parede(text, text),
  public.hora_do_min(int), public.min_do_dia(text), public.novo_token(),
  public.categoria_json(public.categorias), public.servico_json(public.servicos),
  public.profissional_json(public.profissionais, boolean), public.bloqueio_json(public.bloqueios, text),
  public.cliente_json(public.clientes, text), public.agendamento_json(public.agendamentos, text, boolean),
  public.servico_visivel(public.servicos), public.negocio_json(public.tenants, boolean),
  public.janelas_do_dia(jsonb, jsonb, date),
  public.vagas_do_dia(uuid, text[], text, date, timestamp, text, boolean),
  public.vagas_da_janela(uuid, text[], text, timestamp, text),
  public.agendamento_do_link(text, text, text),
  public.pagina_publica(text), public.vagas_publicas(text, text[], text, text), public.cupom_publico(text, text),
  public.agendar(text, jsonb), public.agendamento_publico(text, text),
  public.agendamento_cancelar(text, text), public.agendamento_remarcar(text, text, date, text),
  public.agendamento_confirmar(text, text), public.agendamento_avaliar(text, text, int, text),
  public.ficha_enviar(text, text, jsonb, text),
  public.negocio_salvar(uuid, jsonb), public.painel_dados(text), public.painel_salvar(text, jsonb)
from public, anon, authenticated;

-- a página pública (anon) e quem está logado olhando a página
grant execute on function
  public.pagina_publica(text), public.vagas_publicas(text, text[], text, text), public.cupom_publico(text, text),
  public.agendar(text, jsonb), public.agendamento_publico(text, text),
  public.agendamento_cancelar(text, text), public.agendamento_remarcar(text, text, date, text),
  public.agendamento_confirmar(text, text), public.agendamento_avaliar(text, text, int, text),
  public.ficha_enviar(text, text, jsonb, text)
to anon, authenticated;

-- o painel: as portas e as peças que elas usam rodando como a pessoa
grant execute on function
  public.painel_dados(text), public.painel_salvar(text, jsonb), public.negocio_salvar(uuid, jsonb),
  public.config_de(uuid), public.fuso_de(uuid), public.parede(timestamptz, text), public.de_parede(text, text),
  public.categoria_json(public.categorias), public.servico_json(public.servicos),
  public.profissional_json(public.profissionais, boolean), public.bloqueio_json(public.bloqueios, text),
  public.cliente_json(public.clientes, text), public.agendamento_json(public.agendamentos, text, boolean),
  public.negocio_json(public.tenants, boolean)
to authenticated;

-- ---------------------------------------------------------------------
-- 8. DepiLED: o catálogo e a agenda saem do código (lib/sementes) e
--    passam a morar aqui. Gerado de lib/sementes/depiled.ts — só dado
--    público. Expediente: um sábado por mês, 08h–14h (confirmado pelo
--    Pedro em 09/10/2026); o próximo dia entra pelo painel.
-- ---------------------------------------------------------------------

insert into public.categorias (tenant_id, id, nome, descricao, ordem, pausada) values
  ('ab00de9b-81fa-4a2e-a084-948f77eda90e', 'dp_cat_feminino', 'Procedimentos Femininos', '', 0, false),
  ('ab00de9b-81fa-4a2e-a084-948f77eda90e', 'dp_cat_masculino', 'Procedimentos Masculinos', '', 1, false),
  ('ab00de9b-81fa-4a2e-a084-948f77eda90e', 'dp_cat_combos', 'Combos', 'Duas áreas com valor promocional', 2, false)
on conflict (tenant_id, id) do nothing;

insert into public.servicos (tenant_id, id, categoria_id, nome, descricao, duracao_min, intervalo_min, preco, modo_preco, online, ativo, pausado, destaque, ordem) values
  ('ab00de9b-81fa-4a2e-a084-948f77eda90e', 'dp_abdome', 'dp_cat_feminino', 'Abdome', 'Remoção definitiva dos pelos na região abdominal, com suavidade e segurança.', 10, 0, 90, 'fixo', true, true, false, false, 0),
  ('ab00de9b-81fa-4a2e-a084-948f77eda90e', 'dp_antebracos', 'dp_cat_feminino', 'Antebraços', 'Remoção definitiva dos pelos dos antebraços, com suavidade e segurança.', 10, 0, 60, 'fixo', true, true, false, false, 1),
  ('ab00de9b-81fa-4a2e-a084-948f77eda90e', 'dp_axilas', 'dp_cat_feminino', 'Axilas', 'Remoção definitiva dos pelos das axilas, com suavidade e segurança.', 5, 0, 55, 'fixo', true, true, false, true, 2),
  ('ab00de9b-81fa-4a2e-a084-948f77eda90e', 'dp_axilas_virilha_simples', 'dp_cat_feminino', 'Axilas + Virilha Simples', 'Axilas e virilha simples na mesma sessão.', 10, 0, 100, 'fixo', true, true, false, false, 3),
  ('ab00de9b-81fa-4a2e-a084-948f77eda90e', 'dp_bracos_completos', 'dp_cat_feminino', 'Braços Completos', 'Remoção definitiva dos pelos dos braços inteiros, com suavidade e segurança.', 10, 0, 110, 'fixo', true, true, false, false, 4),
  ('ab00de9b-81fa-4a2e-a084-948f77eda90e', 'dp_buco', 'dp_cat_feminino', 'Buço', 'Remoção definitiva dos pelos do buço, com cuidado com a pele do rosto.', 5, 0, 45, 'fixo', true, true, false, false, 5),
  ('ab00de9b-81fa-4a2e-a084-948f77eda90e', 'dp_corpo_todo_fem', 'dp_cat_feminino', 'Corpo Todo - Feminino', 'Todas as áreas do corpo em uma única sessão.', 30, 0, 300, 'fixo', true, true, false, false, 6),
  ('ab00de9b-81fa-4a2e-a084-948f77eda90e', 'dp_costas', 'dp_cat_feminino', 'Costas', 'Remoção definitiva dos pelos das costas, com suavidade e segurança.', 10, 0, 120, 'fixo', true, true, false, false, 7),
  ('ab00de9b-81fa-4a2e-a084-948f77eda90e', 'dp_coxas', 'dp_cat_feminino', 'Coxas', 'Remoção definitiva dos pelos das coxas, com suavidade e segurança.', 10, 0, 80, 'fixo', true, true, false, false, 8),
  ('ab00de9b-81fa-4a2e-a084-948f77eda90e', 'dp_meia_perna', 'dp_cat_feminino', 'Meia Perna', 'Remoção definitiva dos pelos do joelho ao tornozelo.', 10, 0, 70, 'fixo', true, true, false, false, 9),
  ('ab00de9b-81fa-4a2e-a084-948f77eda90e', 'dp_meio_bracos', 'dp_cat_feminino', 'Meio Braços', 'Remoção definitiva dos pelos de meio braço, com suavidade e segurança.', 10, 0, 70, 'fixo', true, true, false, false, 10),
  ('ab00de9b-81fa-4a2e-a084-948f77eda90e', 'dp_perna_completa', 'dp_cat_feminino', 'Perna Completa', 'Remoção definitiva dos pelos das pernas inteiras, coxas e canelas.', 10, 0, 140, 'fixo', true, true, false, true, 11),
  ('ab00de9b-81fa-4a2e-a084-948f77eda90e', 'dp_seios', 'dp_cat_feminino', 'Seios', 'Remoção definitiva dos pelos da região dos seios, com delicadeza.', 10, 0, 80, 'fixo', true, true, false, false, 12),
  ('ab00de9b-81fa-4a2e-a084-948f77eda90e', 'dp_virilha_completa', 'dp_cat_feminino', 'Virilha Completa', 'Remoção definitiva dos pelos de toda a virilha, com suavidade e segurança.', 10, 0, 90, 'fixo', true, true, false, true, 13),
  ('ab00de9b-81fa-4a2e-a084-948f77eda90e', 'dp_virilha_completa_fio', 'dp_cat_feminino', 'Virilha Completa com Fio', 'Virilha completa, incluindo a região do fio.', 10, 0, 110, 'fixo', true, true, false, false, 14),
  ('ab00de9b-81fa-4a2e-a084-948f77eda90e', 'dp_virilha_simples', 'dp_cat_feminino', 'Virilha Simples', 'Remoção definitiva dos pelos das laterais da virilha.', 10, 0, 70, 'fixo', true, true, false, false, 15),
  ('ab00de9b-81fa-4a2e-a084-948f77eda90e', 'dp_antebracos_masc', 'dp_cat_masculino', 'Antebraços - Masculino', 'Remoção definitiva dos pelos dos antebraços.', 10, 0, 60, 'fixo', true, true, false, false, 16),
  ('ab00de9b-81fa-4a2e-a084-948f77eda90e', 'dp_axilas_masc', 'dp_cat_masculino', 'Axilas - Masculino', 'Remoção definitiva dos pelos das axilas.', 5, 0, 55, 'fixo', true, true, false, false, 17),
  ('ab00de9b-81fa-4a2e-a084-948f77eda90e', 'dp_barba_completa', 'dp_cat_masculino', 'Barba Completa', 'Remoção definitiva dos pelos da barba, com suavidade e segurança.', 10, 0, 80, 'fixo', true, true, false, false, 18),
  ('ab00de9b-81fa-4a2e-a084-948f77eda90e', 'dp_bigode', 'dp_cat_masculino', 'Bigode', 'Remoção definitiva dos pelos do bigode.', 5, 0, 45, 'fixo', true, true, false, false, 19),
  ('ab00de9b-81fa-4a2e-a084-948f77eda90e', 'dp_bracos_completos_masc', 'dp_cat_masculino', 'Braços Completos - Masculino', 'Remoção definitiva dos pelos dos braços inteiros.', 10, 0, 110, 'fixo', true, true, false, false, 20),
  ('ab00de9b-81fa-4a2e-a084-948f77eda90e', 'dp_contorno_barba', 'dp_cat_masculino', 'Contorno de Barba', 'Remoção definitiva dos pelos do contorno da barba e do pescoço.', 10, 0, 55, 'fixo', true, true, false, false, 21),
  ('ab00de9b-81fa-4a2e-a084-948f77eda90e', 'dp_meio_bracos_masc', 'dp_cat_masculino', 'Meio Braços - Masculino', 'Remoção definitiva dos pelos de meio braço.', 10, 0, 70, 'fixo', true, true, false, false, 22),
  ('ab00de9b-81fa-4a2e-a084-948f77eda90e', 'dp_peitoral', 'dp_cat_masculino', 'Peitoral', 'Remoção definitiva dos pelos do peitoral.', 30, 0, 100, 'fixo', true, true, false, false, 23),
  ('ab00de9b-81fa-4a2e-a084-948f77eda90e', 'dp_superior_completo', 'dp_cat_masculino', 'Superior Completo - Costas, Abdome e Peitoral', 'Costas, abdome e peitoral na mesma sessão.', 30, 0, 250, 'fixo', true, true, false, false, 24),
  ('ab00de9b-81fa-4a2e-a084-948f77eda90e', 'dp_axila_barba', 'dp_cat_combos', 'Axila + Barba Completa', 'Axilas e barba completa na mesma sessão, com valor promocional.', 10, 0, 110, 'fixo', true, true, false, false, 25),
  ('ab00de9b-81fa-4a2e-a084-948f77eda90e', 'dp_axila_bigode', 'dp_cat_combos', 'Axila + Bigode', 'Axilas e bigode na mesma sessão, com valor promocional.', 10, 0, 80, 'fixo', true, true, false, false, 26),
  ('ab00de9b-81fa-4a2e-a084-948f77eda90e', 'dp_axila_buco', 'dp_cat_combos', 'Axila + Buço', 'Axilas e buço na mesma sessão, com valor promocional.', 10, 0, 80, 'fixo', true, true, false, false, 27),
  ('ab00de9b-81fa-4a2e-a084-948f77eda90e', 'dp_axila_contorno', 'dp_cat_combos', 'Axila + Contorno de Barba', 'Axilas e contorno de barba na mesma sessão, com valor promocional.', 10, 0, 90, 'fixo', true, true, false, false, 28),
  ('ab00de9b-81fa-4a2e-a084-948f77eda90e', 'dp_axila_virilha', 'dp_cat_combos', 'Axila + Virilha Completa', 'Axilas e virilha completa na mesma sessão, com valor promocional.', 10, 0, 120, 'fixo', true, true, false, true, 29),
  ('ab00de9b-81fa-4a2e-a084-948f77eda90e', 'dp_axila_virilha_fio', 'dp_cat_combos', 'Axila + Virilha Completa com Fio', 'Axilas e virilha completa com fio na mesma sessão, com valor promocional.', 10, 0, 140, 'fixo', true, true, false, false, 30),
  ('ab00de9b-81fa-4a2e-a084-948f77eda90e', 'dp_aureola', null, 'Auréola', 'Remoção definitiva dos pelos ao redor da auréola.', 5, 0, 20, 'fixo', false, true, false, false, 31),
  ('ab00de9b-81fa-4a2e-a084-948f77eda90e', 'dp_meia_perna_virilha', null, 'Meia Perna + Virilha Completa', 'Meia perna e virilha completa na mesma sessão.', 25, 0, 160, 'fixo', false, true, false, false, 32),
  ('ab00de9b-81fa-4a2e-a084-948f77eda90e', 'dp_virilha_parceria', null, 'Virilha Completa Parceria', 'Virilha completa com valor de parceria.', 10, 0, 50, 'fixo', false, true, false, false, 33)
on conflict (tenant_id, id) do nothing;

insert into public.profissionais (tenant_id, id, nome, cargo, bio, cor, comissao_pct, ativo, ordem, servicos_ids, horario) values
  ('ab00de9b-81fa-4a2e-a084-948f77eda90e', 'dp_agenda', 'DepiLED', 'Atendimento', '', 0, 0, true, 0,
   array['dp_abdome', 'dp_antebracos', 'dp_axilas', 'dp_axilas_virilha_simples', 'dp_bracos_completos', 'dp_buco', 'dp_corpo_todo_fem', 'dp_costas', 'dp_coxas', 'dp_meia_perna', 'dp_meio_bracos', 'dp_perna_completa', 'dp_seios', 'dp_virilha_completa', 'dp_virilha_completa_fio', 'dp_virilha_simples', 'dp_antebracos_masc', 'dp_axilas_masc', 'dp_barba_completa', 'dp_bigode', 'dp_bracos_completos_masc', 'dp_contorno_barba', 'dp_meio_bracos_masc', 'dp_peitoral', 'dp_superior_completo', 'dp_axila_barba', 'dp_axila_bigode', 'dp_axila_buco', 'dp_axila_contorno', 'dp_axila_virilha', 'dp_axila_virilha_fio', 'dp_aureola', 'dp_meia_perna_virilha', 'dp_virilha_parceria'],
   '{"0":[],"1":[],"2":[],"3":[],"4":[],"5":[],"6":[]}'::jsonb)
on conflict (tenant_id, id) do nothing;

insert into public.store_settings (tenant_id, chave, valor) values
  ('ab00de9b-81fa-4a2e-a084-948f77eda90e', 'config', '{"sobre":"","destaques":["Sessões de 5 a 30 minutos","Femininos e masculinos","Combos com valor promocional"],"logoUrl":"/marcas/depiled/simbolo.png","logoCompletoUrl":"/marcas/depiled/logo.png","capaUrl":null,"galeria":[],"contato":{"whatsapp":"","instagram":"","telefone":"","email":""},"endereco":{"cep":"","rua":"","numero":"","complemento":"","bairro":"","cidade":"","uf":"CE","referencia":""},"horario":{"0":[],"1":[],"2":[],"3":[],"4":[],"5":[],"6":[]},"aberturas":[{"data":"2026-10-10","inicio":"08:00","fim":"14:00"}],"datasEspeciais":[],"regras":{"intervaloSlotsMin":10,"antecedenciaMinHoras":2,"janelaMaxDias":60,"confirmacao":"automatica","cancelamentoAteHoras":12,"fuso":"America/Fortaleza","escolherProfissional":false,"multiplosServicos":true},"modulos":{"anamnese":true,"pacotes":true,"comissoes":false,"financeiro":true,"sinal":false,"retorno":true,"avaliacoes":true,"aniversarios":true},"pix":{"chave":"","nome":"","cidade":""},"sinal":{"percentual":30,"servicosIds":[]},"metaMensal":0,"aviso":{"texto":"","ativo":false}}'::jsonb)
on conflict (tenant_id, chave) do nothing;
