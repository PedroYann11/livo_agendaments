-- =====================================================================
-- Suíte das fotos no Storage (migration 011)
--
-- Negócio A (dona + recepção) e negócio B (dono), da suíte da agenda. Cada
-- "envio" é o INSERT que a Storage API faz em storage.objects com o papel de
-- quem chamou — é ali que a RLS decide.
-- =====================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.como(papel text, usuario text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(usuario, ''), false);
  execute format('set role %I', papel);
end $$;

-- envia como (papel, usuário); devolve 'ok' ou o código do erro
create or replace function pg_temp.enviar(papel text, usuario text, caminho text) returns text language plpgsql as $$
begin
  perform pg_temp.como(papel, usuario);
  insert into storage.objects (bucket_id, name, owner) values ('fotos', caminho, nullif(usuario, '')::uuid);
  reset role;
  return 'ok';
exception when others then
  reset role;
  return sqlstate;
end $$;

-- T51 o bucket: público para ver, só JPEG, até 2 MB
do $$ declare b storage.buckets; begin
  select * into b from storage.buckets where id = 'fotos';
  if b.id is null or not b.public or b.file_size_limit <> 2097152 or b.allowed_mime_types <> array['image/jpeg'] then
    raise exception 'T51 FALHOU: bucket %', row_to_json(b);
  end if;
end $$;
\echo T51 ok · bucket fotos público, só JPEG, até 2 MB

-- T52 só dono e administrador enviam, e só na pasta do próprio negócio
do $$ declare
  a text := 'aaaaaaaa-0000-0000-0000-000000000001';
  b text := 'bbbbbbbb-0000-0000-0000-000000000001';
  dona_a text := '00000000-0000-0000-0000-0000000000a1';
  recepcao_a text := '00000000-0000-0000-0000-0000000000a2';
  dono_b text := '00000000-0000-0000-0000-0000000000b1';
  r text;
begin
  r := pg_temp.enviar('authenticated', dona_a, a || '/retrato/foto1.jpg');
  if r <> 'ok' then raise exception 'T52 FALHOU: dona de A não enviou na pasta de A (%)', r; end if;
  r := pg_temp.enviar('authenticated', dona_a, a || '/galeria/espaco-1.jpg');
  if r <> 'ok' then raise exception 'T52 FALHOU: dona de A não enviou na galeria (%)', r; end if;
  r := pg_temp.enviar('authenticated', dono_b, b || '/equipe/joao.jpg');
  if r <> 'ok' then raise exception 'T52 FALHOU: dono de B não enviou na pasta de B (%)', r; end if;
  -- na pasta de outro negócio, não
  r := pg_temp.enviar('authenticated', dona_a, b || '/retrato/intrusa.jpg');
  if r <> '42501' then raise exception 'T52 FALHOU: dona de A enviou na pasta de B (%)', r; end if;
  -- recepção é da equipe, mas não mexe na página
  r := pg_temp.enviar('authenticated', recepcao_a, a || '/retrato/recepcao.jpg');
  if r <> '42501' then raise exception 'T52 FALHOU: recepção enviou foto (%)', r; end if;
  -- sem login, não
  r := pg_temp.enviar('anon', null, a || '/retrato/anon.jpg');
  if r not in ('42501') then raise exception 'T52 FALHOU: anônimo enviou foto (%)', r; end if;
  -- só nomes que o painel gera: pasta conhecida, .jpg, sem "..", começando pelo uuid
  foreach r in array array[
    a || '/foto.jpg', a || '/outra/foto.jpg', a || '/retrato/foto.png', a || '/retrato/../foto.jpg',
    a || '/retrato/sub/foto.jpg', 'nao-e-uuid/retrato/foto.jpg', '/' || a || '/retrato/foto.jpg', a || '/retrato/.jpg'
  ] loop
    if pg_temp.enviar('authenticated', dona_a, r) <> '42501' then raise exception 'T52 FALHOU: aceitou o caminho %', r; end if;
  end loop;
end $$;
\echo T52 ok · envia só dono/admin, só na pasta do próprio negócio, só nomes do painel

-- T53 listar a pasta: só a equipe do próprio negócio
do $$ declare n int; begin
  perform pg_temp.como('authenticated', '00000000-0000-0000-0000-0000000000a2'); -- recepção de A
  select count(*) into n from storage.objects where bucket_id = 'fotos';
  reset role;
  if n <> 2 then raise exception 'T53 FALHOU: recepção de A vê % fotos (esperado 2, só as de A)', n; end if;
  perform pg_temp.como('authenticated', '00000000-0000-0000-0000-0000000000b1'); -- dono de B
  select count(*) into n from storage.objects where bucket_id = 'fotos';
  reset role;
  if n <> 1 then raise exception 'T53 FALHOU: dono de B vê % fotos (esperado 1)', n; end if;
  perform pg_temp.como('anon', null);
  select count(*) into n from storage.objects;
  reset role;
  if n <> 0 then raise exception 'T53 FALHOU: anônimo listou % fotos', n; end if;
end $$;
\echo T53 ok · cada negócio lista só a própria pasta; anônimo não lista

-- T54 apagar: só dono/admin, e só do próprio negócio
do $$ declare n int; begin
  perform pg_temp.como('authenticated', '00000000-0000-0000-0000-0000000000b1'); -- dono de B tenta apagar as de A
  delete from storage.objects where bucket_id = 'fotos' and name like 'aaaaaaaa-%';
  get diagnostics n = row_count;
  reset role;
  if n <> 0 then raise exception 'T54 FALHOU: dono de B apagou % fotos de A', n; end if;
  perform pg_temp.como('authenticated', '00000000-0000-0000-0000-0000000000a2'); -- recepção de A
  delete from storage.objects where bucket_id = 'fotos';
  get diagnostics n = row_count;
  reset role;
  if n <> 0 then raise exception 'T54 FALHOU: recepção apagou % fotos', n; end if;
  perform pg_temp.como('authenticated', '00000000-0000-0000-0000-0000000000a1'); -- dona de A apaga a da galeria
  delete from storage.objects where bucket_id = 'fotos' and name like '%/galeria/%';
  get diagnostics n = row_count;
  reset role;
  if n <> 1 then raise exception 'T54 FALHOU: dona de A apagou % fotos (esperado 1)', n; end if;
end $$;
\echo T54 ok · apaga só dono/admin do próprio negócio

-- T55 ninguém troca uma foto por outra no mesmo nome (sem policy de UPDATE)
do $$ declare n int; begin
  perform pg_temp.como('authenticated', '00000000-0000-0000-0000-0000000000a1');
  update storage.objects set name = 'bbbbbbbb-0000-0000-0000-000000000001/retrato/movida.jpg' where bucket_id = 'fotos';
  get diagnostics n = row_count;
  reset role;
  if n <> 0 then raise exception 'T55 FALHOU: % fotos trocadas por UPDATE', n; end if;
end $$;
\echo T55 ok · sem troca por UPDATE (a foto nova é sempre um arquivo novo)

delete from storage.objects where bucket_id = 'fotos';
\echo == suíte das fotos (011): 5 testes, 0 falhas ==
