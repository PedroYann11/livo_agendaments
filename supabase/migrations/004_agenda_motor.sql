-- =====================================================================
-- 004 — Agenda (2/5): peças comuns e o MOTOR de horários
-- Ver o mapa em 003_agenda_tabelas.sql.
-- =====================================================================

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

-- só o painel (rodando como a pessoa) usa as peças de formato; o motor
-- é chamado apenas de dentro das portas
revoke execute on function
  public.config_de(uuid), public.fuso_de(uuid), public.parede(timestamptz, text), public.de_parede(text, text),
  public.hora_do_min(int), public.min_do_dia(text), public.novo_token(),
  public.categoria_json(public.categorias), public.servico_json(public.servicos),
  public.profissional_json(public.profissionais, boolean), public.bloqueio_json(public.bloqueios, text),
  public.cliente_json(public.clientes, text), public.agendamento_json(public.agendamentos, text, boolean),
  public.servico_visivel(public.servicos),
  public.janelas_do_dia(jsonb, jsonb, date),
  public.vagas_do_dia(uuid, text[], text, date, timestamp, text, boolean),
  public.vagas_da_janela(uuid, text[], text, timestamp, text)
from public, anon, authenticated;

grant execute on function
  public.config_de(uuid), public.fuso_de(uuid), public.parede(timestamptz, text), public.de_parede(text, text),
  public.categoria_json(public.categorias), public.servico_json(public.servicos),
  public.profissional_json(public.profissionais, boolean), public.bloqueio_json(public.bloqueios, text),
  public.cliente_json(public.clientes, text), public.agendamento_json(public.agendamentos, text, boolean)
to authenticated;
