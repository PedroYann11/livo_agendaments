// =====================================================================
// Resolução do negócio — NO SERVIDOR, por requisição.
//
// Adaptado de livo@d74d591 · lib/tenant-server.ts. Diferença: aqui o
// negócio vem do CAMINHO (agenda.livo.tec.br/<negocio>), não do subdomínio
// — é o formato de link que o dono cola na bio do Instagram, funciona em
// localhost e em preview sem DNS curinga. Domínio próprio entra depois,
// pelo Host, no mesmo ponto.
//
// O que NÃO muda: o servidor decide, falha fechado (slug desconhecido =
// "não encontrado", nunca um negócio qualquer) e a autorização de dados
// continua sendo a RLS, não este valor.
// =====================================================================

import { cache } from "react";
import type { NegocioPublico, Tema } from "./tipos";
import { supabaseAnonimo } from "./supabase";
import { demoDe } from "./demo/negocios";
import { hexValido } from "./cor";
import { TEMA_NEUTRO } from "./padroes";

/** Caminhos que nunca podem ser nome de negócio. */
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
  "_next",
  "favicon.ico",
  "robots.txt",
  "sitemap.xml",
  "manifest.webmanifest",
  "sw.js",
]);

export function slugValido(slug: string): boolean {
  return /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/.test(slug) && !RESERVADOS.has(slug);
}

function temaSeguro(t: unknown): Tema {
  const v = (t && typeof t === "object" ? t : {}) as Record<string, unknown>;
  const pega = (k: keyof Tema) => (hexValido(v[k]) ? (v[k] as string) : TEMA_NEUTRO[k]);
  return {
    marca: pega("marca"),
    sobreMarca: pega("sobreMarca"),
    fundo: pega("fundo"),
    superficie: pega("superficie"),
    texto: pega("texto"),
    textoSuave: pega("textoSuave"),
    acento: pega("acento"),
  };
}

const PELES = new Set(["beleza", "barbearia", "delicada", "generica"]);

export const resolverNegocio = cache(async (slug: string): Promise<NegocioPublico | null> => {
  if (!slugValido(slug)) return null;

  const sb = supabaseAnonimo();
  if (sb) {
    try {
      const { data, error } = await sb.rpc("negocio_publico", { p_slug: slug });
      const n = Array.isArray(data) ? data[0] : data;
      if (!error && n?.id) {
        return {
          id: n.id,
          slug: n.slug,
          nome: n.nome,
          nicho: n.nicho,
          pele: PELES.has(n.pele) ? n.pele : "generica",
          tagline: n.tagline ?? "",
          descricao: n.descricao ?? "",
          tema: temaSeguro(n.tema),
        };
      }
      if (!error) return null; // respondeu e não existe: não encontrado
    } catch {
      // banco fora: só os negócios de demonstração seguem no ar
    }
  }

  const demo = demoDe(slug);
  if (!demo) return null;
  const { id, nome, nicho, pele, tagline, descricao, tema } = demo.negocio;
  return { id, slug, nome, nicho, pele, tagline, descricao, tema };
});
