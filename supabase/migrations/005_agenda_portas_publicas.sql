-- =====================================================================
-- 005 — Agenda (3/5): portas públicas (anon)
-- Ver o mapa em 003_agenda_tabelas.sql.
-- =====================================================================

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
      where r.tenant_id = t.id and r.colecao = 'depoimentos' and r.dados -> 'visivel' = 'true'::jsonb), '[]'::jsonb),
    -- só se HÁ cupom valendo; o código digitado quem confere é cupom_publico
    'temCupom', exists (select 1 from public.registros r
      where r.tenant_id = t.id and r.colecao = 'cupons' and r.dados -> 'ativo' = 'true'::jsonb
        and (coalesce(r.dados ->> 'validoAte', '') = ''
             or r.dados ->> 'validoAte' >= (now() at time zone public.fuso_de(t.id))::date::text))
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

revoke execute on function
  public.negocio_json(public.tenants, boolean), public.agendamento_do_link(text, text, text),
  public.pagina_publica(text), public.vagas_publicas(text, text[], text, text), public.cupom_publico(text, text),
  public.agendar(text, jsonb), public.agendamento_publico(text, text),
  public.agendamento_cancelar(text, text), public.agendamento_remarcar(text, text, date, text),
  public.agendamento_confirmar(text, text), public.agendamento_avaliar(text, text, int, text),
  public.ficha_enviar(text, text, jsonb, text)
from public, anon, authenticated;

-- a página pública (anon) e quem está logado olhando a página
grant execute on function
  public.pagina_publica(text), public.vagas_publicas(text, text[], text, text), public.cupom_publico(text, text),
  public.agendar(text, jsonb), public.agendamento_publico(text, text),
  public.agendamento_cancelar(text, text), public.agendamento_remarcar(text, text, date, text),
  public.agendamento_confirmar(text, text), public.agendamento_avaliar(text, text, int, text),
  public.ficha_enviar(text, text, jsonb, text)
to anon, authenticated;

-- o painel monta o negócio com a mesma peça
grant execute on function public.negocio_json(public.tenants, boolean) to authenticated;
