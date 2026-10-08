"use client";

// =====================================================================
// A loja de dados da DEMONSTRAÇÃO.
//
// Guarda o Banco de cada negócio no localStorage do navegador e avisa as
// telas quando ele muda — inclusive entre abas: marcar um horário na
// página pública numa aba faz a agenda do painel, na outra, atualizar.
//
// Na fase de backend, esta é a peça trocada pelo Supabase. A interface
// (`useBanco`, `mudar`) continua a mesma.
// =====================================================================

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore, type ReactNode } from "react";
import type { Banco, NegocioPublico } from "../tipos";
import { gerarBancoDemo, VERSAO_BANCO } from "../demo/gerar";
import { negocioNovo, MENSAGENS_PADRAO } from "../padroes";
import { agoraNo } from "../datas";

const cache = new Map<string, Banco>();
const ouvintes = new Map<string, Set<() => void>>();

function chave(slug: string) {
  return `livo-agenda:${slug}:banco`;
}

function bancoVazio(publico: NegocioPublico): Banco {
  const n = negocioNovo(publico.id, publico.slug, publico.nome, publico.nicho);
  return {
    versao: VERSAO_BANCO,
    negocio: { ...n, pele: publico.pele, tagline: publico.tagline, descricao: publico.descricao, tema: publico.tema },
    categorias: [],
    servicos: [],
    profissionais: [],
    bloqueios: [],
    clientes: [],
    agendamentos: [],
    lancamentos: [],
    pacotes: [],
    pacotesClientes: [],
    modelosFicha: [],
    fichas: [],
    mensagens: structuredClone(MENSAGENS_PADRAO),
    registrosMensagem: [],
    depoimentos: [],
    cupons: [],
  };
}

function ler(slug: string): Banco | null {
  try {
    const bruto = localStorage.getItem(chave(slug));
    if (!bruto) return null;
    const b = JSON.parse(bruto) as Banco;
    return b.versao === VERSAO_BANCO ? b : null;
  } catch {
    return null;
  }
}

function gravar(slug: string, b: Banco) {
  try {
    localStorage.setItem(chave(slug), JSON.stringify(b));
  } catch {
    // cota cheia ou navegação privada: segue em memória nesta aba
  }
}

export function obterBanco(slug: string, publico?: NegocioPublico): Banco {
  const emCache = cache.get(slug);
  if (emCache) return emCache;
  const b = ler(slug) ?? gerarBancoDemo(slug) ?? (publico ? bancoVazio(publico) : null);
  if (!b) throw new Error(`negócio ${slug} sem dados`);
  cache.set(slug, b);
  return b;
}

function avisar(slug: string) {
  ouvintes.get(slug)?.forEach((f) => f());
}

export function definirBanco(slug: string, b: Banco) {
  cache.set(slug, b);
  gravar(slug, b);
  avisar(slug);
}

export function restaurarDemo(slug: string) {
  try {
    localStorage.removeItem(chave(slug));
  } catch {}
  cache.delete(slug);
  avisar(slug);
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (!e.key?.startsWith("livo-agenda:") || !e.key.endsWith(":banco")) return;
    const slug = e.key.split(":")[1];
    cache.delete(slug);
    avisar(slug);
  });
}

function assinar(slug: string, f: () => void) {
  if (!ouvintes.has(slug)) ouvintes.set(slug, new Set());
  ouvintes.get(slug)!.add(f);
  return () => {
    ouvintes.get(slug)?.delete(f);
  };
}

// ---------------------------------------------------------------------

type Ctx = {
  slug: string;
  banco: Banco | null;
  mudar: (fn: (b: Banco) => Banco) => void;
  /** "agora" no fuso do negócio */
  agora: () => string;
};

const BancoCtx = createContext<Ctx | null>(null);

export function BancoProvider({
  slug,
  publico,
  children,
}: {
  slug: string;
  publico?: NegocioPublico;
  children: ReactNode;
}) {
  const banco = useSyncExternalStore(
    useCallback((f: () => void) => assinar(slug, f), [slug]),
    () => obterBanco(slug, publico),
    () => null,
  );
  const mudar = useCallback(
    (fn: (b: Banco) => Banco) => definirBanco(slug, fn(obterBanco(slug, publico))),
    [slug, publico],
  );
  const fuso = banco?.negocio.regras.fuso ?? "America/Fortaleza";
  const agora = useCallback(() => agoraNo(fuso), [fuso]);
  const valor = useMemo(() => ({ slug, banco, mudar, agora }), [slug, banco, mudar, agora]);
  return <BancoCtx.Provider value={valor}>{children}</BancoCtx.Provider>;
}

export function useLoja(): Ctx {
  const c = useContext(BancoCtx);
  if (!c) throw new Error("useLoja fora do BancoProvider");
  return c;
}

/** Para telas que só renderizam com dados: o Banco, garantido. */
export function useBanco(): Banco {
  const { banco } = useLoja();
  if (!banco) throw new Error("useBanco antes de carregar");
  return banco;
}
