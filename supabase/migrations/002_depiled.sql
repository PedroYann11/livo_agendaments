-- =====================================================================
-- 002 — DepiLED, o primeiro negócio real; os exemplos saem do ar
--
-- O QUE FAZ
--   1. cria o negócio `depiled` (agenda.livo.tec.br/depiled), com o MESMO
--      id do código (lib/sementes/depiled.ts), a marca (frase e descrição)
--      e o tema tirado da logo (#62513f);
--   2. suspende os três negócios de exemplo da 001 (âmbar, navalha, jade):
--      status = 'suspended'. Somem da página pública e do login. Nada é
--      apagado — voltam com um UPDATE, se um dia fizer sentido.
--
-- O QUE NÃO FAZ
--   Nenhum dado pessoal: clientes e agendamentos da DepiLED entram pelas
--   próximas migrations (tabelas com RLS), nunca por arquivo versionado.
--   Serviços e equipe também ficam para a próxima fase (hoje vêm do código).
--
-- REVERTER
--   update public.tenants set status = 'active' where demo;
--   update public.tenants set status = 'suspended' where slug = 'depiled';
-- =====================================================================

insert into public.tenants (id, slug, nome, nicho, pele)
values ('ab00de9b-81fa-4a2e-a084-948f77eda90e', 'depiled', 'DepiLED', 'depilacao', 'beleza')
on conflict (id) do nothing;

insert into public.store_settings (tenant_id, chave, valor) values
  ('ab00de9b-81fa-4a2e-a084-948f77eda90e', 'marca', jsonb_build_object(
    'tagline', 'Remoção definitiva dos pelos, com suavidade e segurança.',
    'descricao', 'Depilação definitiva feminina e masculina, em sessões rápidas.')),
  ('ab00de9b-81fa-4a2e-a084-948f77eda90e', 'tema', jsonb_build_object(
    'marca', '#62513f', 'sobreMarca', '#ffffff', 'fundo', '#f8f5f0', 'superficie', '#ffffff',
    'texto', '#2b241d', 'textoSuave', '#76695b', 'acento', '#c8ae8f'))
on conflict (tenant_id, chave) do nothing;

update public.tenants
set status = 'suspended'
where demo and slug in ('ambar', 'navalha', 'jade');
