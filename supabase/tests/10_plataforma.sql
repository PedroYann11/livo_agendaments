-- =====================================================================
-- Suíte 10 — plataforma (migration 001)
--
-- Cada teste diz o que espera e FALHA alto (raise exception) se não for
-- verdade. Papéis trocados com SET ROLE + GUC do "JWT", como o PostgREST.
-- =====================================================================

\set ON_ERROR_STOP on

-- pessoas: dona da Âmbar, profissional da Âmbar, dono da Navalha, admin Livo
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'dona@ambar.teste'),
  ('00000000-0000-0000-0000-00000000000b', 'pro@ambar.teste'),
  ('00000000-0000-0000-0000-00000000000c', 'dono@navalha.teste'),
  ('00000000-0000-0000-0000-0000000000ad', 'admin@livo.teste');
select public.vincular_membro('dona@ambar.teste', 'ambar', 'owner') \gset
select public.vincular_membro('pro@ambar.teste', 'ambar', 'professional') \gset
select public.vincular_membro('dono@navalha.teste', 'navalha', 'owner') \gset
insert into public.platform_admins (user_id) values ('00000000-0000-0000-0000-0000000000ad');

create or replace function pg_temp.como(papel text, usuario text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(usuario, ''), false);
  execute format('set role %I', papel);
end $$;

-- T01 anon não lê tabela de negócio
do $$ begin
  perform pg_temp.como('anon', null);
  begin
    perform 1 from public.tenants;
    raise exception 'T01 FALHOU: anon leu tenants';
  exception when insufficient_privilege then null;
  end;
  reset role;
end $$;
\echo T01 ok · anon sem SELECT em tenants

-- T02 anon resolve negócio ativo pela RPC, e só ele
do $$ declare n int; begin
  perform pg_temp.como('anon', null);
  select count(*) into n from public.negocio_publico('ambar');
  if n <> 1 then raise exception 'T02 FALHOU: ambar não resolveu (%)', n; end if;
  select count(*) into n from public.negocio_publico('nao-existe');
  if n <> 0 then raise exception 'T02 FALHOU: slug inexistente resolveu'; end if;
  select count(*) into n from public.negocio_publico('AMBAR');
  if n <> 1 then raise exception 'T02 FALHOU: slug em maiúscula não normalizou'; end if;
  reset role;
end $$;
\echo T02 ok · negocio_publico resolve só o slug pedido

-- T03 negócio suspenso deixa de resolver (falha fechado)
update public.tenants set status = 'suspended' where slug = 'jade';
do $$ declare n int; begin
  perform pg_temp.como('anon', null);
  select count(*) into n from public.negocio_publico('jade');
  if n <> 0 then raise exception 'T03 FALHOU: suspenso resolveu'; end if;
  reset role;
end $$;
update public.tenants set status = 'active' where slug = 'jade';
\echo T03 ok · suspenso não resolve

-- T04 a RPC pública devolve só colunas em whitelist
do $$ declare colunas text; begin
  select string_agg(a, ',' order by a) into colunas
  from unnest(array(select (pg_get_function_result('public.negocio_publico(text)'::regprocedure)))) a;
  if colunas !~ 'tema jsonb' or colunas ~ 'status|plano|custom_domain|demo' then
    raise exception 'T04 FALHOU: colunas inesperadas: %', colunas;
  end if;
end $$;
\echo T04 ok · whitelist de colunas

-- T05 membro vê só o próprio negócio
do $$ declare n int; s text; begin
  perform pg_temp.como('authenticated', '00000000-0000-0000-0000-00000000000a');
  select count(*), min(slug) into n, s from public.tenants;
  if n <> 1 or s <> 'ambar' then raise exception 'T05 FALHOU: viu % negócios (%)', n, s; end if;
  reset role;
end $$;
\echo T05 ok · cross-tenant SELECT = só o próprio

-- T06 meus_negocios devolve o vínculo certo, com papel
do $$ declare s text; p text; begin
  perform pg_temp.como('authenticated', '00000000-0000-0000-0000-00000000000b');
  select slug, papel into s, p from public.meus_negocios();
  if s <> 'ambar' or p <> 'professional' then raise exception 'T06 FALHOU: % %', s, p; end if;
  reset role;
end $$;
\echo T06 ok · meus_negocios

-- T07 dono de outro negócio não lê nem altera a config da Âmbar
do $$ declare n int; begin
  perform pg_temp.como('authenticated', '00000000-0000-0000-0000-00000000000c');
  select count(*) into n from public.store_settings where tenant_id = '4b1c2f7e-0a6d-4f51-9a3e-0c2f1d7e8a10';
  if n <> 0 then raise exception 'T07 FALHOU: leu config alheia'; end if;
  update public.store_settings set valor = '{}' where tenant_id = '4b1c2f7e-0a6d-4f51-9a3e-0c2f1d7e8a10';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'T07 FALHOU: alterou config alheia'; end if;
  reset role;
end $$;
\echo T07 ok · cross-tenant UPDATE sem efeito

-- T08 profissional lê a config, mas não altera; dona altera
do $$ declare n int; begin
  perform pg_temp.como('authenticated', '00000000-0000-0000-0000-00000000000b');
  select count(*) into n from public.store_settings where tenant_id = '4b1c2f7e-0a6d-4f51-9a3e-0c2f1d7e8a10';
  if n = 0 then raise exception 'T08 FALHOU: profissional não lê config'; end if;
  update public.store_settings set valor = valor where tenant_id = '4b1c2f7e-0a6d-4f51-9a3e-0c2f1d7e8a10';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'T08 FALHOU: profissional alterou config'; end if;
  reset role;
  perform pg_temp.como('authenticated', '00000000-0000-0000-0000-00000000000a');
  update public.store_settings set valor = valor where tenant_id = '4b1c2f7e-0a6d-4f51-9a3e-0c2f1d7e8a10' and chave = 'tema';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'T08 FALHOU: dona não alterou config'; end if;
  reset role;
end $$;
\echo T08 ok · papel decide escrita

-- T09 ninguém se promove: membro não insere em tenant_members
do $$ begin
  perform pg_temp.como('authenticated', '00000000-0000-0000-0000-00000000000b');
  begin
    insert into public.tenant_members (tenant_id, user_id, papel)
    values ('8e3d5a90-7b21-4c6e-b1f4-2a9c6d0e3b55', '00000000-0000-0000-0000-00000000000b', 'owner');
    raise exception 'T09 FALHOU: membro se vinculou a outro negócio';
  exception when insufficient_privilege then null;
  end;
  reset role;
end $$;
\echo T09 ok · escrita em tenant_members fechada

-- T10 portas administrativas fechadas para quem não deve
do $$ begin
  perform pg_temp.como('anon', null);
  begin perform public.meus_negocios(); raise exception 'T10 FALHOU: anon chamou meus_negocios';
  exception when insufficient_privilege then null; end;
  reset role;
  perform pg_temp.como('authenticated', '00000000-0000-0000-0000-00000000000a');
  begin perform public.vincular_membro('x@y.z', 'ambar', 'owner'); raise exception 'T10 FALHOU: logado chamou vincular_membro';
  exception when insufficient_privilege then null; end;
  begin perform public.criar_negocio('nova', 'Nova', 'outro', '00000000-0000-0000-0000-00000000000a'); raise exception 'T10 FALHOU: dona criou negócio';
  exception when insufficient_privilege then null; end;
  reset role;
end $$;
\echo T10 ok · funções administrativas fechadas

-- T11 a plataforma cria negócio com config neutra e dono vinculado
do $$ declare novo uuid; n int; begin
  perform pg_temp.como('authenticated', '00000000-0000-0000-0000-0000000000ad');
  novo := public.criar_negocio('clinica-teste', 'Clínica Teste', 'depilacao', '00000000-0000-0000-0000-00000000000c');
  reset role;
  select count(*) into n from public.store_settings where tenant_id = novo;
  if n <> 2 then raise exception 'T11 FALHOU: % chaves de config', n; end if;
  select count(*) into n from public.tenant_members where tenant_id = novo and papel = 'owner';
  if n <> 1 then raise exception 'T11 FALHOU: sem dono'; end if;
  select count(*) into n from public.tenants t where t.id = novo and t.pele = 'beleza';
  if n <> 1 then raise exception 'T11 FALHOU: pele do nicho não aplicada'; end if;
end $$;
\echo T11 ok · criar_negocio transacional e neutro

-- T12 slug fora do formato é recusado pelo banco
do $$ begin
  begin insert into public.tenants (slug, nome) values ('Com Espaço', 'X'); raise exception 'T12 FALHOU';
  exception when check_violation then null; end;
end $$;
\echo T12 ok · formato de slug

\echo
\echo == 12 testes, 0 falhas ==
