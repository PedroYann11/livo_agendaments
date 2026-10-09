-- =====================================================================
-- Suíte do convite para assumir um negócio pronto (migration 009)
--
-- Roda depois da suíte do cadastro (008), sobre o mesmo banco. A DepiLED
-- de teste não tem dono, como em produção: o convite é o jeito de ela
-- ganhar um, pelo mesmo caminho de cadastro do cliente.
-- =====================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.como(papel text, usuario text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(usuario, ''), false);
  execute format('set role %I', papel);
end $$;

insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000000e1', 'convidada@depiled.teste', now()),
  ('00000000-0000-0000-0000-0000000000e2', 'nao-confirmou@depiled.teste', null);

-- T39 convite de negócio pronto: só a plataforma emite, e só para negócio no ar
do $$ declare a jsonb; b jsonb; begin
  perform pg_temp.como('anon', null);
  begin
    perform public.licenca_emitir_negocio('x@x.teste', 'depiled');
    raise exception 'T39 FALHOU: anon emitiu';
  exception when insufficient_privilege then null;
  end;
  perform pg_temp.como('authenticated', '00000000-0000-0000-0000-0000000000a1');
  begin
    perform public.licenca_emitir_negocio('x@x.teste', 'depiled');
    raise exception 'T39 FALHOU: dona de outro negócio emitiu';
  exception when insufficient_privilege then null;
  end;
  reset role;
  begin
    perform public.licenca_emitir_negocio('x@x.teste', 'nao-existe');
    raise exception 'T39 FALHOU: negócio inventado';
  exception when raise_exception then
    if sqlerrm not like 'Negócio nao-existe não existe%' then raise; end if;
  end;
  begin
    perform public.licenca_emitir_negocio('x@x.teste', 'ambar');
    raise exception 'T39 FALHOU: negócio suspenso';
  exception when raise_exception then
    if sqlerrm not like 'Negócio ambar%' then raise; end if;
  end;
  a := public.licenca_emitir_negocio(' Convidada@DepiLED.teste ', 'DepiLED', 'piloto', 0, 'cortesia', 'depiled-dono');
  b := public.licenca_emitir_negocio('convidada@depiled.teste', 'depiled', 'piloto', 0, 'cortesia', 'depiled-dono');
  if a ->> 'codigo' <> b ->> 'codigo' or a ->> 'negocio' <> 'depiled' or a ->> 'email' <> 'convidada@depiled.teste' then
    raise exception 'T39 FALHOU: % / %', a, b;
  end if;
  if (select count(*) from public.licencas where referencia = 'depiled-dono') <> 1 then raise exception 'T39 FALHOU: dobrou'; end if;
end $$;
\echo T39 ok · convite de negócio pronto só pela plataforma, só para negócio no ar, sem dobrar

-- T40 o convite diz qual negócio a pessoa vai assumir; o de negócio novo não diz
do $$ declare c text; c2 text; v jsonb; begin
  select codigo into c from public.licencas where referencia = 'depiled-dono';
  select codigo into c2 from public.licencas where referencia = 'pag-002';
  perform pg_temp.como('anon', null);
  v := public.convite_publico(c);
  if v #>> '{negocio,nome}' <> 'DepiLED' or v #>> '{negocio,slug}' <> 'depiled' or v ->> 'email' <> 'convidada@depiled.teste' then
    raise exception 'T40 FALHOU: %', v;
  end if;
  if public.convite_publico(c2) ? 'negocio' then raise exception 'T40 FALHOU: convite de negócio novo com negócio'; end if;
  reset role;
end $$;
\echo T40 ok · o convite mostra o negócio a assumir; o de negócio novo não

-- T41 convite de negócio pronto não cria negócio novo; a conta pode nascer
do $$ declare r jsonb; begin
  perform pg_temp.como('authenticated', '00000000-0000-0000-0000-0000000000e1');
  begin
    perform public.negocio_criar_meu('Convidada', '{"slug":"outra-depiled","nome":"Outra DepiLED","nicho":"outro",
      "pele":"generica","regras":{"fuso":"America/Fortaleza"},"tema":{},"horario":{}}');
    raise exception 'T41 FALHOU: gastou o convite de negócio pronto num negócio novo';
  exception when raise_exception then
    if sqlerrm not like 'Não encontramos uma compra%' then raise; end if;
  end;
  perform pg_temp.como('supabase_auth_admin', null);
  r := public.hook_antes_de_criar_conta('{"user":{"email":"convidada@depiled.teste"}}');
  if r <> '{}'::jsonb then raise exception 'T41 FALHOU: hook recusou o convite de negócio pronto %', r; end if;
  reset role;
end $$;
\echo T41 ok · convite de negócio pronto não vira negócio novo; a conta pode nascer

-- T42 assumir: sem login, sem e-mail confirmado ou sem convite, nada muda
do $$ begin
  perform pg_temp.como('authenticated', null);
  begin
    perform public.negocio_assumir();
    raise exception 'T42 FALHOU: sem login';
  exception when insufficient_privilege then null;
  end;
  perform pg_temp.como('authenticated', '00000000-0000-0000-0000-0000000000e2');
  begin
    perform public.negocio_assumir();
    raise exception 'T42 FALHOU: sem e-mail confirmado';
  exception when raise_exception then
    if sqlerrm not like 'Confirme seu e-mail%' then raise; end if;
  end;
  perform pg_temp.como('authenticated', '00000000-0000-0000-0000-0000000000c3');
  begin
    perform public.negocio_assumir();
    raise exception 'T42 FALHOU: sem convite';
  exception when raise_exception then
    if sqlerrm not like 'Não encontramos um convite%' then raise; end if;
  end;
  perform pg_temp.como('anon', null);
  begin
    perform public.negocio_assumir();
    raise exception 'T42 FALHOU: anon';
  exception when insufficient_privilege then null;
  end;
  reset role;
  if exists (select 1 from public.tenant_members m join public.tenants t on t.id = m.tenant_id where t.slug = 'depiled') then
    raise exception 'T42 FALHOU: DepiLED ganhou dono sem convite';
  end if;
end $$;
\echo T42 ok · sem login, sem e-mail confirmado ou sem convite, ninguém assume o negócio

-- T43 com o convite: vira dona da DepiLED, o painel abre e a compra é gasta
do $$ declare s text; d jsonb; c text; l public.licencas; begin
  select codigo into c from public.licencas where referencia = 'depiled-dono';
  perform pg_temp.como('authenticated', '00000000-0000-0000-0000-0000000000e1');
  s := public.negocio_assumir();
  if s <> 'depiled' then raise exception 'T43 FALHOU: devolveu %', s; end if;
  if (select count(*) from public.meus_negocios() m where m.slug = 'depiled' and m.papel = 'owner') <> 1 then
    raise exception 'T43 FALHOU: não virou dona';
  end if;
  d := public.painel_dados('depiled');
  if jsonb_array_length(d -> 'servicos') <> 34 or jsonb_array_length(d -> 'categorias') <> 3 then
    raise exception 'T43 FALHOU: painel sem o catálogo';
  end if;
  begin
    perform public.negocio_assumir();
    raise exception 'T43 FALHOU: assumiu duas vezes com um convite';
  exception when raise_exception then
    if sqlerrm not like 'Não encontramos um convite%' then raise; end if;
  end;
  perform pg_temp.como('anon', null);
  if public.convite_publico(c) <> '{"usado": true}'::jsonb then raise exception 'T43 FALHOU: convite gasto ainda livre'; end if;
  reset role;
  select * into l from public.licencas where referencia = 'depiled-dono';
  if l.situacao <> 'usada' or l.user_id <> '00000000-0000-0000-0000-0000000000e1' or l.usada_em is null then
    raise exception 'T43 FALHOU: licença %', row_to_json(l);
  end if;
  if (select plano from public.tenants where slug = 'depiled') <> 'piloto' then raise exception 'T43 FALHOU: plano'; end if;
  -- o catálogo continua o mesmo: assumir não mexe em nada do negócio
  if (select count(*) from public.servicos s join public.tenants t on t.id = s.tenant_id where t.slug = 'depiled') <> 34 then
    raise exception 'T43 FALHOU: catálogo mudou';
  end if;
end $$;
\echo T43 ok · com o convite, vira dona da DepiLED, o painel abre com o catálogo e a compra é gasta

-- T44 negócio suspenso depois do convite: não dá para assumir
do $$ begin
  perform public.licenca_emitir_negocio('dono2@b.teste', 'teste-b');
  insert into auth.users (id, email, email_confirmed_at) values ('00000000-0000-0000-0000-0000000000e3', 'dono2@b.teste', now());
  update public.tenants set status = 'suspended' where slug = 'teste-b';
  perform pg_temp.como('authenticated', '00000000-0000-0000-0000-0000000000e3');
  begin
    perform public.negocio_assumir();
    raise exception 'T44 FALHOU: assumiu negócio suspenso';
  exception when raise_exception then
    if sqlerrm not like 'Este negócio está suspenso%' then raise; end if;
  end;
  reset role;
  update public.tenants set status = 'active' where slug = 'teste-b';
  if (select situacao from public.licencas where email = 'dono2@b.teste') <> 'paga' then raise exception 'T44 FALHOU: gastou'; end if;
end $$;
\echo T44 ok · negócio suspenso não pode ser assumido, e a compra continua valendo

\echo == suíte do convite de negócio pronto (009): 6 testes, 0 falhas ==
