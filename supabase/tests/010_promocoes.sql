-- =====================================================================
-- Suíte das promoções automáticas e da data de nascimento (migration 010)
--
-- Roda sobre o banco das suítes anteriores. Negócio A: limpeza de pele
-- (R$ 150) e peeling (R$ 200), só a Ana faz os dois; cupom BEMVINDA 10%.
-- Os casos de preço usam os números da DepiLED: combo R$ 120 + perna R$ 140.
-- =====================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.como(papel text, usuario text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(usuario, ''), false);
  execute format('set role %I', papel);
end $$;

-- as promoções da DepiLED, em A
create or replace function pg_temp.promos(acumular boolean) returns jsonb language sql as $$
  select jsonb_build_object('acumular', acumular,
    'variosItens', jsonb_build_object('ativo', true, 'nome', '2 áreas ou mais', 'minimo', 2, 'percentual', 15),
    'primeiraVez', jsonb_build_object('ativo', true, 'nome', 'Primeira vez', 'percentual', 10),
    'aniversario', jsonb_build_object('ativo', false, 'nome', 'Aniversariante', 'percentual', 20, 'janela', 'mes'))
$$;

create or replace function pg_temp.pedido(servicos text[], dia date, hora text, telefone text, nome text default 'Cliente Teste',
                                          nascimento text default null, cupom text default null)
returns jsonb language sql as $$
  select jsonb_build_object('servicosIds', to_jsonb(servicos), 'data', dia, 'hora', hora, 'cupom', cupom,
    'cliente', jsonb_build_object('nome', nome, 'telefone', telefone, 'nascimento', nascimento))
$$;

update public.store_settings set valor = valor || jsonb_build_object('promocoes', pg_temp.promos(true))
where tenant_id = 'aaaaaaaa-0000-0000-0000-000000000001' and chave = 'config';

-- T45 a regra de preço: o pedido do Marcelo, acumular ou só o maior, centavos, cupom, aniversário
do $$ declare
  p jsonb := pg_temp.promos(true);
  d date := date '2027-05-10';
  r jsonb;
  c10 jsonb := '{"codigo":"bemvinda","tipo":"percentual","valor":10}';
begin
  -- combo (120) + perna (140): 2 serviços → 15%
  r := public.preco_calcular(p, array[120, 140]::numeric[], false, null, d, null);
  if (r ->> 'subtotal')::numeric <> 260 or (r ->> 'desconto')::numeric <> 39 or (r ->> 'total')::numeric <> 221
     or jsonb_array_length(r -> 'descontos') <> 1 or r -> 'descontos' -> 0 ->> 'tipo' <> 'variosItens'
     or r -> 'descontos' -> 0 ->> 'nome' <> '2 áreas ou mais' then
    raise exception 'T45 FALHOU: combo + área %', r;
  end if;
  -- um combo sozinho não ganha (já tem preço de combo)
  r := public.preco_calcular(p, array[120]::numeric[], false, null, d, null);
  if (r ->> 'total')::numeric <> 120 or r -> 'descontos' <> '[]'::jsonb then raise exception 'T45 FALHOU: combo sozinho %', r; end if;
  -- 3 serviços: continua 15%
  r := public.preco_calcular(p, array[55, 70, 90]::numeric[], false, null, d, null);
  if (r ->> 'total')::numeric <> 182.75 then raise exception 'T45 FALHOU: 3 serviços %', r; end if;
  -- primeira vez junto: um sobre o outro (260 → 221 → 198,90)
  r := public.preco_calcular(p, array[120, 140]::numeric[], true, null, d, null);
  if (r ->> 'total')::numeric <> 198.90 or (r ->> 'desconto')::numeric <> 61.10
     or r -> 'descontos' -> 1 ->> 'tipo' <> 'primeiraVez' or (r -> 'descontos' -> 1 ->> 'valor')::numeric <> 22.10 then
    raise exception 'T45 FALHOU: acumulado %', r;
  end if;
  -- só o maior
  r := public.preco_calcular(pg_temp.promos(false), array[120, 140]::numeric[], true, null, d, null);
  if (r ->> 'total')::numeric <> 221 or jsonb_array_length(r -> 'descontos') <> 1 then raise exception 'T45 FALHOU: só o maior %', r; end if;
  -- centavos: 66,66 × 15% = 9,999 → 10,00
  r := public.preco_calcular(p, array[33.33, 33.33]::numeric[], false, null, d, null);
  if (r ->> 'total')::numeric <> 56.66 then raise exception 'T45 FALHOU: arredondamento %', r; end if;
  -- cupom entra por último: 198,90 − 10% = 179,01
  r := public.preco_calcular(p, array[120, 140]::numeric[], true, null, d, c10);
  if (r ->> 'total')::numeric <> 179.01 or r -> 'descontos' -> 2 ->> 'codigo' <> 'BEMVINDA' then raise exception 'T45 FALHOU: cupom %', r; end if;
  -- cupom de valor maior que a conta: zera, nunca fica negativo
  r := public.preco_calcular('{}', array[100]::numeric[], false, null, d, '{"codigo":"x","tipo":"valor","valor":500}');
  if (r ->> 'total')::numeric <> 0 or (r ->> 'desconto')::numeric <> 100 then raise exception 'T45 FALHOU: cupom grande %', r; end if;
  -- sem promoções ligadas: preço cheio
  r := public.preco_calcular(null, array[120, 140]::numeric[], true, null, d, null);
  if (r ->> 'total')::numeric <> 260 or r -> 'descontos' <> '[]'::jsonb then raise exception 'T45 FALHOU: sem promoções %', r; end if;
  -- janelas do aniversário (virada de ano, 29/02)
  if not public.aniversario_na_janela('2000-12-31', '2027-01-02', 'semana') then raise exception 'T45 FALHOU: semana na virada'; end if;
  if public.aniversario_na_janela('2000-12-31', '2027-01-02', 'dia') then raise exception 'T45 FALHOU: dia errado'; end if;
  if public.aniversario_na_janela('2000-12-31', '2027-01-02', 'mes') then raise exception 'T45 FALHOU: mês errado'; end if;
  if not public.aniversario_na_janela('2000-02-29', '2027-02-28', 'dia') then raise exception 'T45 FALHOU: 29/02 em ano comum'; end if;
  if not public.aniversario_na_janela('2000-02-29', '2028-02-29', 'dia') then raise exception 'T45 FALHOU: 29/02 em ano bissexto'; end if;
  if public.aniversario_na_janela('2000-05-20', '2027-05-10', 'semana') then raise exception 'T45 FALHOU: semana longe'; end if;
  r := public.preco_calcular(jsonb_set(p, '{aniversario,ativo}', 'true'), array[200]::numeric[], false, '1990-05-28', d, null);
  if (r ->> 'total')::numeric <> 160 or r -> 'descontos' -> 0 ->> 'tipo' <> 'aniversario' then raise exception 'T45 FALHOU: aniversário %', r; end if;
end $$;
\echo T45 ok · regra de preço: 2+ serviços, primeira vez, acumular/maior, centavos, cupom e aniversário

-- T46 agendar pelo link aplica as promoções, guarda o porquê e reconhece a primeira vez
do $$ declare
  dia date := (now() at time zone 'America/Fortaleza')::date + 5;
  r jsonb; ag jsonb; linha public.agendamentos;
begin
  perform pg_temp.como('anon', null);
  -- cliente nova, 2 serviços: 350 → 15% (52,50) → 297,50 → 10% (29,75) → 267,75
  r := public.agendar('teste-a', pg_temp.pedido(array['sv_limpeza', 'sv_peeling'], dia, '08:00', '88911110001', 'Nova Cliente'));
  ag := r -> 'agendamento';
  if (ag ->> 'total')::numeric <> 267.75 or (ag ->> 'desconto')::numeric <> 82.25
     or jsonb_array_length(ag -> 'descontos') <> 2 or ag -> 'descontos' -> 1 ->> 'nome' <> 'Primeira vez' then
    raise exception 'T46 FALHOU: promoções no link %', ag;
  end if;
  -- a mesma cliente de novo, 1 serviço: preço cheio
  r := public.agendar('teste-a', pg_temp.pedido(array['sv_peeling'], dia + 1, '08:00', '88911110001', 'Nova Cliente'));
  if (r -> 'agendamento' ->> 'total')::numeric <> 200 or r -> 'agendamento' -> 'descontos' <> '[]'::jsonb then
    raise exception 'T46 FALHOU: segunda vez com desconto %', r -> 'agendamento';
  end if;
  reset role;
  select * into linha from public.agendamentos where tenant_id = 'aaaaaaaa-0000-0000-0000-000000000001' and id = ag ->> 'id';
  if linha.total <> 267.75 or linha.desconto <> 82.25 or jsonb_array_length(linha.descontos) <> 2 then
    raise exception 'T46 FALHOU: gravado % / % / %', linha.total, linha.desconto, linha.descontos;
  end if;
  -- cliente da lista antiga (importada) não é primeira vez
  insert into public.clientes (tenant_id, id, nome, telefone, origem)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'cl_antiga', 'Cliente Antiga', '88922220002', 'importado');
  perform pg_temp.como('anon', null);
  r := public.agendar('teste-a', pg_temp.pedido(array['sv_peeling'], dia, '13:00', '88922220002', 'Cliente Antiga'));
  if (r -> 'agendamento' ->> 'total')::numeric <> 200 then raise exception 'T46 FALHOU: importada ganhou primeira vez'; end if;
  -- quem só tem horário cancelado continua sendo primeira vez
  r := public.agendar('teste-a', pg_temp.pedido(array['sv_peeling'], dia, '14:00', '88933330003', 'Desistiu Antes'));
  if (r -> 'agendamento' ->> 'total')::numeric <> 180 then raise exception 'T46 FALHOU: primeira vez (%)', r -> 'agendamento' ->> 'total'; end if;
  reset role;
  update public.agendamentos set status = 'cancelado'
  where tenant_id = 'aaaaaaaa-0000-0000-0000-000000000001' and id = r -> 'agendamento' ->> 'id';
  perform pg_temp.como('anon', null);
  r := public.agendar('teste-a', pg_temp.pedido(array['sv_peeling'], dia + 1, '14:00', '88933330003', 'Desistiu Antes'));
  if (r -> 'agendamento' ->> 'total')::numeric <> 180 then raise exception 'T46 FALHOU: cancelado tirou a primeira vez'; end if;
  -- e o que a pessoa manda de preço ou de desconto não vale nada
  r := public.agendar('teste-a', pg_temp.pedido(array['sv_peeling'], dia + 2, '16:00', '88911110001', 'Nova Cliente')
         || '{"total": 1, "desconto": 199, "descontos": [{"tipo":"cupom","valor":199}]}');
  if (r -> 'agendamento' ->> 'total')::numeric <> 200 then raise exception 'T46 FALHOU: aceitou preço de fora'; end if;
  reset role;
end $$;
\echo T46 ok · agendar aplica 2+ serviços e primeira vez, guarda os descontos; importada e cancelado tratados

-- T47 data de nascimento: obrigatória quando o negócio pede, inválida não passa, aniversário dá desconto
do $$ declare
  dia date := (now() at time zone 'America/Fortaleza')::date + 7;
  nasc text := to_char(make_date(1990, extract(month from (now() at time zone 'America/Fortaleza')::date + 7)::int, 1), 'YYYY-MM-DD');
  r jsonb;
begin
  update public.store_settings
  set valor = jsonb_set(jsonb_set(valor, '{regras,pedirNascimento}', '"obrigatorio"'),
                        '{promocoes,aniversario,ativo}', 'true')
  where tenant_id = 'aaaaaaaa-0000-0000-0000-000000000001' and chave = 'config';
  perform pg_temp.como('anon', null);
  begin
    perform public.agendar('teste-a', pg_temp.pedido(array['sv_peeling'], dia, '08:00', '88944440004', 'Sem Data'));
    raise exception 'T47 FALHOU: sem data aceita';
  exception when raise_exception then
    if sqlerrm <> 'Informe sua data de nascimento.' then raise; end if;
  end;
  begin
    perform public.agendar('teste-a', pg_temp.pedido(array['sv_peeling'], dia, '08:00', '88944440004', 'Data Errada', '2001-02-31'));
    raise exception 'T47 FALHOU: 31/02 aceito';
  exception when raise_exception then
    if sqlerrm <> 'Informe sua data de nascimento.' then raise; end if;
  end;
  begin
    perform public.agendar('teste-a', pg_temp.pedido(array['sv_peeling'], dia, '08:00', '88944440004', 'Do Futuro', '2999-01-01'));
    raise exception 'T47 FALHOU: nascida no futuro aceita';
  exception when raise_exception then
    if sqlerrm <> 'Informe sua data de nascimento.' then raise; end if;
  end;
  -- primeira vez + aniversariante do mês: 200 → 10% (20) → 180 → 20% (36) → 144
  r := public.agendar('teste-a', pg_temp.pedido(array['sv_peeling'], dia, '08:00', '88944440004', 'Aniversariante Mes', nasc));
  if (r -> 'agendamento' ->> 'total')::numeric <> 144 or r -> 'agendamento' -> 'descontos' -> 0 ->> 'tipo' <> 'primeiraVez'
     or r -> 'agendamento' -> 'descontos' -> 1 ->> 'tipo' <> 'aniversario' then
    raise exception 'T47 FALHOU: aniversário %', r -> 'agendamento';
  end if;
  reset role;
  if (select nascimento from public.clientes where tenant_id = 'aaaaaaaa-0000-0000-0000-000000000001' and telefone = '88944440004')
     <> nasc::date then
    raise exception 'T47 FALHOU: data não guardada';
  end if;
  -- cadastro sem data ganha a data digitada; com data, a guardada não muda pelo link
  update public.store_settings set valor = jsonb_set(valor, '{regras,pedirNascimento}', '"opcional"')
  where tenant_id = 'aaaaaaaa-0000-0000-0000-000000000001' and chave = 'config';
  perform pg_temp.como('anon', null);
  perform public.agendar('teste-a', pg_temp.pedido(array['sv_peeling'], dia, '09:00', '88911110001', 'Nova Cliente', '1985-01-15'));
  perform public.agendar('teste-a', pg_temp.pedido(array['sv_peeling'], dia, '10:00', '88944440004', 'Aniversariante Mes', '1970-01-01'));
  -- opcional: data inválida é ignorada, o agendamento passa
  perform public.agendar('teste-a', pg_temp.pedido(array['sv_peeling'], dia, '11:00', '88955550005', 'Data Torta', '31/12/1990'));
  reset role;
  if (select nascimento from public.clientes where tenant_id = 'aaaaaaaa-0000-0000-0000-000000000001' and telefone = '88911110001')
     <> date '1985-01-15' then
    raise exception 'T47 FALHOU: cadastro sem data não ganhou a data';
  end if;
  if (select nascimento from public.clientes where tenant_id = 'aaaaaaaa-0000-0000-0000-000000000001' and telefone = '88944440004')
     <> nasc::date then
    raise exception 'T47 FALHOU: o link trocou a data guardada';
  end if;
  update public.store_settings set valor = jsonb_set(valor, '{promocoes,aniversario,ativo}', 'false')
  where tenant_id = 'aaaaaaaa-0000-0000-0000-000000000001' and chave = 'config';
end $$;
\echo T47 ok · data de nascimento obrigatória/opcional, inválida barrada, guardada sem sobrescrever; desconto de aniversário

-- T48 painel: só promoção válida é salva
do $$ declare n jsonb; d jsonb; begin
  perform pg_temp.como('authenticated', '00000000-0000-0000-0000-0000000000a1');
  n := public.painel_dados('teste-a') -> 'negocio';
  perform public.painel_salvar('teste-a', jsonb_build_object('negocio', n || jsonb_build_object('promocoes', pg_temp.promos(false))));
  d := public.painel_dados('teste-a') -> 'negocio';
  if d -> 'promocoes' <> pg_temp.promos(false) then raise exception 'T48 FALHOU: promoções não salvas %', d -> 'promocoes'; end if;
  begin
    perform public.painel_salvar('teste-a', jsonb_build_object('negocio', jsonb_set(n || jsonb_build_object('promocoes', pg_temp.promos(true)),
      '{promocoes,variosItens,percentual}', '95')));
    raise exception 'T48 FALHOU: 95%% aceito';
  exception when raise_exception then if sqlerrm not like 'Promoção com desconto%' then raise; end if;
  end;
  begin
    perform public.painel_salvar('teste-a', jsonb_build_object('negocio', jsonb_set(n || jsonb_build_object('promocoes', pg_temp.promos(true)),
      '{promocoes,primeiraVez,percentual}', '"10"')));
    raise exception 'T48 FALHOU: percentual em texto aceito';
  exception when raise_exception then if sqlerrm not like 'Promoção com desconto%' then raise; end if;
  end;
  begin
    perform public.painel_salvar('teste-a', jsonb_build_object('negocio', jsonb_set(n || jsonb_build_object('promocoes', pg_temp.promos(true)),
      '{promocoes,primeiraVez,nome}', '""')));
    raise exception 'T48 FALHOU: nome vazio aceito';
  exception when raise_exception then if sqlerrm not like 'Promoção com desconto%' then raise; end if;
  end;
  begin
    perform public.painel_salvar('teste-a', jsonb_build_object('negocio', jsonb_set(n || jsonb_build_object('promocoes', pg_temp.promos(true)),
      '{promocoes,variosItens,minimo}', '1')));
    raise exception 'T48 FALHOU: mínimo 1 aceito';
  exception when raise_exception then if sqlerrm not like 'O desconto por vários%' then raise; end if;
  end;
  begin
    perform public.painel_salvar('teste-a', jsonb_build_object('negocio', jsonb_set(n || jsonb_build_object('promocoes', pg_temp.promos(true)),
      '{promocoes,aniversario,janela}', '"ano"')));
    raise exception 'T48 FALHOU: janela inventada aceita';
  exception when raise_exception then if sqlerrm not like 'Escolha quando vale%' then raise; end if;
  end;
  begin
    perform public.painel_salvar('teste-a', jsonb_build_object('negocio', jsonb_set(n, '{regras,pedirNascimento}', '"talvez"')));
    raise exception 'T48 FALHOU: pedirNascimento inventado aceito';
  exception when raise_exception then if sqlerrm not like 'Escolha se a data%' then raise; end if;
  end;
  -- a recepção não muda promoção
  perform pg_temp.como('authenticated', '00000000-0000-0000-0000-0000000000a2');
  begin
    perform public.painel_salvar('teste-a', jsonb_build_object('negocio', n || jsonb_build_object('promocoes', pg_temp.promos(true))));
    raise exception 'T48 FALHOU: recepção mudou promoção';
  exception when insufficient_privilege then null;
  end;
  reset role;
  -- volta ao acumulado para as próximas
  update public.store_settings set valor = jsonb_set(valor, '{promocoes,acumular}', 'true')
  where tenant_id = 'aaaaaaaa-0000-0000-0000-000000000001' and chave = 'config';
end $$;
\echo T48 ok · painel só salva promoção válida (1–90%, nome, mínimo, janela); recepção não mexe

-- T49 cupom só conta uso quando entra na conta
do $$ declare
  dia date := (now() at time zone 'America/Fortaleza')::date + 8;
  usos int := (select (dados ->> 'usos')::int from public.registros where id = 'cp_1');
  r jsonb;
begin
  update public.store_settings set valor = jsonb_set(valor, '{promocoes,acumular}', 'false')
  where tenant_id = 'aaaaaaaa-0000-0000-0000-000000000001' and chave = 'config';
  perform pg_temp.como('anon', null);
  -- só o maior: 15% (2 serviços) ganha do cupom de 10%
  r := public.agendar('teste-a', pg_temp.pedido(array['sv_limpeza', 'sv_peeling'], dia, '08:00', '88966660006', 'Cupom Teste', null, 'bemvinda'));
  if (r -> 'agendamento' ->> 'total')::numeric <> 297.50 or r -> 'agendamento' ->> 'cupom' is not null then
    raise exception 'T49 FALHOU: só o maior %', r -> 'agendamento';
  end if;
  reset role;
  if (select (dados ->> 'usos')::int from public.registros where id = 'cp_1') <> usos then raise exception 'T49 FALHOU: contou cupom não usado'; end if;
  update public.store_settings set valor = jsonb_set(valor, '{promocoes,acumular}', 'true')
  where tenant_id = 'aaaaaaaa-0000-0000-0000-000000000001' and chave = 'config';
  perform pg_temp.como('anon', null);
  -- acumulado (já não é primeira vez): 350 → 297,50 → cupom 10% (29,75) → 267,75
  r := public.agendar('teste-a', pg_temp.pedido(array['sv_limpeza', 'sv_peeling'], dia, '11:00', '88966660006', 'Cupom Teste', null, 'bemvinda'));
  if (r -> 'agendamento' ->> 'total')::numeric <> 267.75 or r -> 'agendamento' ->> 'cupom' <> 'BEMVINDA' then
    raise exception 'T49 FALHOU: acumulado com cupom %', r -> 'agendamento';
  end if;
  reset role;
  if (select (dados ->> 'usos')::int from public.registros where id = 'cp_1') <> usos + 1 then raise exception 'T49 FALHOU: uso não contou'; end if;
end $$;
\echo T49 ok · cupom: com "só o maior" pode não entrar (e não conta uso); acumulado entra por último

-- T50 painel grava e devolve os descontos; peças internas fechadas para anon e logado
do $$ declare a jsonb; dia date := (now() at time zone 'America/Fortaleza')::date + 9; begin
  perform pg_temp.como('authenticated', '00000000-0000-0000-0000-0000000000a1');
  perform public.painel_salvar('teste-a', jsonb_build_object('agendamentos', jsonb_build_object('salvar', jsonb_build_array(jsonb_build_object(
    'id', 'ag_painel_promo', 'token', 'tokpainel0001', 'clienteId', 'cl_antiga', 'profissionalId', 'pr_ana',
    'inicio', dia || 'T08:00', 'fim', dia || 'T08:30', 'status', 'confirmado', 'canal', 'whatsapp',
    'itens', '[{"servicoId":"sv_peeling","nome":"Peeling","preco":200,"duracaoMin":30}]'::jsonb,
    'total', 180, 'desconto', 20, 'descontos', '[{"tipo":"primeiraVez","nome":"Primeira vez","percentual":10,"valor":20}]'::jsonb)))));
  select x into a from jsonb_array_elements(public.painel_dados('teste-a') -> 'agendamentos') x where x ->> 'id' = 'ag_painel_promo';
  if a -> 'descontos' -> 0 ->> 'tipo' <> 'primeiraVez' or (a ->> 'total')::numeric <> 180 then raise exception 'T50 FALHOU: %', a; end if;
  perform pg_temp.como('anon', null);
  begin
    perform public.preco_calcular('{}', array[1]::numeric[], true, null, current_date, null);
    raise exception 'T50 FALHOU: anon chamou preco_calcular';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.cliente_e_novo('aaaaaaaa-0000-0000-0000-000000000001', '88911110001');
    raise exception 'T50 FALHOU: anon perguntou se o telefone é cliente';
  exception when insufficient_privilege then null;
  end;
  perform pg_temp.como('authenticated', '00000000-0000-0000-0000-0000000000a1');
  begin
    perform public.cliente_e_novo('bbbbbbbb-0000-0000-0000-000000000001', '88911110001');
    raise exception 'T50 FALHOU: logado perguntou de outro negócio';
  exception when insufficient_privilege then null;
  end;
  reset role;
end $$;
\echo T50 ok · painel grava os descontos; regra de preço e "é cliente?" fechadas para fora

\echo == suíte das promoções (010): 6 testes, 0 falhas ==
