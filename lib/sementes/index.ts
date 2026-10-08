// =====================================================================
// Negócios com ponto de partida no código.
//
// Enquanto serviços e equipe não moram no banco (próxima fase), a página
// do negócio nasce daqui. A existência do negócio continua sendo decidida
// pelo banco (`negocio_publico`); este registro só entra sozinho se o banco
// estiver fora do ar.
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
