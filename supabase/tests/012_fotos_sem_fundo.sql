-- =====================================================================
-- Suíte da foto sem fundo (migration 012)
-- =====================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.enviar(papel text, usuario text, caminho text) returns text language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(usuario, ''), false);
  execute format('set role %I', papel);
  insert into storage.objects (bucket_id, name, owner) values ('fotos', caminho, nullif(usuario, '')::uuid);
  reset role;
  return 'ok';
exception when others then
  reset role;
  return sqlstate;
end $$;

-- T56 PNG e WebP entram (o recorte tem transparência); o resto continua igual
do $$ declare
  a text := 'aaaaaaaa-0000-0000-0000-000000000001';
  dona_a text := '00000000-0000-0000-0000-0000000000a1';
  r text;
begin
  if (select allowed_mime_types from storage.buckets where id = 'fotos') <> array['image/jpeg', 'image/png', 'image/webp'] then
    raise exception 'T56 FALHOU: tipos do bucket';
  end if;
  foreach r in array array[a || '/retrato/sem-fundo.png', a || '/retrato/sem-fundo.webp', a || '/retrato/foto.jpg'] loop
    if pg_temp.enviar('authenticated', dona_a, r) <> 'ok' then raise exception 'T56 FALHOU: recusou %', r; end if;
  end loop;
  foreach r in array array[a || '/retrato/x.gif', a || '/retrato/x.svg', a || '/retrato/x.png.exe', a || '/retrato/x.PNG'] loop
    if pg_temp.enviar('authenticated', dona_a, r) <> '42501' then raise exception 'T56 FALHOU: aceitou %', r; end if;
  end loop;
  -- e continua só na pasta do próprio negócio
  if pg_temp.enviar('authenticated', dona_a, 'bbbbbbbb-0000-0000-0000-000000000001/retrato/x.png') <> '42501' then
    raise exception 'T56 FALHOU: PNG na pasta de outro negócio';
  end if;
  delete from storage.objects where bucket_id = 'fotos';
end $$;
\echo T56 ok · recorte em PNG/WebP aceito; GIF, SVG e nomes estranhos não; só na pasta do negócio
\echo == suíte da foto sem fundo (012): 1 teste, 0 falhas ==
