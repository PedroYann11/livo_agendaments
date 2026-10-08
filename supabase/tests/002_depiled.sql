-- =====================================================================
-- Suíte 002 — DepiLED no ar, exemplos fora (migration 002)
--
-- Roda logo depois da 002, sobre o banco que a suíte 001 deixou.
-- =====================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.como(papel text, usuario text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(usuario, ''), false);
  execute format('set role %I', papel);
end $$;

-- T13 anon resolve a DepiLED com a marca e o tema da logo
do $$ declare r record; begin
  perform pg_temp.como('anon', null);
  select * into r from public.negocio_publico('depiled');
  if r.id is distinct from 'ab00de9b-81fa-4a2e-a084-948f77eda90e'::uuid then raise exception 'T13 FALHOU: depiled não resolveu'; end if;
  if r.nome <> 'DepiLED' or r.pele <> 'beleza' then raise exception 'T13 FALHOU: identidade errada (% / %)', r.nome, r.pele; end if;
  if r.tema ->> 'marca' <> '#62513f' then raise exception 'T13 FALHOU: tema %', r.tema; end if;
  if r.tagline = '' then raise exception 'T13 FALHOU: sem frase'; end if;
  reset role;
end $$;
\echo T13 ok · depiled resolve com marca e tema

-- T14 os exemplos não resolvem mais (página pública falha fechado)
do $$ declare n int; begin
  perform pg_temp.como('anon', null);
  select count(*) into n from public.negocio_publico('ambar');
  n := n + (select count(*) from public.negocio_publico('navalha'));
  n := n + (select count(*) from public.negocio_publico('jade'));
  if n <> 0 then raise exception 'T14 FALHOU: % exemplo(s) ainda no ar', n; end if;
  reset role;
end $$;
\echo T14 ok · âmbar, navalha e jade fora do ar

-- T15 quem era membro de um exemplo não entra mais nele
do $$ declare n int; begin
  perform pg_temp.como('authenticated', '00000000-0000-0000-0000-00000000000a');
  select count(*) into n from public.meus_negocios();
  if n <> 0 then raise exception 'T15 FALHOU: dona da âmbar ainda vê % negócio(s)', n; end if;
  reset role;
end $$;
\echo T15 ok · login de negócio suspenso não lista o negócio

-- T16 nada foi apagado: exemplos e a configuração deles continuam no banco
do $$ declare n int; begin
  select count(*) into n from public.tenants where demo and status = 'suspended';
  if n <> 3 then raise exception 'T16 FALHOU: % exemplos suspensos', n; end if;
  select count(*) into n from public.store_settings s join public.tenants t on t.id = s.tenant_id where t.demo;
  if n <> 6 then raise exception 'T16 FALHOU: % chaves de config dos exemplos', n; end if;
end $$;
\echo T16 ok · suspensão é suave, nada apagado

-- T17 a DepiLED nasce sem membros e só com marca e tema
do $$ declare n int; begin
  select count(*) into n from public.tenant_members where tenant_id = 'ab00de9b-81fa-4a2e-a084-948f77eda90e';
  if n <> 0 then raise exception 'T17 FALHOU: % membro(s)', n; end if;
  select count(*) into n from public.store_settings where tenant_id = 'ab00de9b-81fa-4a2e-a084-948f77eda90e';
  if n <> 2 then raise exception 'T17 FALHOU: % chaves de config', n; end if;
end $$;
\echo T17 ok · depiled sem membros, config mínima

\echo
\echo == suíte 002: 5 testes, 0 falhas ==
