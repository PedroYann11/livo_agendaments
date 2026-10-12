-- =====================================================================
-- 011 — Fotos do negócio no Storage
-- Origem: livo@d74d591 · supabase/migrations/007_storage_por_tenant.sql
--         + 013_storage_limites_upload.sql (mesmo desenho, adaptado)
--
-- As fotos da página (a foto de quem atende, as fotos do espaço e as da
-- equipe) ficam no bucket "fotos", uma pasta por negócio:
--
--   fotos/<tenant_id>/retrato/<id>.jpg
--   fotos/<tenant_id>/galeria/<id>.jpg
--   fotos/<tenant_id>/equipe/<id>.jpg
--
-- A configuração do negócio guarda só o endereço da foto. Por isso as fotos
-- não pesam na página: o navegador baixa cada uma à parte, com cache.
--
-- Quem faz o quê:
--   ver a foto      qualquer pessoa, pelo endereço público (a página é pública)
--   listar a pasta  só a equipe do negócio (ninguém enumera fotos de outro)
--   enviar, apagar  só dono e administrador, e só na pasta do próprio negócio
-- O que entra: só JPEG, até 2 MB, com nome no formato acima. O painel já
-- reduz a foto e converte para JPEG no navegador antes de enviar, o que
-- também tira os dados de localização (GPS) que vêm nas fotos do celular.
--
-- Sem DROP: as policies só são criadas se ainda não existem.
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos', 'fotos', true, 2097152, array['image/jpeg'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

/**
 * O negócio dono do caminho: o tenant_id da primeira pasta, ou null se o
 * caminho não começa por um uuid. Sem cast que possa estourar dentro da policy.
 */
create or replace function public.pasta_do_negocio(p_nome text)
returns uuid language sql immutable set search_path = '' as $$
  select case
    when p_nome ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
    then left(p_nome, 36)::uuid
  end
$$;

/** Só nomes que o painel gera: <tenant_id>/<retrato|galeria|equipe>/<id>.jpg */
create or replace function public.caminho_de_foto_valido(p_nome text)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(p_nome ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(retrato|galeria|equipe)/[A-Za-z0-9_-]{1,80}\.jpg$', false)
$$;

revoke execute on function public.pasta_do_negocio(text), public.caminho_de_foto_valido(text) from public, anon;
grant execute on function public.pasta_do_negocio(text), public.caminho_de_foto_valido(text) to authenticated, service_role;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'fotos_listar_equipe') then
    create policy fotos_listar_equipe on storage.objects for select to authenticated
      using (bucket_id = 'fotos' and public.is_member(public.pasta_do_negocio(name)));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'fotos_enviar_dono') then
    create policy fotos_enviar_dono on storage.objects for insert to authenticated
      with check (bucket_id = 'fotos' and public.caminho_de_foto_valido(name)
                  and public.has_role(public.pasta_do_negocio(name), 'owner', 'admin'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'fotos_apagar_dono') then
    create policy fotos_apagar_dono on storage.objects for delete to authenticated
      using (bucket_id = 'fotos' and public.has_role(public.pasta_do_negocio(name), 'owner', 'admin'));
  end if;
end $$;
