-- =====================================================================
-- Suíte do cadastro com pagamento (migration 008)
--
-- Roda depois da suíte da agenda (007), sobre o mesmo banco: os negócios
-- de teste A e B e as pessoas de lá continuam existindo. Aqui entram
-- compras (licenças) e contas novas, como as de quem se cadastra pelo site.
-- =====================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.como(papel text, usuario text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(usuario, ''), false);
  execute format('set role %I', papel);
end $$;

-- o negócio como o app manda (lib/padroes.ts · negocioNovo)
create or replace function pg_temp.neg(p_slug text, p_nome text, p_nicho text default 'estetica') returns jsonb
language sql as $$
  select jsonb_build_object(
    'id', '', 'slug', p_slug, 'nome', p_nome, 'nicho', p_nicho, 'pele', 'beleza',
    'tagline', '', 'descricao', '', 'sobre', '', 'destaques', '[]'::jsonb,
    'tema', '{"marca":"#1f5c4b","sobreMarca":"#ffffff","fundo":"#f6f5f2","superficie":"#ffffff","texto":"#1c1c20","textoSuave":"#5f5f69","acento":"#c9a46a"}'::jsonb,
    'logoUrl', null, 'logoCompletoUrl', null, 'capaUrl', null, 'galeria', '[]'::jsonb,
    'contato', '{"whatsapp":"85999990000","instagram":"","telefone":"","email":""}'::jsonb,
    'horario', '{"0":[],"1":[{"inicio":"08:00","fim":"12:00"},{"inicio":"13:00","fim":"18:00"}],
                 "2":[{"inicio":"08:00","fim":"12:00"},{"inicio":"13:00","fim":"18:00"}],
                 "3":[{"inicio":"08:00","fim":"12:00"},{"inicio":"13:00","fim":"18:00"}],
                 "4":[{"inicio":"08:00","fim":"12:00"},{"inicio":"13:00","fim":"18:00"}],
                 "5":[{"inicio":"08:00","fim":"12:00"},{"inicio":"13:00","fim":"18:00"}],
                 "6":[{"inicio":"08:00","fim":"12:00"}]}'::jsonb,
    'aberturas', '[]'::jsonb, 'datasEspeciais', '[]'::jsonb,
    'regras', '{"intervaloSlotsMin":15,"antecedenciaMinHoras":2,"janelaMaxDias":45,"confirmacao":"automatica",
                "cancelamentoAteHoras":12,"fuso":"America/Fortaleza","escolherProfissional":true,"multiplosServicos":true}'::jsonb,
    'modulos', '{"anamnese":true,"pacotes":true,"comissoes":true,"financeiro":true,"sinal":false,"retorno":true,"avaliacoes":true,"aniversarios":true}'::jsonb,
    'pix', '{"chave":"","nome":"","cidade":""}'::jsonb, 'sinal', '{"percentual":30,"servicosIds":[]}'::jsonb,
    'metaMensal', 0, 'aviso', '{"texto":"","ativo":false}'::jsonb)
$$;

insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000000c1', 'lia@nova.teste', now()),
  ('00000000-0000-0000-0000-0000000000c2', 'sem-confirmar@nova.teste', null),
  ('00000000-0000-0000-0000-0000000000c3', 'sem-compra@nova.teste', now());

-- T31 só a plataforma registra compra; o mesmo pagamento não vira duas licenças
do $$ declare a jsonb; b jsonb; begin
  perform pg_temp.como('anon', null);
  begin
    perform public.licenca_emitir('x@x.teste');
    raise exception 'T31 FALHOU: anon emitiu licença';
  exception when insufficient_privilege then null;
  end;
  perform pg_temp.como('authenticated', '00000000-0000-0000-0000-0000000000a1');
  begin
    perform public.licenca_emitir('x@x.teste');
    raise exception 'T31 FALHOU: dona de negócio emitiu licença';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.licencas;
    if found then raise exception 'T31 FALHOU: dona leu licenças'; end if;
  exception when insufficient_privilege then null;
  end;
  perform pg_temp.como('anon', null);
  begin
    perform 1 from public.licencas;
    raise exception 'T31 FALHOU: anon leu licenças';
  exception when insufficient_privilege then null;
  end;
  reset role;
  a := public.licenca_emitir('  LIA@Nova.Teste ', 'mensal', 49.90, 'pix', 'pag-001');
  b := public.licenca_emitir('lia@nova.teste', 'mensal', 49.90, 'pix', 'pag-001');
  if a ->> 'codigo' <> b ->> 'codigo' or a ->> 'email' <> 'lia@nova.teste' then raise exception 'T31 FALHOU: % / %', a, b; end if;
  if a ->> 'link' not like 'https://agenda.livo.tec.br/painel/criar-conta?convite=%' or char_length(a ->> 'codigo') <> 36 then
    raise exception 'T31 FALHOU: link %', a ->> 'link';
  end if;
  if (select count(*) from public.licencas where referencia = 'pag-001') <> 1 then raise exception 'T31 FALHOU: licença dobrada'; end if;
  perform pg_temp.como('service_role', null);
  perform public.licenca_emitir('outra@nova.teste', 'anual', 499, 'gateway', 'pag-002');
  reset role;
end $$;
\echo T31 ok · compra só pela plataforma (ou o webhook); o mesmo pagamento não vira duas licenças

-- T32 o convite diz para quem é; código inventado não diz nada
do $$ declare c text; v jsonb; begin
  select codigo into c from public.licencas where referencia = 'pag-001';
  perform pg_temp.como('anon', null);
  v := public.convite_publico(c);
  if v ->> 'email' <> 'lia@nova.teste' or v ->> 'plano' <> 'mensal' or v ? 'valor' or v ? 'codigo' then
    raise exception 'T32 FALHOU: %', v;
  end if;
  if public.convite_publico('nao-existe') is not null or public.convite_publico(null) is not null then
    raise exception 'T32 FALHOU: código inventado respondeu';
  end if;
  reset role;
end $$;
\echo T32 ok · convite mostra só e-mail e plano; código inventado não responde

-- T33 antes de criar a conta: só e-mail com compra paga passa
do $$ declare r jsonb; begin
  perform pg_temp.como('anon', null);
  begin
    perform public.hook_antes_de_criar_conta('{"user":{"email":"lia@nova.teste"}}');
    raise exception 'T33 FALHOU: anon chamou o hook';
  exception when insufficient_privilege then null;
  end;
  perform pg_temp.como('supabase_auth_admin', null);
  r := public.hook_antes_de_criar_conta('{"user":{"email":" Lia@NOVA.teste"}}');
  if r <> '{}'::jsonb then raise exception 'T33 FALHOU: com compra foi recusado %', r; end if;
  r := public.hook_antes_de_criar_conta('{"user":{"email":"curioso@qualquer.teste"}}');
  if (r #>> '{error,http_code}')::int <> 403 or r #>> '{error,message}' not like 'Para criar a conta%' then
    raise exception 'T33 FALHOU: sem compra passou %', r;
  end if;
  r := public.hook_antes_de_criar_conta('{"user":{}}');
  if not r ? 'error' then raise exception 'T33 FALHOU: sem e-mail passou'; end if;
  reset role;
end $$;
\echo T33 ok · antes de criar a conta: só e-mail com compra paga passa

-- T34 endereço: anon confere a disponibilidade, mas não cria negócio
do $$ begin
  perform pg_temp.como('anon', null);
  if public.slug_disponivel('teste-a') <> 'em_uso' then raise exception 'T34 FALHOU: em uso'; end if;
  if public.slug_disponivel('depiled') <> 'em_uso' then raise exception 'T34 FALHOU: depiled'; end if;
  if public.slug_disponivel('ambar') <> 'em_uso' then raise exception 'T34 FALHOU: suspenso também ocupa o endereço'; end if;
  if public.slug_disponivel('painel') <> 'reservado' then raise exception 'T34 FALHOU: reservado'; end if;
  if public.slug_disponivel('Studio') <> 'invalido' then raise exception 'T34 FALHOU: maiúscula'; end if;
  if public.slug_disponivel('-luz') <> 'invalido' then raise exception 'T34 FALHOU: hífen no começo'; end if;
  if public.slug_disponivel(repeat('a', 41)) <> 'invalido' then raise exception 'T34 FALHOU: longo demais'; end if;
  if public.slug_disponivel('studio-luz') <> 'ok' then raise exception 'T34 FALHOU: livre'; end if;
  begin
    perform public.negocio_criar_meu('Lia Souza', pg_temp.neg('studio-luz', 'Studio Luz'));
    raise exception 'T34 FALHOU: anon criou negócio';
  exception when insufficient_privilege then null;
  end;
  reset role;
end $$;
\echo T34 ok · endereço conferido por qualquer um; criar negócio exige conta

-- T35 sem login, sem e-mail confirmado ou sem compra, nada nasce
do $$ begin
  perform pg_temp.como('authenticated', null);
  begin
    perform public.negocio_criar_meu('Lia Souza', pg_temp.neg('studio-luz', 'Studio Luz'));
    raise exception 'T35 FALHOU: sem login';
  exception when insufficient_privilege then null;
  end;
  perform pg_temp.como('authenticated', '00000000-0000-0000-0000-0000000000c2');
  begin
    perform public.negocio_criar_meu('Sem Confirmar', pg_temp.neg('studio-luz', 'Studio Luz'));
    raise exception 'T35 FALHOU: e-mail não confirmado criou';
  exception when raise_exception then
    if sqlerrm not like 'Confirme seu e-mail%' then raise; end if;
  end;
  perform pg_temp.como('authenticated', '00000000-0000-0000-0000-0000000000c3');
  begin
    perform public.negocio_criar_meu('Sem Compra', pg_temp.neg('studio-luz', 'Studio Luz'));
    raise exception 'T35 FALHOU: conta sem compra criou negócio';
  exception when raise_exception then
    if sqlerrm not like 'Não encontramos uma compra%' then raise; end if;
  end;
  reset role;
  if exists (select 1 from public.tenants where slug = 'studio-luz') then raise exception 'T35 FALHOU: sobrou negócio'; end if;
end $$;
\echo T35 ok · sem login, sem e-mail confirmado ou sem compra, o negócio não nasce

-- T36 dado ruim no meio: tudo ou nada, e a compra continua valendo
do $$ declare antes int; endereco text; begin
  select count(*) into antes from public.tenant_members;
  perform pg_temp.como('authenticated', '00000000-0000-0000-0000-0000000000c1');
  foreach endereco in array array['teste-a', 'painel', 'Studio Luz', ''] loop
    begin
      perform public.negocio_criar_meu('Lia Souza', pg_temp.neg(endereco, 'Outro Nome'));
      raise exception 'T36 FALHOU: aceitou o endereço "%"', endereco;
    exception when raise_exception then
      if sqlerrm like 'T36%' then raise; end if;
    end;
  end loop;
  begin
    perform public.negocio_criar_meu('Lia Souza',
      jsonb_set(pg_temp.neg('studio-dois', 'Studio Dois'), '{regras,intervaloSlotsMin}', '1'));
    raise exception 'T36 FALHOU: regra fora do limite passou';
  exception when raise_exception then
    if sqlerrm not like 'Regras de agendamento%' then raise; end if;
  end;
  begin
    perform public.negocio_criar_meu('Lia Souza', pg_temp.neg('studio-dois', 'S'));
    raise exception 'T36 FALHOU: nome curto passou';
  exception when raise_exception then
    if sqlerrm not like 'O nome do negócio%' then raise; end if;
  end;
  begin
    perform public.negocio_criar_meu('Lia Souza', pg_temp.neg('studio-dois', 'Studio Dois', 'cassino'));
    raise exception 'T36 FALHOU: tipo inventado passou';
  exception when raise_exception then
    if sqlerrm not like 'Escolha o tipo%' then raise; end if;
  end;
  begin
    perform public.negocio_criar_meu('L', pg_temp.neg('studio-dois', 'Studio Dois'));
    raise exception 'T36 FALHOU: sem nome da pessoa passou';
  exception when raise_exception then
    if sqlerrm not like 'Diga seu nome%' then raise; end if;
  end;
  reset role;
  if exists (select 1 from public.tenants where slug = 'studio-dois')
     or (select count(*) from public.tenant_members) <> antes
     or (select situacao from public.licencas where referencia = 'pag-001') <> 'paga' then
    raise exception 'T36 FALHOU: sobrou pedaço ou a compra foi gasta';
  end if;
end $$;
\echo T36 ok · dado ruim recusa o pedido inteiro e a compra continua valendo

-- T37 com a compra: o negócio nasce, a pessoa vira dona, a licença é gasta
do $$ declare s text; t public.tenants; p jsonb; d jsonb; l public.licencas; convite text; begin
  select codigo into convite from public.licencas where referencia = 'pag-001';
  perform pg_temp.como('authenticated', '00000000-0000-0000-0000-0000000000c1');
  s := public.negocio_criar_meu('  Lia   Souza ', pg_temp.neg('studio-luz', '  Studio   Luz '));
  if s <> 'studio-luz' then raise exception 'T37 FALHOU: devolveu %', s; end if;
  if (select count(*) from public.meus_negocios() m where m.slug = 'studio-luz' and m.papel = 'owner') <> 1 then
    raise exception 'T37 FALHOU: não virou dona';
  end if;
  d := public.painel_dados('studio-luz');
  if d -> 'negocio' ->> 'nome' <> 'Studio Luz' then raise exception 'T37 FALHOU: nome %', d -> 'negocio' ->> 'nome'; end if;
  if d -> 'negocio' -> 'regras' ->> 'intervaloSlotsMin' <> '15' then raise exception 'T37 FALHOU: regras'; end if;
  if d -> 'negocio' -> 'contato' ->> 'whatsapp' <> '85999990000' then raise exception 'T37 FALHOU: whatsapp'; end if;
  if d -> 'negocio' -> 'tema' ->> 'marca' <> '#1f5c4b' then raise exception 'T37 FALHOU: tema'; end if;
  if jsonb_array_length(d -> 'profissionais') <> 1
     or d -> 'profissionais' -> 0 ->> 'nome' <> 'Lia Souza'
     or d -> 'profissionais' -> 0 -> 'acesso' ->> 'email' <> 'lia@nova.teste'
     or jsonb_array_length(d -> 'profissionais' -> 0 -> 'horario' -> '1') <> 2 then
    raise exception 'T37 FALHOU: profissional %', d -> 'profissionais';
  end if;
  -- a compra acabou: o segundo negócio precisa de outra
  begin
    perform public.negocio_criar_meu('Lia Souza', pg_temp.neg('studio-luz-2', 'Studio Luz 2'));
    raise exception 'T37 FALHOU: a mesma compra criou dois negócios';
  exception when raise_exception then
    if sqlerrm not like 'Não encontramos uma compra%' then raise; end if;
  end;
  -- o dono de outro negócio não entra
  perform pg_temp.como('authenticated', '00000000-0000-0000-0000-0000000000b1');
  begin
    perform public.painel_dados('studio-luz');
    raise exception 'T37 FALHOU: outra conta abriu o painel';
  exception when insufficient_privilege then null;
  end;
  perform pg_temp.como('anon', null);
  p := public.pagina_publica('studio-luz');
  if p -> 'negocio' ->> 'nome' <> 'Studio Luz' or jsonb_array_length(p -> 'profissionais') <> 1 then
    raise exception 'T37 FALHOU: página %', p;
  end if;
  if p -> 'profissionais' -> 0 -> 'acesso' <> 'null'::jsonb then raise exception 'T37 FALHOU: e-mail da dona na página'; end if;
  if public.convite_publico(convite) <> '{"usado": true}'::jsonb then
    raise exception 'T37 FALHOU: convite gasto ainda aparece como livre';
  end if;
  perform pg_temp.como('supabase_auth_admin', null);
  if not public.hook_antes_de_criar_conta('{"user":{"email":"lia@nova.teste"}}') ? 'error' then
    raise exception 'T37 FALHOU: compra gasta ainda abre conta nova';
  end if;
  reset role;
  select * into t from public.tenants where slug = 'studio-luz';
  if t.plano <> 'mensal' or t.nicho <> 'estetica' or t.pele <> 'beleza' or t.status <> 'active' then
    raise exception 'T37 FALHOU: tenant %', row_to_json(t);
  end if;
  select * into l from public.licencas where referencia = 'pag-001';
  if l.situacao <> 'usada' or l.tenant_id <> t.id or l.user_id <> '00000000-0000-0000-0000-0000000000c1' or l.usada_em is null then
    raise exception 'T37 FALHOU: licença %', row_to_json(l);
  end if;
end $$;
\echo T37 ok · com a compra o negócio nasce, a pessoa vira dona e a compra é gasta (uma compra, um negócio)

-- T38 a dona cadastra o primeiro serviço pelo painel e a agenda já abre
do $$ declare d jsonb; pro jsonb; tid uuid; v text[]; begin
  perform pg_temp.como('authenticated', '00000000-0000-0000-0000-0000000000c1');
  d := public.painel_dados('studio-luz');
  pro := jsonb_set(d -> 'profissionais' -> 0, '{servicosIds}', '["sv_limpeza"]');
  perform public.painel_salvar('studio-luz', jsonb_build_object(
    'servicos', jsonb_build_object('salvar', jsonb_build_array(jsonb_build_object(
      'id', 'sv_limpeza', 'categoriaId', '', 'nome', 'Limpeza de pele', 'descricao', '', 'duracaoMin', 30,
      'intervaloMin', 0, 'preco', 120, 'modoPreco', 'fixo', 'online', true, 'ativo', true, 'pausado', false,
      'destaque', false, 'ordem', 0))),
    'profissionais', jsonb_build_object('salvar', jsonb_build_array(pro))));
  reset role;
  select id into tid from public.tenants where slug = 'studio-luz';
  -- segunda-feira, 08–12 e 13–18, passos de 15 min, serviço de 30 min
  select array_agg(x.hora order by x.hora) into v
  from public.vagas_do_dia(tid, array['sv_limpeza'], null, date '2030-01-07', timestamp '2030-01-06 12:00') x;
  if v[1] <> '08:00' or not ('11:30' = any(v)) or '11:45' = any(v) or '12:00' = any(v)
     or not ('13:00' = any(v)) or v[array_length(v, 1)] <> '17:30' or array_length(v, 1) <> 34 then
    raise exception 'T38 FALHOU: vagas %', v;
  end if;
end $$;
\echo T38 ok · primeiro serviço cadastrado e a agenda do negócio novo já mostra vagas

\echo == suíte do cadastro (008): 8 testes, 0 falhas ==
