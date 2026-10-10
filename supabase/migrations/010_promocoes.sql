-- =====================================================================
-- 010 — Promoções automáticas e data de nascimento no agendamento
--
-- O negócio liga, no painel (Configurações › Promoções), descontos que
-- entram sozinhos no agendamento:
--   variosItens  N ou mais serviços no mesmo horário → X% (um combo conta
--                como 1 serviço: combo + 1 área = 2)
--   primeiraVez  quem nunca foi atendido → X%
--   aniversario  no dia / semana / mês do aniversário → X%
--   acumular     todos valem juntos (um sobre o outro) ou só o maior
-- e escolhe se pede a data de nascimento: não / opcional / obrigatória.
--
-- O PREÇO continua decidido no banco: preco_calcular é a regra única,
-- usada por agendar (o link) e espelhada no navegador (lib/precos.ts), com
-- teste de paridade. Cada desconto fica guardado no agendamento
-- (descontos), com nome, % e valor — o painel e o cliente veem o porquê.
--
-- "Primeira vez": nenhum cadastro com aquele telefone foi atendido (horário
-- cancelado não conta) nem veio da lista antiga do negócio (importado).
-- =====================================================================

alter table public.agendamentos
  add column descontos jsonb not null default '[]' check (jsonb_typeof(descontos) = 'array');

/** Texto 'aaaa-mm-dd' → date; qualquer outra coisa (inclusive 31/02) → null. */
create or replace function public.data_ou_nulo(p_texto text)
returns date language plpgsql immutable set search_path = '' as $$
begin
  if coalesce(p_texto, '') !~ '^\d{4}-\d{2}-\d{2}$' then return null; end if;
  return p_texto::date;
exception when others then
  return null;
end $$;

/** O aniversário (dia e mês de p_nasc) cai na janela em volta de p_dia? 29/02 vira 28/02 em ano comum. */
create or replace function public.aniversario_na_janela(p_nasc date, p_dia date, p_janela text)
returns boolean language sql immutable set search_path = '' as $$
  select case
    when p_nasc is null or p_dia is null then false
    when p_janela = 'mes' then extract(month from p_nasc) = extract(month from p_dia)
    else exists (
      select 1
      from generate_series(extract(year from p_dia)::int - 1, extract(year from p_dia)::int + 1) y,
           lateral (select least(make_date(y, extract(month from p_nasc)::int, 1) + (extract(day from p_nasc)::int - 1),
                                 (make_date(y, extract(month from p_nasc)::int, 1) + interval '1 month' - interval '1 day')::date) as aniv) a
      where abs(a.aniv - p_dia) <= case when p_janela = 'semana' then 3 else 0 end)
  end
$$;

/**
 * A regra de preço. ÚNICA: o link (agendar) usa esta; o navegador tem a
 * mesma em lib/precos.ts (teste de paridade em supabase/tests/paridade).
 *
 * p_precos: o preço de cada serviço escolhido (cada combo é 1).
 * Ordem: vários serviços → primeira vez → aniversário → cupom.
 * acumular: cada desconto incide sobre o que sobrou do anterior; senão,
 * vale só o maior. Arredonda para centavos a cada passo.
 * → {subtotal, descontos: [{tipo, nome, percentual, valor, codigo?}], desconto, total}
 */
create or replace function public.preco_calcular(
  p_promocoes jsonb,
  p_precos numeric[],
  p_novo boolean,
  p_nascimento date,
  p_dia date,
  p_cupom jsonb
) returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  pr jsonb := case when jsonb_typeof(p_promocoes) = 'object' then p_promocoes else '{}'::jsonb end;
  subtotal numeric := coalesce((select sum(x) from unnest(p_precos) x), 0);
  cands jsonb := '[]'::jsonb;
  c jsonb;
  base numeric;
  v numeric;
  descontos jsonb := '[]'::jsonb;
  melhor jsonb;
  melhor_v numeric := 0;
  soma numeric;
begin
  if coalesce((pr #>> '{variosItens,ativo}')::boolean, false)
     and coalesce(cardinality(p_precos), 0) >= coalesce((pr #>> '{variosItens,minimo}')::int, 2) then
    cands := cands || jsonb_build_array(jsonb_build_object('tipo', 'variosItens',
      'nome', coalesce(nullif(btrim(pr #>> '{variosItens,nome}'), ''), 'Desconto'),
      'percentual', (pr #>> '{variosItens,percentual}')::numeric));
  end if;
  if coalesce((pr #>> '{primeiraVez,ativo}')::boolean, false) and coalesce(p_novo, false) then
    cands := cands || jsonb_build_array(jsonb_build_object('tipo', 'primeiraVez',
      'nome', coalesce(nullif(btrim(pr #>> '{primeiraVez,nome}'), ''), 'Desconto'),
      'percentual', (pr #>> '{primeiraVez,percentual}')::numeric));
  end if;
  if coalesce((pr #>> '{aniversario,ativo}')::boolean, false)
     and public.aniversario_na_janela(p_nascimento, p_dia, coalesce(pr #>> '{aniversario,janela}', 'mes')) then
    cands := cands || jsonb_build_array(jsonb_build_object('tipo', 'aniversario',
      'nome', coalesce(nullif(btrim(pr #>> '{aniversario,nome}'), ''), 'Desconto'),
      'percentual', (pr #>> '{aniversario,percentual}')::numeric));
  end if;
  if p_cupom is not null then
    cands := cands || jsonb_build_array(jsonb_build_object('tipo', 'cupom',
      'nome', 'Cupom ' || upper(p_cupom ->> 'codigo'), 'codigo', upper(p_cupom ->> 'codigo'),
      'percentual', case when p_cupom ->> 'tipo' = 'percentual' then (p_cupom ->> 'valor')::numeric end,
      'fixo', case when p_cupom ->> 'tipo' = 'percentual' then null else (p_cupom ->> 'valor')::numeric end));
  end if;

  if coalesce((pr ->> 'acumular')::boolean, true) then
    base := subtotal;
    for c in select x from jsonb_array_elements(cands) x loop
      v := case when c ->> 'percentual' is not null then round(base * (c ->> 'percentual')::numeric) / 100
                else least(base, greatest(coalesce((c ->> 'fixo')::numeric, 0), 0)) end;
      if v > 0 then
        base := base - v;
        descontos := descontos || jsonb_build_array((c - 'fixo') || jsonb_build_object('valor', v));
      end if;
    end loop;
  else
    for c in select x from jsonb_array_elements(cands) x loop
      v := case when c ->> 'percentual' is not null then round(subtotal * (c ->> 'percentual')::numeric) / 100
                else least(subtotal, greatest(coalesce((c ->> 'fixo')::numeric, 0), 0)) end;
      if v > melhor_v then melhor := c; melhor_v := v; end if;
    end loop;
    if melhor is not null then
      descontos := jsonb_build_array((melhor - 'fixo') || jsonb_build_object('valor', melhor_v));
    end if;
  end if;

  soma := coalesce((select sum((d ->> 'valor')::numeric) from jsonb_array_elements(descontos) d), 0);
  return jsonb_build_object('subtotal', subtotal, 'descontos', descontos, 'desconto', soma, 'total', subtotal - soma);
end $$;

/** Primeira vez: nenhum cadastro com este telefone foi atendido (cancelado não conta) nem veio da lista antiga. */
create or replace function public.cliente_e_novo(p_tenant uuid, p_telefone text)
returns boolean language sql stable set search_path = '' as $$
  select not exists (
    select 1 from public.clientes c
    where c.tenant_id = p_tenant and c.telefone = p_telefone and c.telefone <> ''
      and (c.origem = 'importado' or exists (
        select 1 from public.agendamentos a
        where a.tenant_id = p_tenant and a.cliente_id = c.id and a.status <> 'cancelado')))
$$;

/** p_privado = false: o que o dono do link vê (sem o pagamento). Agora com os descontos. */
create or replace function public.agendamento_json(a public.agendamentos, p_fuso text, p_privado boolean)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id', a.id, 'token', a.token, 'clienteId', a.cliente_id, 'profissionalId', a.profissional_id,
    'inicio', public.parede(a.inicio, p_fuso), 'fim', public.parede(a.fim, p_fuso),
    'intervaloMin', a.intervalo_min, 'status', a.status, 'canal', a.canal, 'itens', a.itens,
    'total', a.total, 'desconto', a.desconto, 'descontos', a.descontos, 'observacao', a.observacao,
    'criadoEm', public.parede(a.criado_em, p_fuso), 'confirmadoEm', public.parede(a.confirmado_em, p_fuso),
    'lembreteEm', public.parede(a.lembrete_em, p_fuso), 'canceladoPor', a.cancelado_por,
    'motivoCancelamento', a.motivo_cancelamento,
    'pagamento', case when p_privado then a.pagamento end,
    'sinal', a.sinal, 'pacoteClienteId', a.pacote_cliente_id, 'cupom', a.cupom)
$$;

/**
 * O agendamento pelo link (igual à 005, com as promoções e a data de
 * nascimento). O PREÇO e a VAGA são decididos aqui, nunca por quem pediu.
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
  nasc date := public.data_ou_nulo(p_pedido #>> '{cliente,nascimento}');
  vaga record;
  cli public.clientes;
  novo_cliente boolean;
  atendimento int;
  intervalo int;
  precos numeric[];
  itens jsonb;
  cupom jsonb;
  preco jsonb;
  desconto numeric;
  total numeric;
  cupom_usado boolean;
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
  -- data de nascimento: só uma data que existe, de alguém já nascido
  if nasc < date '1900-01-01' or nasc > agora::date then nasc := null; end if;
  if nasc is null and cfg #>> '{regras,pedirNascimento}' = 'obrigatorio' then
    raise exception 'Informe sua data de nascimento.' using hint = 'nascimento';
  end if;
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

  -- primeira vez? (antes de cadastrar: o cadastro novo não muda a resposta)
  novo_cliente := public.cliente_e_novo(tid, tel);

  -- o cliente, reconhecido pelo telefone (o nome guardado não muda por aqui;
  -- a data de nascimento só entra se o cadastro ainda não tinha)
  select * into cli from public.clientes c
  where c.tenant_id = tid and c.telefone = tel order by c.criado_em limit 1;
  if cli.id is null then
    insert into public.clientes (tenant_id, id, nome, telefone, email, nascimento, origem)
    values (tid, 'cl_' || gen_random_uuid(), nome, tel,
            left(coalesce(p_pedido #>> '{cliente,email}', ''), 200), nasc, 'online')
    returning * into cli;
  elsif cli.nascimento is null and nasc is not null then
    update public.clientes c set nascimento = nasc where c.tenant_id = tid and c.id = cli.id
    returning * into cli;
  end if;

  -- freio contra abuso: o mesmo telefone com muitos horários em aberto
  if (select count(*) from public.agendamentos a
      where a.tenant_id = tid and a.cliente_id = cli.id and a.status in ('pendente', 'confirmado') and a.inicio > now()) >= 5 then
    raise exception 'Você já tem vários horários marcados. Fale com o negócio para marcar mais.';
  end if;

  -- preço e duração vêm do banco, congelados no agendamento
  select sum(s.duracao_min), max(s.intervalo_min), array_agg(s.preco order by array_position(ids, s.id)),
         jsonb_agg(jsonb_build_object('servicoId', s.id, 'nome', s.nome, 'preco', s.preco, 'duracaoMin', s.duracao_min)
                   order by array_position(ids, s.id))
    into atendimento, intervalo, precos, itens
  from public.servicos s where s.tenant_id = tid and s.id = any(ids);

  if coalesce(btrim(p_pedido ->> 'cupom'), '') <> '' then
    select x.dados into cupom from public.registros x
    where x.tenant_id = tid and x.colecao = 'cupons' and x.dados -> 'ativo' = 'true'::jsonb
      and upper(x.dados ->> 'codigo') = upper(btrim(p_pedido ->> 'cupom'))
      and (coalesce(x.dados ->> 'validoAte', '') = '' or x.dados ->> 'validoAte' >= agora::date::text)
    limit 1;
  end if;

  -- a regra única de preço: promoções do negócio + cupom
  preco := public.preco_calcular(cfg -> 'promocoes', precos, novo_cliente, cli.nascimento, dia, cupom);
  desconto := (preco ->> 'desconto')::numeric;
  total := (preco ->> 'total')::numeric;
  cupom_usado := exists (select 1 from jsonb_array_elements(preco -> 'descontos') d where d ->> 'tipo' = 'cupom');
  -- o cupom só conta uso quando entrou na conta (com "só o maior", pode não entrar)
  if cupom_usado then
    update public.registros x
    set dados = jsonb_set(x.dados, '{usos}', to_jsonb(coalesce((x.dados ->> 'usos')::int, 0) + 1))
    where x.tenant_id = tid and x.colecao = 'cupons' and x.id = cupom ->> 'id';
  end if;

  if coalesce((cfg #>> '{modulos,sinal}')::boolean, false)
     and exists (select 1 from jsonb_array_elements_text(coalesce(cfg #> '{sinal,servicosIds}', '[]'::jsonb)) x where x = any(ids)) then
    sinal := jsonb_build_object(
      'valor', round(total * coalesce((cfg #>> '{sinal,percentual}')::numeric, 30) / 100),
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
      itens, total, desconto, descontos, observacao, confirmado_em, sinal, pacote_cliente_id, cupom)
    values (
      tid, 'ag_' || gen_random_uuid(), public.novo_token(), cli.id, vaga.profissional_id,
      inicio, inicio + make_interval(mins => atendimento), intervalo,
      case when cfg #>> '{regras,confirmacao}' = 'manual' then 'pendente' else 'confirmado' end,
      'online', itens, total, desconto, preco -> 'descontos', left(coalesce(p_pedido ->> 'observacao', ''), 1000),
      case when cfg #>> '{regras,confirmacao}' = 'manual' then null else now() end,
      sinal, pacote, case when cupom_usado then cupom ->> 'codigo' end)
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

/** Igual à 007, validando também as promoções e o pedido da data de nascimento. */
create or replace function public.negocio_salvar(p_tenant uuid, p_negocio jsonb)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  n jsonb := p_negocio;
  fuso text := coalesce(p_negocio #>> '{regras,fuso}', 'America/Fortaleza');
  tema jsonb;
  cfg jsonb;
  pr jsonb := p_negocio -> 'promocoes';
  k text;
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
  if coalesce(n #>> '{regras,pedirNascimento}', 'opcional') not in ('nao', 'opcional', 'obrigatorio') then
    raise exception 'Escolha se a data de nascimento é pedida.';
  end if;
  -- promoções: % inteiro de 1 a 90, nome curto, mínimo de 2 a 10 serviços, janela conhecida
  if pr is not null then
    if jsonb_typeof(pr) <> 'object' then raise exception 'Promoções inválidas.'; end if;
    foreach k in array array['variosItens', 'primeiraVez', 'aniversario'] loop
      continue when pr -> k is null;
      if jsonb_typeof(pr -> k) <> 'object'
         or jsonb_typeof(pr -> k -> 'percentual') is distinct from 'number'
         or (pr -> k ->> 'percentual')::numeric not between 1 and 90
         or (pr -> k ->> 'percentual')::numeric <> trunc((pr -> k ->> 'percentual')::numeric)
         or char_length(btrim(coalesce(pr -> k ->> 'nome', ''))) not between 2 and 60 then
        raise exception 'Promoção com desconto ou nome inválido: use de 1%% a 90%% e um nome de 2 a 60 letras.' using hint = k;
      end if;
    end loop;
    if pr ? 'variosItens' and coalesce((pr #>> '{variosItens,minimo}')::int, 0) not between 2 and 10 then
      raise exception 'O desconto por vários serviços vale a partir de 2 até 10 serviços.' using hint = 'variosItens';
    end if;
    if pr ? 'aniversario' and coalesce(pr #>> '{aniversario,janela}', '') not in ('dia', 'semana', 'mes') then
      raise exception 'Escolha quando vale o desconto de aniversário.' using hint = 'aniversario';
    end if;
  end if;
  -- só as 7 cores, e só no formato #rrggbb
  select coalesce(jsonb_object_agg(k2, n -> 'tema' ->> k2), '{}'::jsonb) into tema
  from unnest(array['marca','sobreMarca','fundo','superficie','texto','textoSuave','acento']) k2
  where coalesce(n -> 'tema' ->> k2, '') ~ '^#[0-9a-fA-F]{6}$';
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

/**
 * Igual à 007, gravando também os descontos do agendamento. O painel calcula
 * com a mesma regra (lib/precos.ts) e quem é da equipe pode ajustar o preço
 * na hora — a RLS garante que só a equipe do negócio grava aqui.
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
      status, canal, itens, total, desconto, descontos, observacao, criado_em, confirmado_em, lembrete_em, cancelado_por,
      motivo_cancelamento, pagamento, sinal, pacote_cliente_id, cupom)
    select tid, x ->> 'id', x ->> 'token', x ->> 'clienteId', x ->> 'profissionalId',
           public.de_parede(x ->> 'inicio', fuso), public.de_parede(x ->> 'fim', fuso),
           coalesce((x ->> 'intervaloMin')::int, 0), coalesce(x ->> 'status', 'confirmado'), coalesce(x ->> 'canal', 'painel'),
           coalesce(x -> 'itens', '[]'::jsonb), coalesce((x ->> 'total')::numeric, 0), coalesce((x ->> 'desconto')::numeric, 0),
           case when jsonb_typeof(x -> 'descontos') = 'array' then x -> 'descontos' else '[]'::jsonb end,
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
      itens = excluded.itens, total = excluded.total, desconto = excluded.desconto, descontos = excluded.descontos,
      observacao = excluded.observacao, confirmado_em = excluded.confirmado_em, lembrete_em = excluded.lembrete_em,
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

-- as peças novas são internas: quem chama é agendar (definer) e os testes
revoke execute on function
  public.data_ou_nulo(text), public.aniversario_na_janela(date, date, text),
  public.preco_calcular(jsonb, numeric[], boolean, date, date, jsonb), public.cliente_e_novo(uuid, text)
from public, anon, authenticated;
