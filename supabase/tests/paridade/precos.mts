// =====================================================================
// Preço: navegador × banco.
//
// O link mostra a conta com lib/precos.ts; quem grava é public.preco_calcular
// (010). Se divergirem, a cliente vê um total e paga outro. Sorteia
// promoções, serviços, primeira vez, aniversário e cupom e exige os dois
// iguais: subtotal, cada desconto (tipo, nome, %, valor) e total.
//
// Uso: node … precos.mts [quantidade]
// =====================================================================

import { execFileSync } from "node:child_process";
import { calcularPreco, type DadosPreco } from "../../../lib/precos.ts";

const PSQL = ["-h", "/tmp", "-p", process.env.PORTA ?? "55433", "-U", "postgres", "-d", "agenda_teste", "-v", "ON_ERROR_STOP=1", "-qAt"];
const N = Number(process.argv[2] ?? 400);

let semente = 20261010;
const sorte = () => ((semente = (semente * 1103515245 + 12345) % 2147483648) / 2147483648);
const entre = (a: number, b: number) => a + Math.floor(sorte() * (b - a + 1));
const um = <T,>(xs: readonly T[]) => xs[entre(0, xs.length - 1)];
const data = (a: number, b: number) => {
  const d = new Date(Date.UTC(entre(a, b), entre(0, 11), entre(1, 31)));
  return d.toISOString().slice(0, 10);
};

const casos: DadosPreco[] = [];
for (let i = 0; i < N; i++) {
  const dia = data(2026, 2029);
  const [, md, dd] = dia.split("-").map(Number);
  // aniversário perto do dia na metade das vezes (testa as janelas e a virada do ano)
  const nascimento = um([
    null,
    data(1950, 2010),
    `${entre(1950, 2010)}-${String(md).padStart(2, "0")}-${String(Math.min(dd + entre(-4, 4), 28) || 1).padStart(2, "0")}`,
    `${entre(1950, 2010)}-12-${entre(28, 31)}`,
    "2000-02-29",
  ]);
  casos.push({
    promocoes: um([
      null,
      {
        acumular: sorte() < 0.6,
        variosItens: { ativo: sorte() < 0.7, nome: um(["2 áreas ou mais", "Combo"]), minimo: entre(2, 4), percentual: entre(1, 90) },
        primeiraVez: { ativo: sorte() < 0.6, nome: "Primeira vez", percentual: entre(1, 90) },
        aniversario: { ativo: sorte() < 0.6, nome: "Aniversariante", percentual: entre(1, 90), janela: um(["dia", "semana", "mes"] as const) },
      },
    ]),
    precos: Array.from({ length: entre(1, 5) }, () => entre(0, 60000) / 100),
    novo: sorte() < 0.5,
    nascimento,
    dia,
    cupom: um([
      null,
      { codigo: "bemvinda", tipo: "percentual" as const, valor: entre(1, 50) },
      { codigo: "dez", tipo: "valor" as const, valor: entre(1, 30000) / 100 },
    ]),
  });
}

const lit = (x: unknown) => (x === null || x === undefined ? "null" : `'${JSON.stringify(x).replace(/'/g, "''")}'::jsonb`);
const linhas = casos.map(
  (c, i) =>
    `(${i}, ${lit(c.promocoes)}, array[${c.precos.join(",")}]::numeric[], ${c.novo}, ` +
    `${c.nascimento ? `'${c.nascimento}'::date` : "null::date"}, '${c.dia}'::date, ${lit(c.cupom)})`,
);
const sql =
  "select i || '|' || public.preco_calcular(p, pr, n, na, d, cu)::text from (values " +
  linhas.join(",") +
  ") v(i, p, pr, n, na, d, cu) order by i";
// pela entrada padrão: a consulta passa do limite de tamanho de um argumento
const saida = execFileSync("psql", PSQL, { input: sql + ";", maxBuffer: 64 * 1024 * 1024 }).toString().trim().split("\n");

type DoBanco = { subtotal: number; desconto: number; total: number; descontos: { tipo: string; nome: string; percentual: number | null; valor: number; codigo?: string }[] };
const normal = (r: DoBanco) =>
  JSON.stringify({
    subtotal: Number(r.subtotal),
    desconto: Number(r.desconto),
    total: Number(r.total),
    descontos: r.descontos.map((d) => ({ tipo: d.tipo, nome: d.nome, percentual: d.percentual === null ? null : Number(d.percentual), valor: Number(d.valor), codigo: d.codigo ?? null })),
  });

let falhas = 0;
let comDesconto = 0;
for (const l of saida) {
  const [i, json] = [Number(l.slice(0, l.indexOf("|"))), l.slice(l.indexOf("|") + 1)];
  const banco = normal(JSON.parse(json));
  const nav = calcularPreco(casos[i]);
  const app = normal(nav as unknown as DoBanco);
  if (nav.descontos.length) comDesconto++;
  if (banco !== app) {
    falhas++;
    if (falhas <= 5) console.error(`PREÇO DIVERGE no caso ${i}: ${JSON.stringify(casos[i])}\n  banco:     ${banco}\n  navegador: ${app}`);
  }
}
if (saida.length !== N) {
  console.error(`PREÇOS FALHOU: ${saida.length} respostas para ${N} casos`);
  process.exit(1);
}
if (falhas) {
  console.error(`PREÇOS FALHOU: ${falhas} de ${N} casos diferentes`);
  process.exit(1);
}
console.log(`== preços: ${N} casos sorteados (${comDesconto} com desconto), navegador e banco iguais ==`);
