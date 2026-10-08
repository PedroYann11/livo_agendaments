"use client";

// =====================================================================
// Sessão do painel.
//
// Só se entra com conta: e-mail e senha no Supabase Auth; o negócio vem de
// `meus_negocios()` (RLS: só os negócios de que a pessoa é membro).
//
// Nesta fase os DADOS do painel ainda vêm da loja local (lib/dados); o que
// o backend já resolve de verdade é quem é a pessoa e de qual negócio ela
// é. Ver docs/ESTADO.md.
// =====================================================================

import type { Papel } from "./tipos";
import { getSupabase, supabaseOn } from "./supabase";

export type Sessao = {
  slug: string;
  nome: string;
  email: string;
  papel: Papel;
  /** para trocar de negócio sem sair (dono de mais de uma unidade) */
  negocios: { slug: string; nome: string; papel: Papel }[];
};

const CHAVE = "livo-agenda:sessao";

export function lerSessao(): Sessao | null {
  try {
    const s = JSON.parse(localStorage.getItem(CHAVE) ?? "null");
    // sessões da antiga demonstração (sem conta) não valem mais
    return s && s.slug && s.tipo !== "demo" ? (s as Sessao) : null;
  } catch {
    return null;
  }
}

export function salvarSessao(s: Sessao) {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(s));
  } catch {}
  window.dispatchEvent(new Event("livo-sessao"));
}

export async function sair() {
  try {
    localStorage.removeItem(CHAVE);
  } catch {}
  if (supabaseOn) {
    try {
      await getSupabase().auth.signOut();
    } catch {}
  }
  window.dispatchEvent(new Event("livo-sessao"));
}

export type ResultadoLogin = { ok: true; sessao: Sessao } | { ok: false; motivo: string };

export async function entrarComSenha(email: string, senha: string): Promise<ResultadoLogin> {
  if (!supabaseOn) return { ok: false, motivo: "O login ainda não está configurado neste ambiente." };
  const sb = getSupabase();
  const { data, error } = await sb.auth.signInWithPassword({ email: email.trim(), password: senha });
  if (error || !data.user) {
    return { ok: false, motivo: error?.message === "Invalid login credentials" ? "E-mail ou senha incorretos." : "Não foi possível entrar agora." };
  }
  const { data: lista, error: e2 } = await sb.rpc("meus_negocios");
  if (e2 || !Array.isArray(lista) || !lista.length) {
    await sb.auth.signOut();
    return { ok: false, motivo: "Esta conta não está ligada a nenhum negócio. Fale com a Livo." };
  }
  const negocios = (lista as { slug: string; nome: string; papel: Papel }[]).map((n) => ({ slug: n.slug, nome: n.nome, papel: n.papel }));
  const sessao: Sessao = {
    slug: negocios[0].slug,
    nome: data.user.user_metadata?.nome ?? email.split("@")[0],
    email: data.user.email ?? email,
    papel: negocios[0].papel,
    negocios,
  };
  salvarSessao(sessao);
  return { ok: true, sessao };
}

export function trocarNegocio(s: Sessao, slug: string) {
  const n = s.negocios.find((x) => x.slug === slug);
  if (!n) return;
  salvarSessao({ ...s, slug, papel: n.papel });
}

/** O que cada papel enxerga no painel. A RLS do backend repete a regra. */
export const AREAS_DO_PAPEL: Record<Papel, string[]> = {
  owner: ["inicio", "agenda", "clientes", "servicos", "equipe", "financeiro", "relatorios", "mensagens", "anamnese", "configuracoes"],
  admin: ["inicio", "agenda", "clientes", "servicos", "equipe", "financeiro", "relatorios", "mensagens", "anamnese", "configuracoes"],
  reception: ["inicio", "agenda", "clientes", "mensagens", "anamnese"],
  professional: ["inicio", "agenda", "clientes", "anamnese"],
};

export const NOME_PAPEL: Record<Papel, string> = {
  owner: "Dono(a)",
  admin: "Administrador(a)",
  reception: "Recepção",
  professional: "Profissional",
};
