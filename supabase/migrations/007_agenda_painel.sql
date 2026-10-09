-- =====================================================================
-- 007 — Agenda (5/5): portas do painel
-- Ver o mapa em 003_agenda_tabelas.sql.
-- =====================================================================

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

revoke execute on function
  public.negocio_salvar(uuid, jsonb), public.painel_dados(text), public.painel_salvar(text, jsonb)
from public, anon, authenticated;

grant execute on function
  public.negocio_salvar(uuid, jsonb), public.painel_dados(text), public.painel_salvar(text, jsonb)
to authenticated;
