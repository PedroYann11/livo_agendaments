-- =====================================================================
-- 003 a 007 — A agenda no banco
--
-- Entregue em 5 partes (o Supabase recusa um pedido do tamanho da agenda
-- inteira de uma vez). Cada parte é uma migration, aplicada em ordem:
--   003_agenda_tabelas         tabelas, gatilhos, RLS
--   004_agenda_motor           peças comuns e o motor de horários
--   005_agenda_portas_publicas o que a página e o link do cliente chamam
--   006_agenda_depiled         o catálogo e o dia avulso da DepiLED
--   007_agenda_painel          o que o painel chama (tem remoções: a
--                              Supabase pede confirmação de quem aplica)
-- A suíte supabase/tests/007_agenda.sql testa o conjunto.
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

revoke execute on function public.agendamento_ocupacao() from public, anon, authenticated;
