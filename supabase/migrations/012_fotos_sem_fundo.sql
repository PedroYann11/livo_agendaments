-- =====================================================================
-- 012 — Foto sem fundo (recorte)
--
-- O painel tira o fundo da "Sua foto" no navegador e guarda o recorte com
-- transparência. JPEG não tem transparência; por isso o bucket "fotos"
-- passa a aceitar também PNG e WebP, e o nome do arquivo pode terminar em
-- .png ou .webp. O resto da 011 não muda: até 2 MB, só dono e
-- administrador enviam, só na pasta do próprio negócio.
-- =====================================================================

update storage.buckets
set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'fotos';

/** Só nomes que o painel gera: <tenant_id>/<retrato|galeria|equipe>/<id>.<jpg|png|webp> */
create or replace function public.caminho_de_foto_valido(p_nome text)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(p_nome ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(retrato|galeria|equipe)/[A-Za-z0-9_-]{1,80}\.(jpg|png|webp)$', false)
$$;
