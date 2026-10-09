-- =====================================================================
-- Suíte 003 — a agenda no banco (migration 003)
--
-- Dois negócios de TESTE (só existem no Postgres descartável): A, aberto
-- todo dia 08–18 em passos de 30 min, e B. Pessoas: dona e recepção de A,
-- dono de B. Datas relativas a hoje no fuso do negócio, para a suíte não
-- envelhecer; o motor é testado também com "agora" fixo.
-- =====================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.como(papel text, usuario text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(usuario, ''), false);
  execute format('set role %I', papel);
end $$;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'dona@a.teste'),
  ('00000000-0000-0000-0000-0000000000a2', 'recepcao@a.teste'),
  ('00000000-0000-0000-0000-0000000000b1', 'dono@b.teste');
insert into public.tenants (id, slug, nome, nicho, pele) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'teste-a', 'Clínica A', 'estetica', 'beleza'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'teste-b', 'Barbearia B', 'barbearia', 'barbearia');
select public.vincular_membro('dona@a.teste', 'teste-a', 'owner') \gset
select public.vincular_membro('recepcao@a.teste', 'teste-a', 'reception') \gset
select public.vincular_membro('dono@b.teste', 'teste-b', 'owner') \gset

insert into public.store_settings (tenant_id, chave, valor) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'config', '{
    "horario": {"0":[{"inicio":"08:00","fim":"18:00"}],"1":[{"inicio":"08:00","fim":"18:00"}],"2":[{"inicio":"08:00","fim":"18:00"}],
                "3":[{"inicio":"08:00","fim":"18:00"}],"4":[{"inicio":"08:00","fim":"18:00"}],"5":[{"inicio":"08:00","fim":"18:00"}],
                "6":[{"inicio":"08:00","fim":"18:00"}]},
    "aberturas": [], "datasEspeciais": [],
    "regras": {"intervaloSlotsMin":30,"antecedenciaMinHoras":0,"janelaMaxDias":30,"confirmacao":"automatica",
               "cancelamentoAteHoras":12,"fuso":"America/Fortaleza","escolherProfissional":true,"multiplosServicos":true},
    "modulos": {"avaliacoes": true, "anamnese": true, "sinal": false},
    "metaMensal": 9999}'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'config', '{"regras":{"fuso":"America/Fortaleza"}}');

insert into public.categorias (tenant_id, id, nome, ordem) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'cat_rosto', 'Rosto', 0),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'cat_corte', 'Corte', 0);
insert into public.servicos (tenant_id, id, categoria_id, nome, duracao_min, intervalo_min, preco, online) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'sv_limpeza', 'cat_rosto', 'Limpeza de pele', 60, 0, 150, true),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'sv_peeling', 'cat_rosto', 'Peeling', 30, 15, 200, true),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'sv_interno', 'cat_rosto', 'Só no painel', 30, 0, 80, false),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'sv_corte', 'cat_corte', 'Corte', 30, 0, 50, true);
insert into public.profissionais (tenant_id, id, nome, ordem, servicos_ids, horario) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'pr_ana', 'Ana', 0, array['sv_limpeza','sv_peeling','sv_interno'],
   (select valor -> 'horario' from public.store_settings where tenant_id = 'aaaaaaaa-0000-0000-0000-000000000001' and chave = 'config')),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'pr_bia', 'Bia', 1, array['sv_limpeza'],
   (select valor -> 'horario' from public.store_settings where tenant_id = 'aaaaaaaa-0000-0000-0000-000000000001' and chave = 'config')),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'pr_beto', 'Beto', 0, array['sv_corte'], '{}');

-- T18 RLS ligada nas tabelas novas e anon fora de todas
do $$ declare n int; tabela text; begin
  select count(*) into n from pg_class c join pg_namespace s on s.oid = c.relnamespace
  where s.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
  if n <> 0 then raise exception 'T18 FALHOU: % tabela(s) sem RLS', n; end if;
  perform pg_temp.como('anon', null);
  foreach tabela in array array['categorias','servicos','profissionais','bloqueios','clientes','agendamentos','registros'] loop
    begin
      execute format('select 1 from public.%I limit 1', tabela);
      raise exception 'T18 FALHOU: anon leu %', tabela;
    exception when insufficient_privilege then null;
    end;
  end loop;
  reset role;
end $$;
\echo T18 ok · RLS em todas as tabelas, anon sem SELECT nas 7 novas

-- T19 página pública da DepiLED: catálogo do banco, nada privado
do $$ declare p jsonb; begin
  perform pg_temp.como('anon', null);
  p := public.pagina_publica('depiled');
  if jsonb_array_length(p -> 'categorias') <> 3 then raise exception 'T19 FALHOU: categorias %', p -> 'categorias'; end if;
  if jsonb_array_length(p -> 'servicos') <> 31 then
    raise exception 'T19 FALHOU: % serviços visíveis (os 3 sem categoria ficam fora)', jsonb_array_length(p -> 'servicos');
  end if;
  if jsonb_array_length(p -> 'profissionais') <> 1 then raise exception 'T19 FALHOU: profissionais'; end if;
  if p -> 'negocio' -> 'aberturas' -> 0 ->> 'inicio' <> '08:00' then raise exception 'T19 FALHOU: dia avulso'; end if;
  if p -> 'negocio' ? 'metaMensal' then raise exception 'T19 FALHOU: meta do mês na página'; end if;
  if p ? 'clientes' or p ? 'agendamentos' then raise exception 'T19 FALHOU: dado pessoal na página'; end if;
  if p -> 'profissionais' -> 0 -> 'acesso' <> 'null'::jsonb then raise exception 'T19 FALHOU: acesso exposto'; end if;
  if public.pagina_publica('ambar') is not null then raise exception 'T19 FALHOU: suspenso respondeu'; end if;
  reset role;
end $$;
\echo T19 ok · pagina_publica mostra o catálogo e esconde o privado

-- T20 motor com "agora" fixo: DepiLED só no sábado avulso, 08–14, passos de 10
do $$ declare n int; primeira text; ultima text; begin
  select count(*), min(hora), max(hora) into n, primeira, ultima
  from public.vagas_do_dia('ab00de9b-81fa-4a2e-a084-948f77eda90e', array['dp_axilas'], null, '2026-10-10', '2026-10-09 10:00');
  if n <> 36 or primeira <> '08:00' or ultima <> '13:50' then
    raise exception 'T20 FALHOU: % vagas, % a %', n, primeira, ultima;
  end if;
  select count(*) into n from public.vagas_do_dia('ab00de9b-81fa-4a2e-a084-948f77eda90e', array['dp_axilas'], null, '2026-10-17', '2026-10-09 10:00');
  if n <> 0 then raise exception 'T20 FALHOU: sábado sem dia avulso abriu (%)', n; end if;
  -- antecedência de 2h no próprio dia
  select min(hora) into primeira from public.vagas_do_dia('ab00de9b-81fa-4a2e-a084-948f77eda90e', array['dp_axilas'], null, '2026-10-10', '2026-10-10 09:05');
  if primeira <> '11:10' then raise exception 'T20 FALHOU: com 2h de antecedência às 09:05, primeira = %', primeira; end if;
end $$;
\echo T20 ok · motor: dia avulso, passos e antecedência

-- T21 encaixe: 15 min às 08:00 liberam 08:15 (fim da ocupação vira candidato)
insert into public.clientes (tenant_id, id, nome, telefone) values
  ('ab00de9b-81fa-4a2e-a084-948f77eda90e', 'cl_teste', 'Cliente Teste', '88999990000');
insert into public.agendamentos (tenant_id, id, token, cliente_id, profissional_id, inicio, fim, itens) values
  ('ab00de9b-81fa-4a2e-a084-948f77eda90e', 'ag_t1', 'tokenteste1', 'cl_teste', 'dp_agenda',
   '2026-10-10 08:00-03', '2026-10-10 08:15-03', '[]');
do $$ declare h text[]; begin
  select array_agg(hora order by hora) into h
  from public.vagas_do_dia('ab00de9b-81fa-4a2e-a084-948f77eda90e', array['dp_axilas'], null, '2026-10-10', '2026-10-09 10:00');
  if h[1] <> '08:15' or h[2] <> '08:20' then raise exception 'T21 FALHOU: começa em %', h[1:3]; end if;
  -- remarcando o próprio agendamento, ele não bloqueia
  select array_agg(hora order by hora) into h
  from public.vagas_do_dia('ab00de9b-81fa-4a2e-a084-948f77eda90e', array['dp_axilas'], null, '2026-10-10', '2026-10-09 10:00', 'ag_t1');
  if h[1] <> '08:00' then raise exception 'T21 FALHOU: ignorar não liberou 08:00 (%)', h[1:3]; end if;
end $$;
\echo T21 ok · encaixe no fim do anterior; remarcar ignora o próprio horário

-- T22 sem_conflito: sobreposição barrada, encostar pode, cancelado não ocupa
do $$ begin
  begin
    insert into public.agendamentos (tenant_id, id, token, cliente_id, profissional_id, inicio, fim, itens) values
      ('ab00de9b-81fa-4a2e-a084-948f77eda90e', 'ag_t2', 'tokenteste2', 'cl_teste', 'dp_agenda',
       '2026-10-10 08:10-03', '2026-10-10 08:20-03', '[]');
    raise exception 'T22 FALHOU: sobreposição gravada';
  exception when exclusion_violation then null;
  end;
  insert into public.agendamentos (tenant_id, id, token, cliente_id, profissional_id, inicio, fim, itens) values
    ('ab00de9b-81fa-4a2e-a084-948f77eda90e', 'ag_t3', 'tokenteste3', 'cl_teste', 'dp_agenda',
     '2026-10-10 08:15-03', '2026-10-10 08:25-03', '[]');
  update public.agendamentos set status = 'cancelado' where id = 'ag_t3';
  insert into public.agendamentos (tenant_id, id, token, cliente_id, profissional_id, inicio, fim, itens) values
    ('ab00de9b-81fa-4a2e-a084-948f77eda90e', 'ag_t4', 'tokenteste4', 'cl_teste', 'dp_agenda',
     '2026-10-10 08:15-03', '2026-10-10 08:25-03', '[]');
  -- o intervalo de limpeza também ocupa
  update public.agendamentos set intervalo_min = 10 where id = 'ag_t4';
  begin
    insert into public.agendamentos (tenant_id, id, token, cliente_id, profissional_id, inicio, fim, itens) values
      ('ab00de9b-81fa-4a2e-a084-948f77eda90e', 'ag_t5', 'tokenteste5', 'cl_teste', 'dp_agenda',
       '2026-10-10 08:30-03', '2026-10-10 08:40-03', '[]');
    raise exception 'T22 FALHOU: gravou em cima do intervalo de limpeza';
  exception when exclusion_violation then null;
  end;
end $$;
-- limpa o que a suíte pôs na DepiLED
delete from public.agendamentos where tenant_id = 'ab00de9b-81fa-4a2e-a084-948f77eda90e';
delete from public.clientes where tenant_id = 'ab00de9b-81fa-4a2e-a084-948f77eda90e';
\echo T22 ok · sem_conflito: sobreposição e limpeza barradas, encostar e cancelado liberam

-- T23 agendar pelo link (anon): vaga e preço decididos no banco
do $$ declare
  dia date := (now() at time zone 'America/Fortaleza')::date + 2;
  r jsonb; ag jsonb; n int;
begin
  perform pg_temp.como('anon', null);
  r := public.agendar('teste-a', jsonb_build_object(
    'servicosIds', jsonb_build_array('sv_limpeza', 'sv_peeling'), 'profissionalId', null,
    'data', dia, 'hora', '10:00', 'preco', 1, 'total', 1,
    'cliente', jsonb_build_object('nome', 'Maria Souza', 'telefone', '(88) 9 9999-0001')));
  ag := r -> 'agendamento';
  if (ag ->> 'total')::numeric <> 350 then raise exception 'T23 FALHOU: total % (o banco decide o preço)', ag ->> 'total'; end if;
  if ag ->> 'inicio' <> dia || 'T10:00' or ag ->> 'fim' <> dia || 'T11:30' then
    raise exception 'T23 FALHOU: % → %', ag ->> 'inicio', ag ->> 'fim';
  end if;
  if ag ->> 'profissionalId' <> 'pr_ana' then raise exception 'T23 FALHOU: só a Ana faz os dois'; end if;
  if ag ->> 'status' <> 'confirmado' or (ag ->> 'intervaloMin')::int <> 15 then raise exception 'T23 FALHOU: % / %', ag ->> 'status', ag ->> 'intervaloMin'; end if;
  if char_length(ag ->> 'token') <> 12 then raise exception 'T23 FALHOU: token %', ag ->> 'token'; end if;
  if ag -> 'pagamento' <> 'null'::jsonb then raise exception 'T23 FALHOU: pagamento no link'; end if;
  -- o mesmo horário de novo: recusado
  begin
    perform public.agendar('teste-a', jsonb_build_object(
      'servicosIds', jsonb_build_array('sv_peeling'), 'data', dia, 'hora', '10:30', 'profissionalId', 'pr_ana',
      'cliente', jsonb_build_object('nome', 'João Lima', 'telefone', '88999990002')));
    raise exception 'T23 FALHOU: horário ocupado aceito';
  exception when raise_exception then
    if sqlerrm not like 'Esse horário acabou de ser ocupado%' then raise; end if;
  end;
  -- limpeza de pele sem preferência: a Ana está ocupada, vai para a Bia
  r := public.agendar('teste-a', jsonb_build_object(
    'servicosIds', jsonb_build_array('sv_limpeza'), 'data', dia, 'hora', '10:00',
    'cliente', jsonb_build_object('nome', 'João Lima', 'telefone', '88999990002')));
  if r -> 'agendamento' ->> 'profissionalId' <> 'pr_bia' then raise exception 'T23 FALHOU: não foi para a Bia'; end if;
  -- serviço que não é online e nome sem sobrenome
  begin
    perform public.agendar('teste-a', jsonb_build_object('servicosIds', jsonb_build_array('sv_interno'), 'data', dia, 'hora', '15:00',
      'cliente', jsonb_build_object('nome', 'Ana Paula', 'telefone', '88999990003')));
    raise exception 'T23 FALHOU: serviço fora do link aceito';
  exception when raise_exception then
    if sqlerrm not like 'Algum serviço%' then raise; end if;
  end;
  begin
    perform public.agendar('teste-a', jsonb_build_object('servicosIds', jsonb_build_array('sv_peeling'), 'data', dia, 'hora', '15:00',
      'cliente', jsonb_build_object('nome', 'Ana', 'telefone', '88999990003')));
    raise exception 'T23 FALHOU: nome sem sobrenome aceito';
  exception when raise_exception then
    if sqlerrm not like 'Escreva nome e sobrenome%' then raise; end if;
  end;
  -- o telefone não revela o nome guardado
  r := public.agendar('teste-a', jsonb_build_object('servicosIds', jsonb_build_array('sv_peeling'), 'data', dia, 'hora', '15:00',
    'cliente', jsonb_build_object('nome', 'Outra Pessoa', 'telefone', '88999990001')));
  if r -> 'cliente' ->> 'nome' <> 'Outra Pessoa' then raise exception 'T23 FALHOU: devolveu o nome guardado'; end if;
  reset role;
  select count(*) into n from public.clientes where tenant_id = 'aaaaaaaa-0000-0000-0000-000000000001' and telefone = '88999990001';
  if n <> 1 then raise exception 'T23 FALHOU: cliente duplicado pelo telefone (%)', n; end if;
  select count(*) into n from public.clientes where tenant_id = 'aaaaaaaa-0000-0000-0000-000000000001' and nome = 'Maria Souza';
  if n <> 1 then raise exception 'T23 FALHOU: o link mudou o nome guardado'; end if;
end $$;
\echo T23 ok · agendar: preço e vaga do banco, corrida barrada, cliente pelo telefone

-- T24 o link do cliente: ver, remarcar, cancelar; token de um negócio não abre em outro
do $$ declare tok text; r jsonb; dia date := (now() at time zone 'America/Fortaleza')::date + 2; begin
  select token into tok from public.agendamentos where tenant_id = 'aaaaaaaa-0000-0000-0000-000000000001'
    and profissional_id = 'pr_ana' and inicio = ((dia + time '10:00') at time zone 'America/Fortaleza');
  perform pg_temp.como('anon', null);
  r := public.agendamento_publico('teste-a', tok);
  if r -> 'cliente' ->> 'nome' <> 'Maria Souza' then raise exception 'T24 FALHOU: %', r -> 'cliente'; end if;
  if public.agendamento_publico('teste-b', tok) is not null then raise exception 'T24 FALHOU: token abriu em outro negócio'; end if;
  if public.agendamento_publico('teste-a', 'naoexiste123') is not null then raise exception 'T24 FALHOU: token inventado'; end if;
  -- as vagas da remarcação contam com o próprio horário livre
  r := public.vagas_publicas('teste-a', null, null, tok);
  if not (r -> dia::text) @> '[{"hora": "10:00"}]' then raise exception 'T24 FALHOU: remarcar não vê o próprio horário'; end if;
  r := public.agendamento_remarcar('teste-a', tok, dia + 1, '09:00');
  if r ->> 'inicio' <> (dia + 1) || 'T09:00' or r ->> 'fim' <> (dia + 1) || 'T10:30' then raise exception 'T24 FALHOU: remarcou para %', r ->> 'inicio'; end if;
  r := public.agendamento_cancelar('teste-a', tok);
  if r ->> 'status' <> 'cancelado' or r ->> 'canceladoPor' <> 'cliente' then raise exception 'T24 FALHOU: cancelar'; end if;
  begin
    perform public.agendamento_cancelar('teste-a', tok);
    raise exception 'T24 FALHOU: cancelou duas vezes';
  exception when raise_exception then
    if sqlerrm not like 'Este horário não pode mais%' then raise; end if;
  end;
  begin
    perform public.agendamento_avaliar('teste-a', tok, 5, 'ótimo');
    raise exception 'T24 FALHOU: avaliou sem atendimento';
  exception when raise_exception then null;
  end;
  reset role;
end $$;
\echo T24 ok · link: ver, remarcar e cancelar só o próprio horário, no próprio negócio

-- T25 prazo de cancelamento: a menos de 12h, só falando com o negócio
insert into public.clientes (tenant_id, id, nome, telefone) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'cl_perto', 'Cliente Perto', '88999990009');
insert into public.agendamentos (tenant_id, id, token, cliente_id, profissional_id, inicio, fim, itens) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'ag_perto', 'tokenperto01', 'cl_perto', 'pr_bia',
   date_trunc('hour', now()) + interval '3 hours', date_trunc('hour', now()) + interval '4 hours',
   '[{"servicoId":"sv_limpeza","nome":"Limpeza de pele","preco":150,"duracaoMin":60}]');
do $$ begin
  perform pg_temp.como('anon', null);
  begin
    perform public.agendamento_cancelar('teste-a', 'tokenperto01');
    raise exception 'T25 FALHOU: cancelou dentro das 12h';
  exception when raise_exception then
    if sqlerrm not like 'Faltam menos de%' then raise; end if;
  end;
  reset role;
end $$;
\echo T25 ok · fora do prazo, o link não cancela

-- T26 painel: cada um lê só o próprio negócio; anon não entra
do $$ declare d jsonb; begin
  perform pg_temp.como('authenticated', '00000000-0000-0000-0000-0000000000a1');
  d := public.painel_dados('teste-a');
  if jsonb_array_length(d -> 'servicos') <> 3 or jsonb_array_length(d -> 'profissionais') <> 2 then
    raise exception 'T26 FALHOU: painel de A incompleto';
  end if;
  if (d -> 'negocio' ->> 'metaMensal')::int <> 9999 then raise exception 'T26 FALHOU: meta do mês fora do painel'; end if;
  if jsonb_array_length(d -> 'agendamentos') < 3 then raise exception 'T26 FALHOU: agenda de A'; end if;
  begin
    perform public.painel_dados('teste-b');
    raise exception 'T26 FALHOU: dona de A leu o painel de B';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.painel_salvar('teste-b', '{"categorias":{"salvar":[{"id":"x","nome":"Invasão"}]}}');
    raise exception 'T26 FALHOU: dona de A gravou em B';
  exception when insufficient_privilege then null;
  end;
  reset role;
  perform pg_temp.como('anon', null);
  begin
    perform public.painel_dados('teste-a');
    raise exception 'T26 FALHOU: anon abriu o painel';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.vagas_do_dia('aaaaaaaa-0000-0000-0000-000000000001', array['sv_limpeza'], null, current_date, localtimestamp);
    raise exception 'T26 FALHOU: anon chamou o motor interno';
  exception when insufficient_privilege then null;
  end;
  reset role;
end $$;
\echo T26 ok · painel isolado por negócio; anon fora do painel e do motor interno

-- T27 painel_salvar: ida e volta no formato do app, tudo ou nada
do $$ declare d jsonb; dia date := (now() at time zone 'America/Fortaleza')::date + 5; begin
  perform pg_temp.como('authenticated', '00000000-0000-0000-0000-0000000000a1');
  perform public.painel_salvar('teste-a', jsonb_build_object(
    'categorias', jsonb_build_object('salvar', jsonb_build_array(jsonb_build_object('id', 'cat_corpo', 'nome', 'Corpo', 'descricao', '', 'ordem', 1, 'pausada', false))),
    'servicos', jsonb_build_object('salvar', jsonb_build_array(jsonb_build_object(
      'id', 'sv_massagem', 'categoriaId', 'cat_corpo', 'nome', 'Massagem', 'descricao', 'Relaxante', 'duracaoMin', 50,
      'intervaloMin', 10, 'preco', 120.5, 'modoPreco', 'fixo', 'online', true, 'ativo', true, 'pausado', false,
      'destaque', false, 'ordem', 9, 'retornoDias', null, 'fichaId', null, 'fotoUrl', null))),
    'clientes', jsonb_build_object('salvar', jsonb_build_array(jsonb_build_object(
      'id', 'cl_painel', 'nome', 'Carla Dias', 'telefone', '(88) 98888-7777', 'email', '', 'nascimento', '1990-05-20',
      'observacoes', '', 'tags', jsonb_build_array('vip'), 'origem', 'painel', 'criadoEm', '2026-10-01T09:30', 'consentimentoWhats', true))),
    'agendamentos', jsonb_build_object('salvar', jsonb_build_array(jsonb_build_object(
      'id', 'ag_painel', 'token', 'tokenpainel1', 'clienteId', 'cl_painel', 'profissionalId', 'pr_bia',
      'inicio', dia || 'T14:00', 'fim', dia || 'T15:00', 'intervaloMin', 0, 'status', 'confirmado', 'canal', 'painel',
      'itens', jsonb_build_array(jsonb_build_object('servicoId', 'sv_limpeza', 'nome', 'Limpeza de pele', 'preco', 150, 'duracaoMin', 60)),
      'total', 150, 'desconto', 0, 'observacao', '', 'criadoEm', '2026-10-01T09:31', 'confirmadoEm', '2026-10-01T09:31',
      'lembreteEm', null, 'canceladoPor', null, 'motivoCancelamento', '', 'pagamento', null, 'sinal', null,
      'pacoteClienteId', null, 'cupom', null))),
    'registros', jsonb_build_object('salvar', jsonb_build_array(
      jsonb_build_object('colecao', 'cupons', 'id', 'cp_1', 'dados', jsonb_build_object('id', 'cp_1', 'codigo', 'BEMVINDA', 'tipo', 'percentual', 'valor', 10, 'ativo', true, 'validoAte', null, 'usos', 0)),
      jsonb_build_object('colecao', 'lancamentos', 'id', 'lc_1', 'dados', jsonb_build_object('id', 'lc_1', 'tipo', 'despesa', 'valor', 300))))
  ));
  d := public.painel_dados('teste-a');
  if not (d -> 'clientes') @> '[{"id":"cl_painel","telefone":"88988887777","nascimento":"1990-05-20","criadoEm":"2026-10-01T09:30"}]' then
    raise exception 'T27 FALHOU: cliente voltou diferente';
  end if;
  if not (d -> 'agendamentos') @> jsonb_build_array(jsonb_build_object('id', 'ag_painel', 'inicio', dia || 'T14:00', 'fim', dia || 'T15:00')) then
    raise exception 'T27 FALHOU: agendamento voltou diferente';
  end if;
  if not (d -> 'servicos') @> '[{"id":"sv_massagem","preco":120.5,"categoriaId":"cat_corpo"}]' then
    raise exception 'T27 FALHOU: serviço voltou diferente';
  end if;
  -- tudo ou nada: um lote com um horário em conflito não grava nada
  begin
    perform public.painel_salvar('teste-a', jsonb_build_object(
      'categorias', jsonb_build_object('salvar', jsonb_build_array(jsonb_build_object('id', 'cat_nao', 'nome', 'Não pode ficar'))),
      'agendamentos', jsonb_build_object('salvar', jsonb_build_array(jsonb_build_object(
        'id', 'ag_choque', 'token', 'tokenchoque1', 'clienteId', 'cl_painel', 'profissionalId', 'pr_bia',
        'inicio', dia || 'T14:30', 'fim', dia || 'T15:00', 'itens', '[]'::jsonb)))));
    raise exception 'T27 FALHOU: conflito gravado pelo painel';
  exception when raise_exception then
    if sqlerrm not like 'Esse horário acabou de ser ocupado%' then raise; end if;
  end;
  if exists (select 1 from public.categorias where id = 'cat_nao') then raise exception 'T27 FALHOU: lote gravou pela metade'; end if;
  -- apagar a categoria solta o serviço (vai para "Outros")
  perform public.painel_salvar('teste-a', '{"categorias":{"remover":["cat_corpo"]}}');
  if (select categoria_id from public.servicos where id = 'sv_massagem') is not null then raise exception 'T27 FALHOU: serviço preso à categoria apagada'; end if;
  reset role;
end $$;
\echo T27 ok · painel_salvar: formato do app de ida e volta, tudo ou nada

-- T28 papéis: a recepção marca horário e cadastra cliente, mas não mexe no catálogo nem no financeiro
do $$ declare d jsonb; dia date := (now() at time zone 'America/Fortaleza')::date + 6; begin
  perform pg_temp.como('authenticated', '00000000-0000-0000-0000-0000000000a2');
  perform public.painel_salvar('teste-a', jsonb_build_object(
    'clientes', jsonb_build_object('salvar', jsonb_build_array(jsonb_build_object('id', 'cl_rec', 'nome', 'Rita Alves', 'telefone', '88977776666'))),
    'agendamentos', jsonb_build_object('salvar', jsonb_build_array(jsonb_build_object(
      'id', 'ag_rec', 'token', 'tokenrecep01', 'clienteId', 'cl_rec', 'profissionalId', 'pr_ana',
      'inicio', dia || 'T09:00', 'fim', dia || 'T10:00', 'itens', '[]'::jsonb)))));
  begin
    perform public.painel_salvar('teste-a', '{"servicos":{"salvar":[{"id":"sv_limpeza","nome":"Limpeza","duracaoMin":60,"preco":1}]}}');
    raise exception 'T28 FALHOU: recepção mudou preço';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.painel_salvar('teste-a', '{"negocio":{"nome":"Outro nome","pele":"beleza"}}');
    raise exception 'T28 FALHOU: recepção mudou o negócio';
  exception when insufficient_privilege then null;
  end;
  d := public.painel_dados('teste-a');
  if exists (select 1 from jsonb_array_elements(d -> 'registros') x where x ->> 'colecao' = 'lancamentos') then
    raise exception 'T28 FALHOU: recepção leu o financeiro';
  end if;
  if not exists (select 1 from jsonb_array_elements(d -> 'registros') x where x ->> 'colecao' = 'cupons') then
    raise exception 'T28 FALHOU: recepção não vê cupons';
  end if;
  reset role;
  if (select preco from public.servicos where tenant_id = 'aaaaaaaa-0000-0000-0000-000000000001' and id = 'sv_limpeza') <> 150 then
    raise exception 'T28 FALHOU: preço mudou';
  end if;
end $$;
\echo T28 ok · papéis: recepção agenda; catálogo, negócio e financeiro só dono/admin

-- T29 negocio_salvar: identidade, tema só com cores válidas, regras com limite
do $$ declare d jsonb; n jsonb; begin
  perform pg_temp.como('authenticated', '00000000-0000-0000-0000-0000000000a1');
  n := (public.painel_dados('teste-a') -> 'negocio')
    || jsonb_build_object('nome', 'Clínica A Nova', 'tagline', 'Pele boa', 'pele', 'delicada',
         'tema', jsonb_build_object('marca', '#112233', 'fundo', 'url(javascript:1)'));
  perform public.painel_salvar('teste-a', jsonb_build_object('negocio', n));
  d := public.painel_dados('teste-a') -> 'negocio';
  if d ->> 'nome' <> 'Clínica A Nova' or d ->> 'pele' <> 'delicada' or d ->> 'tagline' <> 'Pele boa' then
    raise exception 'T29 FALHOU: identidade %', d;
  end if;
  if d -> 'tema' <> '{"marca": "#112233"}'::jsonb then raise exception 'T29 FALHOU: tema aceitou lixo: %', d -> 'tema'; end if;
  if d ->> 'id' <> 'aaaaaaaa-0000-0000-0000-000000000001' or d -> 'horario' -> '1' -> 0 ->> 'inicio' <> '08:00' then
    raise exception 'T29 FALHOU: config perdida';
  end if;
  begin
    perform public.painel_salvar('teste-a', jsonb_build_object('negocio', n || '{"regras":{"fuso":"Marte/Olympus"}}'));
    raise exception 'T29 FALHOU: fuso inventado aceito';
  exception when raise_exception then null;
  end;
  begin
    perform public.painel_salvar('teste-a', jsonb_build_object('negocio', n || '{"regras":{"intervaloSlotsMin":1}}'));
    raise exception 'T29 FALHOU: passo de 1 min aceito';
  exception when raise_exception then null;
  end;
  reset role;
end $$;
\echo T29 ok · negocio_salvar valida nome, aparência, fuso, regras e cores

-- T30 vagas públicas: só serviço visível, dia fechado some, cupom vale no preço
do $$ declare r jsonb; dia date := (now() at time zone 'America/Fortaleza')::date + 3; begin
  perform pg_temp.como('anon', null);
  r := public.vagas_publicas('teste-a', array['sv_peeling'], null, null);
  if not r ? dia::text then raise exception 'T30 FALHOU: dia % sem vagas', dia; end if;
  if public.vagas_publicas('teste-a', array['sv_interno'], null, null) <> '{}'::jsonb then raise exception 'T30 FALHOU: serviço interno com vagas'; end if;
  if public.vagas_publicas('teste-b', array['sv_peeling'], null, null) <> '{}'::jsonb then raise exception 'T30 FALHOU: serviço de A em B'; end if;
  if public.cupom_publico('teste-a', 'bemvinda') ->> 'codigo' <> 'BEMVINDA' then raise exception 'T30 FALHOU: cupom'; end if;
  if public.cupom_publico('teste-b', 'BEMVINDA') is not null then raise exception 'T30 FALHOU: cupom de A em B'; end if;
  r := public.agendar('teste-a', jsonb_build_object('servicosIds', jsonb_build_array('sv_peeling'), 'data', dia, 'hora', '16:00',
    'cupom', 'bemvinda', 'cliente', jsonb_build_object('nome', 'Laura Melo', 'telefone', '88966665555')));
  if (r -> 'agendamento' ->> 'total')::numeric <> 180 or (r -> 'agendamento' ->> 'desconto')::numeric <> 20 then
    raise exception 'T30 FALHOU: cupom no preço (%)', r -> 'agendamento';
  end if;
  reset role;
  update public.store_settings set valor = jsonb_set(valor, '{datasEspeciais}', jsonb_build_array(jsonb_build_object('data', dia, 'rotulo', 'Feriado')))
  where tenant_id = 'aaaaaaaa-0000-0000-0000-000000000001' and chave = 'config';
  perform pg_temp.como('anon', null);
  if public.vagas_publicas('teste-a', array['sv_peeling'], null, null) ? dia::text then raise exception 'T30 FALHOU: feriado com vagas'; end if;
  reset role;
  if (select (dados ->> 'usos')::int from public.registros where id = 'cp_1') <> 1 then raise exception 'T30 FALHOU: uso do cupom não contou'; end if;
end $$;
\echo T30 ok · vagas públicas só do que é visível; feriado fecha; cupom no preço

\echo
\echo == suíte 003: 13 testes, 0 falhas ==
