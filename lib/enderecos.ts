// =====================================================================
// O endereço do negócio: agenda.livo.tec.br/<slug>.
//
// Sem dependências: usado no servidor (resolverNegocio), no cadastro (para
// conferir enquanto a pessoa digita) e no teste que compara esta lista com
// a do banco (slug_reservado, migration 008). Quem decide de verdade se um
// endereço está livre é o banco.
// =====================================================================

/** Caminhos que nunca podem ser endereço de negócio — espelho de slug_reservado (008). */
export const RESERVADOS = new Set([
  "painel",
  "api",
  "entrar",
  "sair",
  "admin",
  "app",
  "agenda",
  "livo",
  "www",
  "demo",
  "ajuda",
  "precos",
  "termos",
  "privacidade",
  "cadastro",
  "criar",
  "conta",
  "login",
  "suporte",
  "blog",
  "contato",
  "sobre",
  "planos",
  "status",
  "static",
  "assets",
  "_next",
  "favicon.ico",
  "robots.txt",
  "sitemap.xml",
  "manifest.webmanifest",
  "sw.js",
]);

export const FORMATO_SLUG = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;

export function slugValido(slug: string): boolean {
  return FORMATO_SLUG.test(slug) && !RESERVADOS.has(slug);
}

/** "Studio da Lú & Cia" → "studio-da-lu-cia" */
export function sugerirSlug(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
}

/** O que a pessoa digita no campo do endereço, já no formato aceito. */
export function limparSlug(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+/g, "")
    .slice(0, 40);
}
