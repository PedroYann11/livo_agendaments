// =====================================================================
// A regra de preço, no navegador. ESPELHO de public.preco_calcular
// (supabase/migrations/010_promocoes.sql): o link mostra a conta com ela e
// o painel grava com ela; quem decide o preço do link é o banco. O teste
// supabase/tests/paridade/precos.mts sorteia casos e exige os dois iguais.
//
// Ordem: vários serviços → primeira vez → aniversário → cupom. Acumulando,
// cada desconto incide sobre o que sobrou do anterior; senão vale o maior.
// Contas em centavos inteiros (como o numeric do banco), sem erro de vírgula.
// =====================================================================

import type { Cupom, DescontoAplicado, Promocoes } from "./tipos";

export type Preco = { subtotal: number; descontos: DescontoAplicado[]; desconto: number; total: number };

export type DadosPreco = {
  promocoes: Promocoes | null | undefined;
  /** o preço de cada serviço escolhido (cada combo conta 1) */
  precos: number[];
  /** nunca foi atendido nem veio da lista antiga */
  novo: boolean;
  /** "aaaa-mm-dd" do cadastro */
  nascimento: string | null;
  /** o dia do horário, "aaaa-mm-dd" */
  dia: string;
  cupom: Pick<Cupom, "codigo" | "tipo" | "valor"> | null;
};

const centavos = (reais: number) => Math.round(reais * 100);

/** Data de "aaaa-mm-dd" em dias desde 1970 (UTC: sem fuso no meio). */
function diaAbsoluto(a: number, m: number, d: number): number {
  return Date.UTC(a, m - 1, d) / 86_400_000;
}

/** O aniversário cai na janela em volta do dia? 29/02 vira 28/02 em ano comum. */
export function aniversarioNaJanela(nascimento: string | null, dia: string, janela: "dia" | "semana" | "mes"): boolean {
  if (!nascimento || !/^\d{4}-\d{2}-\d{2}$/.test(nascimento) || !/^\d{4}-\d{2}-\d{2}$/.test(dia)) return false;
  const [, mn, dn] = nascimento.split("-").map(Number);
  const [ad, md, dd] = dia.split("-").map(Number);
  if (janela === "mes") return mn === md;
  const alvo = diaAbsoluto(ad, md, dd);
  const folga = janela === "semana" ? 3 : 0;
  for (const ano of [ad - 1, ad, ad + 1]) {
    const ultimo = new Date(Date.UTC(ano, mn, 0)).getUTCDate();
    if (Math.abs(diaAbsoluto(ano, mn, Math.min(dn, ultimo)) - alvo) <= folga) return true;
  }
  return false;
}

type Candidato = { tipo: DescontoAplicado["tipo"]; nome: string; percentual: number | null; fixo: number | null; codigo?: string };

const nomeOu = (nome: string | undefined) => (nome ?? "").trim() || "Desconto";

export function calcularPreco(d: DadosPreco): Preco {
  const pr = d.promocoes;
  const subtotal = d.precos.reduce((s, p) => s + centavos(p), 0);
  const cands: Candidato[] = [];
  if (pr?.variosItens?.ativo && d.precos.length >= (pr.variosItens.minimo ?? 2)) {
    cands.push({ tipo: "variosItens", nome: nomeOu(pr.variosItens.nome), percentual: pr.variosItens.percentual, fixo: null });
  }
  if (pr?.primeiraVez?.ativo && d.novo) {
    cands.push({ tipo: "primeiraVez", nome: nomeOu(pr.primeiraVez.nome), percentual: pr.primeiraVez.percentual, fixo: null });
  }
  if (pr?.aniversario?.ativo && aniversarioNaJanela(d.nascimento, d.dia, pr.aniversario.janela ?? "mes")) {
    cands.push({ tipo: "aniversario", nome: nomeOu(pr.aniversario.nome), percentual: pr.aniversario.percentual, fixo: null });
  }
  if (d.cupom) {
    const codigo = d.cupom.codigo.toUpperCase();
    const pct = d.cupom.tipo === "percentual";
    cands.push({ tipo: "cupom", nome: `Cupom ${codigo}`, codigo, percentual: pct ? d.cupom.valor : null, fixo: pct ? null : d.cupom.valor });
  }

  // centavos: round(base × %) / 100, igual ao round(numeric) do banco
  const valorSobre = (base: number, c: Candidato) =>
    c.percentual !== null ? Math.round((base * c.percentual) / 100) : Math.min(base, Math.max(centavos(c.fixo ?? 0), 0));

  const aplicados: { c: Candidato; v: number }[] = [];
  if (pr?.acumular ?? true) {
    let base = subtotal;
    for (const c of cands) {
      const v = valorSobre(base, c);
      if (v > 0) {
        base -= v;
        aplicados.push({ c, v });
      }
    }
  } else {
    let melhor: { c: Candidato; v: number } | null = null;
    for (const c of cands) {
      const v = valorSobre(subtotal, c);
      if (v > (melhor?.v ?? 0)) melhor = { c, v };
    }
    if (melhor) aplicados.push(melhor);
  }

  const descontos: DescontoAplicado[] = aplicados.map(({ c, v }) => ({
    tipo: c.tipo,
    nome: c.nome,
    percentual: c.percentual,
    valor: v / 100,
    ...(c.codigo ? { codigo: c.codigo } : {}),
  }));
  const soma = aplicados.reduce((s, a) => s + a.v, 0);
  return { subtotal: subtotal / 100, descontos, desconto: soma / 100, total: (subtotal - soma) / 100 };
}

/** O texto curto de uma promoção ligada, para a página e o resumo: "15% em 2 serviços ou mais". */
export function resumoPromocao(tipo: "variosItens" | "primeiraVez" | "aniversario", pr: Promocoes): string {
  if (tipo === "variosItens") return `${pr.variosItens.percentual}% · ${pr.variosItens.nome}`;
  if (tipo === "primeiraVez") return `${pr.primeiraVez.percentual}% · ${pr.primeiraVez.nome}`;
  return `${pr.aniversario.percentual}% · ${pr.aniversario.nome}`;
}
