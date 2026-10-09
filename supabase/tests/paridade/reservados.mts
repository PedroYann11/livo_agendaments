// =====================================================================
// Endereços reservados: navegador × banco.
//
// O servidor recusa /painel, /admin… como negócio (lib/enderecos.ts) e o
// banco recusa criar negócio nesses endereços (slug_reservado, 008). Se as
// listas divergirem, alguém cria um negócio num endereço que o site nunca
// vai mostrar — ou o cadastro recusa um endereço que o site aceitaria.
// =====================================================================

import { execFileSync } from "node:child_process";
import { FORMATO_SLUG, RESERVADOS } from "../../../lib/enderecos.ts";

const PSQL = ["-h", "/tmp", "-p", process.env.PORTA ?? "55433", "-U", "postgres", "-d", "agenda_teste", "-v", "ON_ERROR_STOP=1", "-qAt"];

// os que nem passam no formato (_next, favicon.ico…) são barrados antes, nos dois lados
const doApp = [...RESERVADOS].filter((s) => FORMATO_SLUG.test(s)).sort();
const doBanco = execFileSync("psql", [...PSQL, "-c", "select string_agg(x, ',' order by x) from unnest(array[" +
  doApp.map((s) => `'${s}'`).join(",") + "]) x where public.slug_reservado(x)"]).toString().trim().split(",").filter(Boolean);
const lista = execFileSync("psql", [...PSQL, "-c",
  "select pg_get_functiondef('public.slug_reservado(text)'::regprocedure)"]).toString();
const noBanco = [...lista.matchAll(/'([a-z0-9-]+)'/g)].map((m) => m[1]).sort();

const faltaNoBanco = doApp.filter((s) => !doBanco.includes(s));
const faltaNoApp = noBanco.filter((s) => !doApp.includes(s));
if (faltaNoBanco.length || faltaNoApp.length) {
  console.error(`RESERVADOS FALHOU: só no app [${faltaNoBanco}] · só no banco [${faltaNoApp}]`);
  process.exit(1);
}
console.log(`== reservados: ${doApp.length} endereços, app e banco iguais ==`);
