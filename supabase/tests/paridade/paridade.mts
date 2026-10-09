// =====================================================================
// Paridade do motor: navegador × banco.
//
// O painel calcula vagas no navegador (lib/disponibilidade.ts); o cliente
// recebe as vagas do banco (vagas_do_dia, migration 003). As duas contas
// precisam dar o MESMO resultado — senão o painel mostra um horário que o
// banco recusa, ou o contrário. Este teste sorteia agendas (expediente,
// dias avulsos, feriados, bloqueios, agendamentos, regras) e compara as
// duas respostas, pedido por pedido.
//
//   node --import ./registrar.mjs --experimental-strip-types paridade.mts [cenários] [semente]
//
// Precisa do Postgres de teste de pé (./supabase/tests/rodar.sh --manter).
// =====================================================================

import { execFileSync } from "node:child_process";
import type { Agendamento, Banco, Bloqueio, Intervalo, Profissional, Semana, Servico } from "../../../lib/tipos.ts";
import { horariosDisponiveis, type Pedido } from "../../../lib/disponibilidade.ts";
import { negocioNovo, REGRAS_PADRAO } from "../../../lib/padroes.ts";
import { horaDoMin, somarDias, juntar } from "../../../lib/datas.ts";

const CENARIOS = Number(process.argv[2] ?? 150);
let semente = Number(process.argv[3] ?? 20261009);
const TENANT = "cccccccc-0000-0000-0000-000000000099";
const PSQL = ["-h", "/tmp", "-p", process.env.PORTA ?? "55433", "-U", "postgres", "-d", "agenda_teste", "-v", "ON_ERROR_STOP=1", "-qAt"];

function aleatorio() {
  // mulberry32: sorteio repetível pela semente
  semente |= 0;
  semente = (semente + 0x6d2b79f5) | 0;
  let t = Math.imul(semente ^ (semente >>> 15), 1 | semente);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const entre = (a: number, b: number) => a + Math.floor(aleatorio() * (b - a + 1));
const um = <T,>(lista: T[]): T => lista[Math.floor(aleatorio() * lista.length)];
const sql = (v: string) => `'${v.replace(/'/g, "''")}'`;

const HOJE = "2026-10-12";
const DIAS = Array.from({ length: 6 }, (_, i) => somarDias(HOJE, i - 1));

function faixasAleatorias(): Intervalo[] {
  const n = um([0, 1, 1, 2]);
  const r: Intervalo[] = [];
  let t = entre(6, 10) * 60 + um([0, 15, 30]);
  for (let i = 0; i < n; i++) {
    const fim = Math.min(t + entre(2, 6) * 60 + um([0, 10, 25]), 23 * 60);
    if (fim <= t) break;
    r.push({ inicio: horaDoMin(t), fim: horaDoMin(fim) });
    t = fim + entre(0, 2) * 60;
  }
  return r;
}

function semanaAleatoria(): Semana {
  return Object.fromEntries(Array.from({ length: 7 }, (_, d) => [d, faixasAleatorias()])) as Semana;
}

function cenario(): Banco {
  const n = negocioNovo(TENANT, "paridade", "Paridade", "estetica");
  n.horario = semanaAleatoria();
  n.regras = {
    ...REGRAS_PADRAO,
    intervaloSlotsMin: um([5, 10, 15, 20, 30]),
    antecedenciaMinHoras: um([0, 0, 1, 2, 1.5]),
    janelaMaxDias: um([1, 3, 7, 30, 30]),
  };
  n.aberturas = DIAS.filter(() => aleatorio() < 0.25).flatMap((data) => faixasAleatorias().map((f) => ({ data, ...f })));
  n.datasEspeciais = DIAS.filter(() => aleatorio() < 0.12).map((data) => ({ data, rotulo: "Fechado" }));

  const servicos: Servico[] = Array.from({ length: entre(1, 4) }, (_, i) => ({
    id: `sv_${i}`, categoriaId: null, nome: `Serviço ${i}`, descricao: "", duracaoMin: um([5, 10, 15, 20, 30, 45, 60, 90]),
    intervaloMin: um([0, 0, 5, 10, 15]), preco: 10, modoPreco: "fixo", online: true, ativo: true, pausado: false,
    destaque: false, ordem: i, retornoDias: null, fichaId: null, fotoUrl: null,
  }));
  const profissionais: Profissional[] = Array.from({ length: entre(1, 3) }, (_, i) => ({
    id: `pr_${i}`, nome: `P${i}`, cargo: "", bio: "", cor: i, fotoUrl: null, comissaoPct: 0, ativo: aleatorio() > 0.1,
    ordem: i, servicosIds: servicos.filter(() => aleatorio() < 0.8).map((s) => s.id),
    horario: aleatorio() < 0.5 ? n.horario : semanaAleatoria(), acesso: null,
  }));

  // agendamentos que não se sobrepõem por profissional (a constraint do banco não deixaria), mais alguns cancelados
  const agendamentos: Agendamento[] = [];
  for (const p of profissionais) {
    for (const data of DIAS) {
      let t = entre(6, 11) * 60 + um([0, 5, 10, 15, 20, 30, 45]);
      for (let k = entre(0, 4); k > 0; k--) {
        const dur = um([5, 10, 15, 30, 45, 60]);
        const intervalo = um([0, 0, 5, 10]);
        const status = um(["confirmado", "confirmado", "pendente", "concluido", "cancelado", "faltou"] as const);
        agendamentos.push({
          id: `ag_${p.id}_${data}_${k}`, token: `tk${agendamentos.length}xxxxxxx`, clienteId: "cl_p", profissionalId: p.id,
          inicio: juntar(data, horaDoMin(t)), fim: juntar(data, horaDoMin(t + dur)), intervaloMin: intervalo, status, canal: "painel",
          itens: [], total: 0, desconto: 0, observacao: "", criadoEm: `${HOJE}T08:00`, confirmadoEm: null, lembreteEm: null,
          canceladoPor: null, motivoCancelamento: "", pagamento: null, sinal: null, pacoteClienteId: null, cupom: null,
        });
        t += dur + intervalo + um([0, 0, 5, 10, 20, 40]);
        if (t > 22 * 60) break;
      }
    }
  }
  const bloqueios: Bloqueio[] = Array.from({ length: entre(0, 3) }, (_, i) => {
    const data = um(DIAS);
    const ini = entre(7, 18) * 60 + um([0, 10, 30]);
    const longo = aleatorio() < 0.2;
    return {
      id: `bl_${i}`, profissionalId: aleatorio() < 0.4 ? null : um(profissionais).id,
      inicio: juntar(data, horaDoMin(ini)),
      fim: longo ? juntar(somarDias(data, 1), "10:00") : juntar(data, horaDoMin(Math.min(ini + entre(1, 6) * 30, 23 * 60 + 59))),
      motivo: "",
    };
  });

  return {
    versao: 0, negocio: n, categorias: [], servicos, profissionais, bloqueios, clientes: [], agendamentos,
    lancamentos: [], pacotes: [], pacotesClientes: [], modelosFicha: [], fichas: [], mensagens: [],
    registrosMensagem: [], depoimentos: [], cupons: [],
  };
}

function cargaSql(b: Banco): string {
  const t = sql(TENANT);
  const { id, slug, nome, nicho, pele, tagline, descricao, tema, ...cfg } = b.negocio;
  const linhas = [
    `delete from public.agendamentos where tenant_id = ${t};`,
    `delete from public.bloqueios where tenant_id = ${t};`,
    `delete from public.clientes where tenant_id = ${t};`,
    `delete from public.profissionais where tenant_id = ${t};`,
    `delete from public.servicos where tenant_id = ${t};`,
    `insert into public.store_settings (tenant_id, chave, valor) values (${t}, 'config', ${sql(JSON.stringify(cfg))}::jsonb)
       on conflict (tenant_id, chave) do update set valor = excluded.valor;`,
    `insert into public.clientes (tenant_id, id, nome) values (${t}, 'cl_p', 'Cliente Paridade');`,
  ];
  for (const s of b.servicos) {
    linhas.push(`insert into public.servicos (tenant_id, id, nome, duracao_min, intervalo_min) values (${t}, ${sql(s.id)}, ${sql(s.nome)}, ${s.duracaoMin}, ${s.intervaloMin});`);
  }
  for (const p of b.profissionais) {
    linhas.push(`insert into public.profissionais (tenant_id, id, nome, ativo, ordem, servicos_ids, horario) values (${t}, ${sql(p.id)}, ${sql(p.nome)}, ${p.ativo}, ${p.ordem}, array[${p.servicosIds.map(sql).join(",")}]::text[], ${sql(JSON.stringify(p.horario))}::jsonb);`);
  }
  const fuso = sql(b.negocio.regras.fuso);
  for (const a of b.agendamentos) {
    linhas.push(`insert into public.agendamentos (tenant_id, id, token, cliente_id, profissional_id, inicio, fim, intervalo_min, status) values (${t}, ${sql(a.id)}, ${sql(a.token)}, 'cl_p', ${sql(a.profissionalId)}, public.de_parede(${sql(a.inicio)}, ${fuso}), public.de_parede(${sql(a.fim)}, ${fuso}), ${a.intervaloMin}, ${sql(a.status)});`);
  }
  for (const bl of b.bloqueios) {
    linhas.push(`insert into public.bloqueios (tenant_id, id, profissional_id, inicio, fim) values (${t}, ${sql(bl.id)}, ${bl.profissionalId ? sql(bl.profissionalId) : "null"}, public.de_parede(${sql(bl.inicio)}, ${fuso}), public.de_parede(${sql(bl.fim)}, ${fuso}));`);
  }
  return linhas.join("\n");
}

function pedidosDo(b: Banco): Pedido[] {
  const pedidos: Pedido[] = [];
  const ids = b.servicos.map((s) => s.id);
  for (let i = 0; i < 8; i++) {
    const escolhidos = ids.filter(() => aleatorio() < 0.5);
    const servicosIds = escolhidos.length ? escolhidos : [um(ids)];
    const ativos = b.agendamentos.filter((a) => a.status !== "cancelado");
    pedidos.push({
      servicosIds,
      profissionalId: aleatorio() < 0.5 ? null : um(b.profissionais).id,
      data: um(DIAS),
      agora: `${HOJE}T${horaDoMin(entre(0, 14) * 60 + um([0, 7, 30, 59]))}`,
      ignorarAgendamentoId: aleatorio() < 0.3 && ativos.length ? um(ativos).id : undefined,
      ignorarRegras: aleatorio() < 0.2,
    });
  }
  return pedidos;
}

function consultaSql(pedidos: Pedido[]): string {
  const partes = pedidos.map(
    (p, i) => `select ${i} as n, coalesce((select jsonb_agg(jsonb_build_object('hora', v.hora, 'profissionalId', v.profissional_id) order by v.hora)
      from public.vagas_do_dia(${sql(TENANT)}, array[${p.servicosIds.map(sql).join(",")}]::text[], ${p.profissionalId ? sql(p.profissionalId) : "null"},
        ${sql(p.data)}::date, ${sql(p.agora)}::timestamp, ${p.ignorarAgendamentoId ? sql(p.ignorarAgendamentoId) : "null"}, ${!!p.ignorarRegras}) v), '[]'::jsonb) as r`,
  );
  return `select jsonb_agg(r order by n) from (${partes.join("\nunion all\n")}) x;`;
}

const psql = (texto: string) => execFileSync("psql", PSQL, { input: texto, encoding: "utf8" });

psql(`insert into public.tenants (id, slug, nome) values (${sql(TENANT)}, 'paridade', 'Paridade') on conflict (id) do nothing;`);

let pedidosTotal = 0;
let comVaga = 0;
const falhas: string[] = [];
for (let c = 0; c < CENARIOS; c++) {
  const b = cenario();
  const pedidos = pedidosDo(b);
  const saida = psql(`begin;\n${cargaSql(b)}\n${consultaSql(pedidos)}\ncommit;`).trim().split("\n").at(-1)!;
  const doBanco = JSON.parse(saida) as { hora: string; profissionalId: string }[][];
  pedidos.forEach((p, i) => {
    pedidosTotal++;
    const doNavegador = horariosDisponiveis(b, p);
    if (doNavegador.length) comVaga++;
    if (JSON.stringify(doNavegador) !== JSON.stringify(doBanco[i])) {
      falhas.push(`cenário ${c}, pedido ${i}: ${JSON.stringify(p)}\n  navegador ${JSON.stringify(doNavegador)}\n  banco     ${JSON.stringify(doBanco[i])}`);
    }
  });
}

psql(`delete from public.agendamentos where tenant_id = ${sql(TENANT)}; delete from public.bloqueios where tenant_id = ${sql(TENANT)};
  delete from public.clientes where tenant_id = ${sql(TENANT)}; delete from public.profissionais where tenant_id = ${sql(TENANT)};
  delete from public.servicos where tenant_id = ${sql(TENANT)}; delete from public.store_settings where tenant_id = ${sql(TENANT)};
  delete from public.tenants where id = ${sql(TENANT)};`);

if (falhas.length) {
  console.log(falhas.slice(0, 5).join("\n\n"));
  console.log(`\n== paridade: ${falhas.length} de ${pedidosTotal} pedidos DIFERENTES ==`);
  process.exit(1);
}
console.log(`== paridade: ${CENARIOS} agendas sorteadas, ${pedidosTotal} pedidos (${comVaga} com vaga), navegador e banco iguais ==`);
