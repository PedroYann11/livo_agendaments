// =====================================================================
// Negócios com ponto de partida no código.
//
// Com as migrations 003–007, catálogo, equipe e regras moram no BANCO, e a
// página nasce de lá (`pagina_publica`). A semente fica para três casos:
// desenvolvimento sem Supabase (modo local), banco fora do ar (a página
// segue de pé; agendar avisa que não deu) e banco ainda sem elas.
// A existência do negócio continua sendo decidida pelo banco.
// =====================================================================

import type { Banco } from "../tipos";
import { depiled } from "./depiled";
import type { Semente } from "./tipos";

const SEMENTES: Record<string, Semente> = { depiled };

export function sementeDe(slug: string): Semente | null {
  return SEMENTES[slug] ?? null;
}

/** Banco inicial do negócio: a semente pública e nada de dado pessoal. */
export function bancoDaSemente(slug: string, versao: number): Banco | null {
  const s = sementeDe(slug);
  if (!s) return null;
  return {
    versao,
    ...structuredClone(s),
    bloqueios: [],
    clientes: [],
    agendamentos: [],
    lancamentos: [],
    pacotes: [],
    pacotesClientes: [],
    modelosFicha: [],
    fichas: [],
    registrosMensagem: [],
    depoimentos: [],
    cupons: [],
  };
}
