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
import type { Banco, Negocio, NegocioPublico, Tema } from "./tipos";
import { supabaseAnonimo, supabaseOn } from "./supabase";
import { bancoDaSemente } from "./sementes";
import { bancoSemAgenda, carregarPagina } from "./dados/remoto";
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

function publicoDe(n: Negocio): NegocioPublico {
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

export type Pagina = {
  publico: NegocioPublico;
  /** o que a página mostra (catálogo, equipe, regras) — null no modo local, sem banco */
  banco: Banco | null;
  /** o banco ainda não tem a agenda (migration 003): a página segue no modo local */
  local?: boolean;
};

/** Caminho de antes da agenda no banco: só a identidade e o tema (migration 001). */
async function identidadeDoBanco(slug: string): Promise<NegocioPublico | null> {
  const sb = supabaseAnonimo();
  if (!sb) return null;
  const { data, error } = await sb.rpc("negocio_publico", { p_slug: slug });
  if (error) throw error;
  const n = Array.isArray(data) ? data[0] : data;
  if (!n?.id) return null;
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

/**
 * A página do negócio, lida do banco UMA vez por requisição: metadados e
 * layout usam a mesma leitura (`pagina_publica`, só o que é público).
 */
export const resolverPagina = cache(async (slug: string): Promise<Pagina | null> => {
  if (!slugValido(slug)) return null;
  if (supabaseOn) {
    try {
      const banco = await carregarPagina(slug);
      if (!banco) return null; // respondeu e não existe: não encontrado
      const publico = publicoDe(banco.negocio);
      return { publico, banco: { ...banco, negocio: { ...banco.negocio, pele: publico.pele, tema: publico.tema } } };
    } catch (e) {
      if (bancoSemAgenda(e)) {
        try {
          const publico = await identidadeDoBanco(slug);
          return publico ? { publico, banco: null, local: true } : null;
        } catch {}
      }
      // banco fora: só os negócios com semente no código seguem no ar (e
      // agendar avisa que não deu, em vez de guardar só no celular)
    }
  }
  const semente = bancoDaSemente(slug, 0);
  if (!semente) return null;
  return { publico: publicoDe(semente.negocio), banco: supabaseOn ? semente : null };
});

export async function resolverNegocio(slug: string): Promise<NegocioPublico | null> {
  return (await resolverPagina(slug))?.publico ?? null;
}
