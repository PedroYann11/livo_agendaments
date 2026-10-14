-- =====================================================================
-- Suíte dos avisos no celular (migration 013)
--
-- Negócio A (dona + recepção, Ana e Bia atendendo) e negócio B (dono), da
-- suíte da agenda. O pg_net daqui só anota os pedidos (00_ambiente.sql):
-- cada linha nova em net.pedidos_teste é um aviso que iria para a edge.
-- =====================================================================

\set ON_ERROR_STOP on

-- como a API da Supabase: todo pedido carrega as claims do JWT
create or replace function pg_temp.como(papel text, usuario text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(usuario, ''), false);
  perform set_config('request.jwt.claims', json_build_object('role', papel, 'sub', usuario)::text, false);
  execute format('set role %I', papel);
end $$;

-- SQL Editor, pg_cron, manutenção: sem claims
create or replace function pg_temp.manutencao() returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claims', '', false);
end $$;

create or replace function pg_temp.ultimo_pedido() returns bigint language sql as $$
  select coalesce(max(id), 0) from net.pedidos_teste
$$;

-- o nome de A (a suíte da agenda o troca)
create or replace function pg_temp.nome_a() returns text language sql as $$
  select nome from public.tenants where id = 'aaaaaaaa-0000-0000-0000-000000000001'
$$;

-- "sáb, 14/11 às 09:00" (ou hoje/amanhã), como o aviso escreve
create or replace function pg_temp.quando(dia date, hora text) returns text language sql as $$
  select case dia - (now() at time zone 'America/Fortaleza')::date when 0 then 'hoje' when 1 then 'amanhã'
    else (array['dom','seg','ter','qua','qui','sex','sáb'])[extract(dow from dia)::int + 1] || ', ' || to_char(dia, 'DD/MM')
    end || ' às ' || hora
$$;

-- T57 aparelhos: só as portas escrevem, cada um vê o seu, só endereço de serviço de push
do $$ declare
  dona_a text := '00000000-0000-0000-0000-0000000000a1';
  recepcao_a text := '00000000-0000-0000-0000-0000000000a2';
  dono_b text := '00000000-0000-0000-0000-0000000000b1';
  e text;
  n int;
begin
  perform pg_temp.como('anon', null);
  begin
    perform public.aviso_situacao('teste-a', null);
    raise exception 'T57 FALHOU: anon chamou aviso_situacao';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.aparelhos_aviso;
    raise exception 'T57 FALHOU: anon leu aparelhos_aviso';
  exception when insufficient_privilege then null;
  end;

  perform pg_temp.como('authenticated', dona_a);
  perform public.aviso_aparelho_salvar('teste-a', 'https://web.push.apple.com/QGdvbmEtYS1pcGhvbmU', repeat('B', 87), repeat('a', 22), 'iPhone');
  perform pg_temp.como('authenticated', recepcao_a);
  perform public.aviso_aparelho_salvar('teste-a', 'https://fcm.googleapis.com/fcm/send/recepcao-a', repeat('C', 87), repeat('b', 22), 'Android');
  -- o mesmo aparelho de novo atualiza, não duplica
  perform public.aviso_aparelho_salvar('teste-a', 'https://fcm.googleapis.com/fcm/send/recepcao-a', repeat('D', 87), repeat('c', 22), 'Android');
  select count(*) into n from public.aparelhos_aviso;
  if n <> 1 then raise exception 'T57 FALHOU: a recepção enxergou % aparelho(s)', n; end if;
  begin
    insert into public.aparelhos_aviso (tenant_id, usuario_id, endpoint, p256dh, auth)
    values ('aaaaaaaa-0000-0000-0000-000000000001', recepcao_a::uuid, 'https://fcm.googleapis.com/fcm/send/direto', repeat('E', 87), repeat('d', 22));
    raise exception 'T57 FALHOU: insert direto na tabela';
  exception when insufficient_privilege then null;
  end;

  perform pg_temp.como('authenticated', dono_b);
  begin
    perform public.aviso_aparelho_salvar('teste-a', 'https://fcm.googleapis.com/fcm/send/intruso', repeat('F', 87), repeat('e', 22), 'x');
    raise exception 'T57 FALHOU: dono de B salvou aparelho em A';
  exception when insufficient_privilege then null;
  end;
  -- a edge entrega para o endereço guardado: nada fora dos serviços de push
  foreach e in array array['http://fcm.googleapis.com/fcm/send/x', 'https://169.254.169.254/latest/meta-data',
      'https://fcm.googleapis.com.ataque.com/x', 'https://ataque.com/?https://fcm.googleapis.com/x',
      'https://web.push.apple.com/', 'https://localhost:54321/rest/v1/'] loop
    begin
      perform public.aviso_aparelho_salvar('teste-b', e, repeat('G', 87), repeat('f', 22), 'x');
      raise exception 'T57 FALHOU: aceitou o endereço %', e;
    exception when raise_exception then
      if sqlerrm not like 'Este navegador%' then raise; end if;
    end;
  end loop;
  begin
    perform public.aviso_aparelho_salvar('teste-b', 'https://fcm.googleapis.com/fcm/send/chave-ruim', 'curta', repeat('f', 22), 'x');
    raise exception 'T57 FALHOU: aceitou chave fora do formato';
  exception when check_violation then null;
  end;
  -- até 20 aparelhos por negócio: o mais antigo sai
  for i in 1..21 loop
    perform public.aviso_aparelho_salvar('teste-b', 'https://updates.push.services.mozilla.com/wpush/v2/b-' || i,
      repeat('H', 87), repeat('g', 22), 'Computador ' || i);
  end loop;
  perform pg_temp.manutencao();
  select count(*) into n from public.aparelhos_aviso where tenant_id = 'bbbbbbbb-0000-0000-0000-000000000001' and ativo;
  if n <> 20 then raise exception 'T57 FALHOU: B ficou com % aparelhos', n; end if;
  if exists (select 1 from public.aparelhos_aviso where endpoint like '%/b-1' and ativo) then
    raise exception 'T57 FALHOU: o aparelho mais antigo de B ficou ligado';
  end if;
  -- desligar não apaga nada (remoção suave) e religar volta o mesmo aparelho
  if (select count(*) from public.aparelhos_aviso where tenant_id = 'bbbbbbbb-0000-0000-0000-000000000001') <> 21 then
    raise exception 'T57 FALHOU: o limite apagou aparelho';
  end if;
  perform pg_temp.como('authenticated', dono_b);
  perform public.aviso_aparelho_salvar('teste-b', 'https://updates.push.services.mozilla.com/wpush/v2/b-1', repeat('H', 87), repeat('g', 22), 'Computador 1');
  perform pg_temp.manutencao();
  if not exists (select 1 from public.aparelhos_aviso where endpoint like '%/b-1' and ativo)
     or (select count(*) from public.aparelhos_aviso where tenant_id = 'bbbbbbbb-0000-0000-0000-000000000001' and ativo) <> 20 then
    raise exception 'T57 FALHOU: religar o aparelho antigo';
  end if;
end $$;
\echo T57 ok · aparelhos só pelas portas, cada um vê o seu, endereço só de serviço de push, até 20 ligados por negócio (nada apagado)

-- T58 a cliente agenda pelo site → um pedido para a edge, com o texto pronto
do $$ declare
  dia date := (now() at time zone 'America/Fortaleza')::date + 9;
  antes bigint := pg_temp.ultimo_pedido();
  r jsonb;
  p net.pedidos_teste;
  n int;
  segredo text;
begin
  perform pg_temp.como('anon', null);
  r := public.agendar('teste-a', jsonb_build_object(
    'servicosIds', jsonb_build_array('sv_peeling'), 'profissionalId', 'pr_ana', 'data', dia, 'hora', '14:00',
    'cliente', jsonb_build_object('nome', 'Carla Avisada', 'telefone', '88999997001')));
  perform pg_temp.manutencao();
  perform set_config('teste.token', r #>> '{agendamento,token}', false);

  select count(*) into n from net.pedidos_teste where id > antes;
  if n <> 1 then raise exception 'T58 FALHOU: % pedido(s) para a edge', n; end if;
  select * into p from net.pedidos_teste where id > antes;
  select decrypted_secret into segredo from vault.decrypted_secrets where name = 'avisos_segredo';
  if p.url <> 'https://tgjbrabbimdwafvcshtx.supabase.co/functions/v1/avisos' then raise exception 'T58 FALHOU: url %', p.url; end if;
  if char_length(segredo) <> 64 or p.headers ->> 'x-avisos-segredo' is distinct from segredo then
    raise exception 'T58 FALHOU: segredo do pedido';
  end if;
  if p.body ->> 'acao' <> 'avisar' or p.body ->> 'tenant_id' <> 'aaaaaaaa-0000-0000-0000-000000000001'
     or p.body -> 'usuario_id' <> 'null'::jsonb then
    raise exception 'T58 FALHOU: corpo %', p.body;
  end if;
  if p.body #>> '{aviso,titulo}' <> 'Novo agendamento · ' || pg_temp.nome_a() then raise exception 'T58 FALHOU: título %', p.body #>> '{aviso,titulo}'; end if;
  if p.body #>> '{aviso,corpo}' <> 'Carla Avisada · Peeling · ' || pg_temp.quando(dia, '14:00') || ' · com Ana' then
    raise exception 'T58 FALHOU: texto "%"', p.body #>> '{aviso,corpo}';
  end if;
  if p.body #>> '{aviso,url}' <> '/painel/agenda?data=' || dia then raise exception 'T58 FALHOU: url do aviso %', p.body #>> '{aviso,url}'; end if;
  if p.body #>> '{aviso,tag}' not like 'ag-ag\_%-novo-%' then raise exception 'T58 FALHOU: etiqueta %', p.body #>> '{aviso,tag}'; end if;
end $$;
\echo T58 ok · agendamento pelo site → um pedido à edge com segredo, título, texto no fuso e link para o dia

-- T59 remarcar e cancelar pelo link avisam; a equipe e a manutenção, não
do $$ declare
  dia date := (now() at time zone 'America/Fortaleza')::date + 9;
  token text := current_setting('teste.token');
  antes bigint;
  p net.pedidos_teste;
  n int;
  cli text;
begin
  antes := pg_temp.ultimo_pedido();
  perform pg_temp.como('anon', null);
  perform public.agendamento_remarcar('teste-a', token, dia, '15:00');
  perform pg_temp.manutencao();
  select count(*) into n from net.pedidos_teste where id > antes;
  if n <> 1 then raise exception 'T59 FALHOU: remarcar gerou % pedido(s)', n; end if;
  select * into p from net.pedidos_teste where id > antes;
  if p.body #>> '{aviso,titulo}' <> 'Agendamento remarcado · ' || pg_temp.nome_a()
     or p.body #>> '{aviso,corpo}' <> 'Carla Avisada · Peeling · de ' || pg_temp.quando(dia, '14:00')
                                      || ' para ' || pg_temp.quando(dia, '15:00') || ' · com Ana' then
    raise exception 'T59 FALHOU: remarcado "%" / "%"', p.body #>> '{aviso,titulo}', p.body #>> '{aviso,corpo}';
  end if;

  antes := pg_temp.ultimo_pedido();
  perform pg_temp.como('anon', null);
  perform public.agendamento_cancelar('teste-a', token);
  perform pg_temp.manutencao();
  select * into p from net.pedidos_teste where id > antes;
  if p.id is null or p.body #>> '{aviso,titulo}' <> 'Agendamento cancelado · ' || pg_temp.nome_a()
     or p.body #>> '{aviso,corpo}' <> 'Carla Avisada · Peeling · ' || pg_temp.quando(dia, '15:00') || ' · com Ana. O horário ficou livre.' then
    raise exception 'T59 FALHOU: cancelado "%" / "%"', p.body #>> '{aviso,titulo}', p.body #>> '{aviso,corpo}';
  end if;

  -- a dona agenda (mesmo marcado como "online"), remarca e cancela pelo painel: nenhum aviso
  select a.cliente_id into cli from public.agendamentos a where a.token = current_setting('teste.token');
  antes := pg_temp.ultimo_pedido();
  perform pg_temp.como('authenticated', '00000000-0000-0000-0000-0000000000a1');
  perform public.painel_salvar('teste-a', jsonb_build_object('agendamentos', jsonb_build_object('salvar', jsonb_build_array(
    jsonb_build_object('id', 'ag_painel_aviso', 'token', 'tokpainelaviso', 'clienteId', cli, 'profissionalId', 'pr_ana',
      'inicio', dia || 'T09:00', 'fim', dia || 'T09:30', 'status', 'confirmado', 'canal', 'online')))));
  perform public.painel_salvar('teste-a', jsonb_build_object('agendamentos', jsonb_build_object('salvar', jsonb_build_array(
    jsonb_build_object('id', 'ag_painel_aviso', 'token', 'tokpainelaviso', 'clienteId', cli, 'profissionalId', 'pr_ana',
      'inicio', dia || 'T10:00', 'fim', dia || 'T10:30', 'status', 'cancelado', 'canceladoPor', 'cliente', 'canal', 'online')))));
  perform pg_temp.manutencao();
  -- manutenção pelo SQL (sem claims) também não avisa
  update public.agendamentos set status = 'confirmado', cancelado_por = null where id = 'ag_painel_aviso';
  update public.agendamentos set status = 'cancelado', cancelado_por = 'cliente' where id = 'ag_painel_aviso';
  -- nem uma rotina com service_role pela API
  perform pg_temp.como('service_role', null);
  update public.agendamentos set status = 'confirmado', cancelado_por = null where id = 'ag_painel_aviso';
  update public.agendamentos set status = 'cancelado', cancelado_por = 'cliente' where id = 'ag_painel_aviso';
  perform pg_temp.manutencao();
  select count(*) into n from net.pedidos_teste where id > antes;
  if n <> 0 then raise exception 'T59 FALHOU: painel/manutenção geraram % pedido(s)', n; end if;
end $$;
\echo T59 ok · remarcar e cancelar pelo link avisam (de → para, horário livre); painel, manutenção e service_role não

-- T60 confirmação manual e uma pessoa só atendendo
do $$ declare
  dia date := (now() at time zone 'America/Fortaleza')::date + 9;
  antes bigint := pg_temp.ultimo_pedido();
  cfg jsonb;
  p net.pedidos_teste;
begin
  select valor into cfg from public.store_settings where tenant_id = 'aaaaaaaa-0000-0000-0000-000000000001' and chave = 'config';
  update public.store_settings set valor = jsonb_set(valor, '{regras,confirmacao}', '"manual"')
  where tenant_id = 'aaaaaaaa-0000-0000-0000-000000000001' and chave = 'config';
  update public.profissionais set ativo = false where tenant_id = 'aaaaaaaa-0000-0000-0000-000000000001' and id = 'pr_bia';
  perform pg_temp.como('anon', null);
  perform public.agendar('teste-a', jsonb_build_object(
    'servicosIds', jsonb_build_array('sv_peeling'), 'data', dia, 'hora', '16:00',
    'cliente', jsonb_build_object('nome', 'Duda Pendente', 'telefone', '88999997002')));
  perform pg_temp.manutencao();
  update public.store_settings set valor = cfg where tenant_id = 'aaaaaaaa-0000-0000-0000-000000000001' and chave = 'config';
  update public.profissionais set ativo = true where tenant_id = 'aaaaaaaa-0000-0000-0000-000000000001' and id = 'pr_bia';
  select * into p from net.pedidos_teste where id > antes;
  if p.body #>> '{aviso,titulo}' <> 'Pedido de agendamento · ' || pg_temp.nome_a()
     or p.body #>> '{aviso,corpo}' <> 'Duda Pendente · Peeling · ' || pg_temp.quando(dia, '16:00') || '. Aguarda a sua confirmação.' then
    raise exception 'T60 FALHOU: "%" / "%"', p.body #>> '{aviso,titulo}', p.body #>> '{aviso,corpo}';
  end if;
end $$;
\echo T60 ok · confirmação manual vira "Pedido de agendamento"; com uma pessoa só, sem "com fulana"

-- T61 o agendamento nunca depende do aviso
create or replace function net.http_post(url text, body jsonb default '{}'::jsonb, params jsonb default '{}'::jsonb,
  headers jsonb default '{"Content-Type": "application/json"}'::jsonb, timeout_milliseconds int default 5000)
returns bigint language plpgsql as $$ begin raise exception 'rede fora do ar'; end $$;
do $$ declare
  dia date := (now() at time zone 'America/Fortaleza')::date + 9;
  r jsonb;
begin
  perform pg_temp.como('anon', null);
  r := public.agendar('teste-a', jsonb_build_object(
    'servicosIds', jsonb_build_array('sv_limpeza'), 'profissionalId', 'pr_bia', 'data', dia, 'hora', '08:00',
    'cliente', jsonb_build_object('nome', 'Eva Semrede', 'telefone', '88999997003')));
  perform pg_temp.manutencao();
  if not exists (select 1 from public.agendamentos where token = r #>> '{agendamento,token}') then
    raise exception 'T61 FALHOU: o agendamento não gravou';
  end if;
  -- sem pg_net nenhum, também grava
  drop function net.http_post(text, jsonb, jsonb, jsonb, int);
  perform pg_temp.como('anon', null);
  r := public.agendar('teste-a', jsonb_build_object(
    'servicosIds', jsonb_build_array('sv_limpeza'), 'profissionalId', 'pr_bia', 'data', dia, 'hora', '11:00',
    'cliente', jsonb_build_object('nome', 'Eva Semrede', 'telefone', '88999997003')));
  perform pg_temp.manutencao();
  if not exists (select 1 from public.agendamentos where token = r #>> '{agendamento,token}') then
    raise exception 'T61 FALHOU: sem pg_net, o agendamento não gravou';
  end if;
end $$;
create or replace function net.http_post(url text, body jsonb default '{}'::jsonb, params jsonb default '{}'::jsonb,
  headers jsonb default '{"Content-Type": "application/json"}'::jsonb, timeout_milliseconds int default 5000)
returns bigint language sql as $$
  insert into net.pedidos_teste (url, headers, body) values (url, headers, body) returning id
$$;
\echo T61 ok · com a rede fora ou sem pg_net, o agendamento grava (o aviso só some)

-- T62 portas da edge: só service_role; chaves VAPID guardadas uma vez
do $$ declare
  pub1 text := 'B' || repeat('A', 86);
  priv1 text := repeat('p', 43);
  r text;
  n int;
  f text;
begin
  foreach f in array array['aviso_segredo(text)', 'aviso_chaves_guardar(text,text)', 'aviso_destinos(uuid,uuid)',
      'aviso_esquecer(uuid,uuid)', 'aviso_disparar(uuid,jsonb,uuid)', 'aviso_chamar_edge(jsonb)', 'aviso_preparar()',
      'aviso_do_agendamento(text,public.agendamentos,timestamptz)', 'agendamentos_avisar()'] loop
    if has_function_privilege('anon', 'public.' || f, 'execute') or has_function_privilege('authenticated', 'public.' || f, 'execute') then
      raise exception 'T62 FALHOU: anon/authenticated executam %', f;
    end if;
  end loop;
  foreach f in array array['aviso_disparar(uuid,jsonb,uuid)', 'aviso_chamar_edge(jsonb)', 'aviso_preparar()'] loop
    if has_function_privilege('service_role', 'public.' || f, 'execute') then raise exception 'T62 FALHOU: service_role executa %', f; end if;
  end loop;

  set role service_role;
  select count(*) into n from public.aviso_destinos('aaaaaaaa-0000-0000-0000-000000000001');
  if n <> 2 then raise exception 'T62 FALHOU: % destinos em A', n; end if;
  select count(*) into n from public.aviso_destinos('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1');
  if n <> 1 then raise exception 'T62 FALHOU: % destinos da dona', n; end if;
  if public.aviso_segredo('qualquer_outro') is not null then raise exception 'T62 FALHOU: leu segredo fora da lista'; end if;
  if public.aviso_segredo('avisos_vapid_publica') is not null then raise exception 'T62 FALHOU: chave antes de preparar'; end if;
  begin
    perform public.aviso_chaves_guardar('curta', priv1);
    raise exception 'T62 FALHOU: chave pública inválida aceita';
  exception when raise_exception then
    if sqlerrm not like 'Chaves VAPID%' then raise; end if;
  end;
  r := public.aviso_chaves_guardar(pub1, priv1);
  if r <> pub1 then raise exception 'T62 FALHOU: guardou %', r; end if;
  -- a segunda edge a gerar fica com o par da primeira
  r := public.aviso_chaves_guardar('C' || repeat('A', 86), repeat('q', 43));
  if r <> pub1 or public.aviso_segredo('avisos_vapid_privada') <> priv1 then raise exception 'T62 FALHOU: trocou o par'; end if;
  reset role;
  select count(*) into n from vault.secrets where name like 'avisos_vapid_%';
  if n <> 2 then raise exception 'T62 FALHOU: % chaves VAPID no Vault', n; end if;
end $$;
\echo T62 ok · portas da edge só para service_role; par VAPID guardado uma vez, nada fora da lista

-- T63 o interruptor do painel e o aviso de teste
do $$ declare
  dona_a text := '00000000-0000-0000-0000-0000000000a1';
  recepcao_a text := '00000000-0000-0000-0000-0000000000a2';
  antes bigint := pg_temp.ultimo_pedido();
  s jsonb;
  r jsonb;
  p net.pedidos_teste;
begin
  perform pg_temp.como('authenticated', dona_a);
  s := public.aviso_situacao('teste-a', 'https://web.push.apple.com/QGdvbmEtYS1pcGhvbmU');
  if s ->> 'chave' <> 'B' || repeat('A', 86) or s ->> 'esteAparelho' <> 'true' or (s ->> 'aparelhos')::int <> 2 then
    raise exception 'T63 FALHOU: situação %', s;
  end if;
  if public.aviso_situacao('teste-a', 'https://fcm.googleapis.com/fcm/send/outro') ->> 'esteAparelho' <> 'false' then
    raise exception 'T63 FALHOU: aparelho desconhecido como ligado';
  end if;
  r := public.aviso_teste('teste-a');
  if (r ->> 'aparelhos')::int <> 1 then raise exception 'T63 FALHOU: teste %', r; end if;
  begin
    perform public.aviso_teste('teste-a');
    raise exception 'T63 FALHOU: dois testes seguidos';
  exception when raise_exception then
    if sqlerrm not like 'Aviso de teste enviado há pouco%' then raise; end if;
  end;
  perform pg_temp.como('authenticated', recepcao_a);
  perform public.aviso_aparelho_remover('teste-a', 'https://fcm.googleapis.com/fcm/send/recepcao-a');
  if public.aviso_situacao('teste-a', 'https://fcm.googleapis.com/fcm/send/recepcao-a') ->> 'esteAparelho' <> 'false'
     or (public.aviso_situacao('teste-a', null) ->> 'aparelhos')::int <> 1 then
    raise exception 'T63 FALHOU: aparelho desligado ainda conta';
  end if;
  begin
    perform public.aviso_teste('teste-a');
    raise exception 'T63 FALHOU: teste sem aparelho';
  exception when raise_exception then
    if sqlerrm not like 'Ligue os avisos%' then raise; end if;
  end;
  perform pg_temp.manutencao();

  select * into p from net.pedidos_teste where id > antes;
  if p.body ->> 'usuario_id' <> dona_a or p.body #>> '{aviso,titulo}' <> 'Avisos ligados' then
    raise exception 'T63 FALHOU: pedido do teste %', p.body;
  end if;
  if (select count(*) from net.pedidos_teste where id > antes) <> 1 then raise exception 'T63 FALHOU: pedidos a mais'; end if;
end $$;
\echo T63 ok · situação do aparelho, aviso de teste só para quem pediu (um a cada 15 s)

-- limpa o que a suíte criou
delete from public.agendamentos where tenant_id = 'aaaaaaaa-0000-0000-0000-000000000001'
  and cliente_id in (select id from public.clientes where telefone like '8899999700_');
delete from public.clientes where tenant_id = 'aaaaaaaa-0000-0000-0000-000000000001' and telefone like '8899999700_';
delete from public.aparelhos_aviso;
\echo == suíte dos avisos no celular (013): 7 testes, 0 falhas ==
