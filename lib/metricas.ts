// =====================================================================
// Métricas do negócio — o que o dono precisa saber (PLANEJAMENTO, 1.4).
//
// Tudo calculado a partir do Banco, sem estado. No backend, as agregações
// pesadas viram views/RPCs; os nomes e o significado de cada número ficam.
// =====================================================================

import type { Agendamento, Banco, Cliente, Profissional, Servico } from "./tipos";
import { aniversarioEntre, diaDaSemana, difMin, minDoDia, ms, somarDias } from "./datas";
import { diaFechado } from "./disponibilidade";

export function realizado(a: Agendamento): number {
  return a.status === "concluido" ? a.pagamento?.valor ?? a.total : 0;
}

export function noPeriodo(a: Agendamento, de: string, ate: string): boolean {
  const d = a.inicio.slice(0, 10);
  return d >= de && d <= ate;
}

function dias(de: string, ate: string): string[] {
  const lista: string[] = [];
  for (let d = de; d <= ate; d = somarDias(d, 1)) lista.push(d);
  return lista;
}

/** Minutos de trabalho disponíveis de um profissional num intervalo de datas. */
export function minutosDisponiveis(b: Banco, p: Profissional, de: string, ate: string): number {
  let total = 0;
  for (const d of dias(de, ate)) {
    if (diaFechado(b, d)) continue;
    for (const f of p.horario[diaDaSemana(d)] ?? []) total += minDoDia(f.fim) - minDoDia(f.inicio);
  }
  for (const bl of b.bloqueios) {
    if (bl.profissionalId && bl.profissionalId !== p.id) continue;
    const d = bl.inicio.slice(0, 10);
    if (d >= de && d <= ate) total -= Math.max(0, difMin(bl.inicio, bl.fim));
  }
  return Math.max(0, total);
}

const OCUPAM_TEMPO: Agendamento["status"][] = ["pendente", "confirmado", "concluido", "faltou"];

export type Resumo = {
  faturamento: number;
  previsto: number;
  vendasAvulsas: number;
  despesas: number;
  lucro: number;
  atendimentos: number;
  agendados: number;
  faltas: number;
  cancelamentos: number;
  taxaFaltas: number;
  ticketMedio: number;
  ocupacao: number;
  clientesNovos: number;
  clientesRecorrentes: number;
  online: number;
  totalAgendamentos: number;
};

export function resumo(b: Banco, de: string, ate: string): Resumo {
  const ags = b.agendamentos.filter((a) => noPeriodo(a, de, ate));
  const concluidos = ags.filter((a) => a.status === "concluido");
  const faltas = ags.filter((a) => a.status === "faltou").length;
  const faturamentoServicos = concluidos.reduce((s, a) => s + realizado(a), 0);
  const lanc = b.lancamentos.filter((l) => l.data >= de && l.data <= ate);
  const vendasAvulsas = lanc.filter((l) => l.tipo === "receita").reduce((s, l) => s + l.valor, 0);
  const despesas = lanc.filter((l) => l.tipo === "despesa").reduce((s, l) => s + l.valor, 0);
  const previsto = ags
    .filter((a) => a.status === "confirmado" || a.status === "pendente")
    .reduce((s, a) => s + a.total, 0);

  let disponivel = 0;
  for (const p of b.profissionais.filter((x) => x.ativo)) disponivel += minutosDisponiveis(b, p, de, ate);
  const ocupado = ags
    .filter((a) => OCUPAM_TEMPO.includes(a.status))
    .reduce((s, a) => s + difMin(a.inicio, a.fim), 0);

  // novo = primeira visita do cliente cai no período
  const primeira = new Map<string, string>();
  for (const a of b.agendamentos) {
    if (a.status === "cancelado") continue;
    const atual = primeira.get(a.clienteId);
    if (!atual || a.inicio < atual) primeira.set(a.clienteId, a.inicio);
  }
  const atendidos = new Set(concluidos.map((a) => a.clienteId));
  let novos = 0;
  for (const id of atendidos) {
    const p = primeira.get(id)?.slice(0, 10);
    if (p && p >= de && p <= ate) novos++;
  }

  const faturamento = faturamentoServicos + vendasAvulsas;
  return {
    faturamento,
    previsto,
    vendasAvulsas,
    despesas,
    lucro: faturamento - despesas,
    atendimentos: concluidos.length,
    agendados: ags.filter((a) => a.status === "confirmado" || a.status === "pendente").length,
    faltas,
    cancelamentos: ags.filter((a) => a.status === "cancelado").length,
    taxaFaltas: faltas / Math.max(1, concluidos.length + faltas),
    ticketMedio: concluidos.length ? faturamentoServicos / concluidos.length : 0,
    ocupacao: disponivel ? Math.min(1, ocupado / disponivel) : 0,
    clientesNovos: novos,
    clientesRecorrentes: atendidos.size - novos,
    online: ags.filter((a) => a.canal === "online").length,
    totalAgendamentos: ags.length,
  };
}

export type PontoDia = { data: string; realizado: number; previsto: number; atendimentos: number };

export function serieDiaria(b: Banco, de: string, ate: string, hoje: string): PontoDia[] {
  const mapa = new Map<string, PontoDia>(dias(de, ate).map((d) => [d, { data: d, realizado: 0, previsto: 0, atendimentos: 0 }]));
  for (const a of b.agendamentos) {
    const p = mapa.get(a.inicio.slice(0, 10));
    if (!p) continue;
    if (a.status === "concluido") {
      p.realizado += realizado(a);
      p.atendimentos++;
    } else if ((a.status === "confirmado" || a.status === "pendente") && a.inicio.slice(0, 10) >= hoje) {
      p.previsto += a.total;
    }
  }
  return [...mapa.values()];
}

export type LinhaServico = {
  servico: Servico;
  quantidade: number;
  faturamento: number;
  minutos: number;
  porHora: number;
};

export function porServico(b: Banco, de: string, ate: string): LinhaServico[] {
  const mapa = new Map<string, LinhaServico>();
  for (const a of b.agendamentos) {
    if (a.status !== "concluido" || !noPeriodo(a, de, ate)) continue;
    const fat = realizado(a);
    const totalItens = a.itens.reduce((s, i) => s + i.preco, 0) || 1;
    for (const item of a.itens) {
      const s = b.servicos.find((x) => x.id === item.servicoId);
      if (!s) continue;
      const linha = mapa.get(s.id) ?? { servico: s, quantidade: 0, faturamento: 0, minutos: 0, porHora: 0 };
      linha.quantidade++;
      linha.faturamento += (fat * item.preco) / totalItens;
      linha.minutos += item.duracaoMin;
      mapa.set(s.id, linha);
    }
  }
  return [...mapa.values()]
    .map((l) => ({ ...l, porHora: l.minutos ? (l.faturamento / l.minutos) * 60 : 0 }))
    .sort((a, c) => c.faturamento - a.faturamento);
}

export type LinhaProfissional = {
  profissional: Profissional;
  atendimentos: number;
  faturamento: number;
  comissao: number;
  ocupacao: number;
  faltas: number;
};

/** Valor de uma sessão de pacote = preço do pacote ÷ sessões. */
function baseComissao(b: Banco, a: Agendamento): number {
  if (a.pagamento?.forma === "pacote" && a.pacoteClienteId) {
    const pc = b.pacotesClientes.find((x) => x.id === a.pacoteClienteId);
    const p = pc && b.pacotes.find((x) => x.id === pc.pacoteId);
    if (p) return p.preco / p.sessoes;
  }
  return realizado(a);
}

export function porProfissional(b: Banco, de: string, ate: string): LinhaProfissional[] {
  return b.profissionais
    .filter((p) => p.ativo)
    .map((p) => {
      const meus = b.agendamentos.filter((a) => a.profissionalId === p.id && noPeriodo(a, de, ate));
      const concl = meus.filter((a) => a.status === "concluido");
      const base = concl.reduce((s, a) => s + baseComissao(b, a), 0);
      const ocupado = meus.filter((a) => OCUPAM_TEMPO.includes(a.status)).reduce((s, a) => s + difMin(a.inicio, a.fim), 0);
      const disp = minutosDisponiveis(b, p, de, ate);
      return {
        profissional: p,
        atendimentos: concl.length,
        faturamento: base,
        comissao: (base * p.comissaoPct) / 100,
        ocupacao: disp ? Math.min(1, ocupado / disp) : 0,
        faltas: meus.filter((a) => a.status === "faltou").length,
      };
    });
}

/** Atendimentos por dia da semana × hora — onde estão os picos e os vazios. */
export function mapaCalor(b: Banco, de: string, ate: string): { dias: number[]; horas: number[]; valores: number[][] } {
  const horas: number[] = [];
  for (let h = 7; h <= 20; h++) horas.push(h);
  const diasSemana = [1, 2, 3, 4, 5, 6, 0];
  const valores = diasSemana.map(() => horas.map(() => 0));
  for (const a of b.agendamentos) {
    if (!noPeriodo(a, de, ate) || a.status === "cancelado") continue;
    const di = diasSemana.indexOf(diaDaSemana(a.inicio.slice(0, 10)));
    const hi = horas.indexOf(Number(a.inicio.slice(11, 13)));
    if (di >= 0 && hi >= 0) valores[di][hi]++;
  }
  return { dias: diasSemana, horas, valores };
}

export type EstatisticaCliente = {
  visitas: number;
  gasto: number;
  faltas: number;
  cancelamentos: number;
  ultima: Agendamento | null;
  proxima: Agendamento | null;
  favorito: string | null;
  ticket: number;
};

export function estatisticaCliente(b: Banco, clienteId: string, agora: string): EstatisticaCliente {
  const meus = b.agendamentos.filter((a) => a.clienteId === clienteId).sort((a, c) => (a.inicio < c.inicio ? -1 : 1));
  const concl = meus.filter((a) => a.status === "concluido");
  const gasto = concl.reduce((s, a) => s + realizado(a), 0);
  const contagem = new Map<string, number>();
  for (const a of concl) for (const i of a.itens) contagem.set(i.nome, (contagem.get(i.nome) ?? 0) + 1);
  const favorito = [...contagem.entries()].sort((a, c) => c[1] - a[1])[0]?.[0] ?? null;
  return {
    visitas: concl.length,
    gasto,
    faltas: meus.filter((a) => a.status === "faltou").length,
    cancelamentos: meus.filter((a) => a.status === "cancelado").length,
    ultima: concl.at(-1) ?? null,
    proxima: meus.find((a) => a.inicio >= agora && (a.status === "confirmado" || a.status === "pendente")) ?? null,
    favorito,
    ticket: concl.length ? gasto / concl.length : 0,
  };
}

export type ClienteEmRisco = { cliente: Cliente; ultima: Agendamento; servico: string; diasAtraso: number };

/** Passou do tempo de voltar e não tem nada marcado (módulo retorno). */
export function clientesParaRetorno(b: Banco, hoje: string): ClienteEmRisco[] {
  const ultimaPorCliente = new Map<string, Agendamento>();
  const temFuturo = new Set<string>();
  for (const a of b.agendamentos) {
    if (a.status === "concluido") {
      const atual = ultimaPorCliente.get(a.clienteId);
      if (!atual || a.inicio > atual.inicio) ultimaPorCliente.set(a.clienteId, a);
    }
    if ((a.status === "confirmado" || a.status === "pendente") && a.inicio.slice(0, 10) >= hoje) temFuturo.add(a.clienteId);
  }
  const lista: ClienteEmRisco[] = [];
  for (const [clienteId, ag] of ultimaPorCliente) {
    if (temFuturo.has(clienteId)) continue;
    const s = b.servicos.find((x) => x.id === ag.itens[0]?.servicoId);
    if (!s?.retornoDias) continue;
    const devido = somarDias(ag.inicio.slice(0, 10), s.retornoDias);
    if (devido > hoje) continue;
    const cliente = b.clientes.find((c) => c.id === clienteId);
    if (!cliente) continue;
    const atraso = Math.round((ms(hoje) - ms(devido)) / 86_400_000);
    if (atraso > 120) continue;
    lista.push({ cliente, ultima: ag, servico: s.nome, diasAtraso: atraso });
  }
  return lista.sort((a, c) => a.diasAtraso - c.diasAtraso);
}

export function aniversariantes(b: Banco, de: string, ate: string): Cliente[] {
  return b.clientes
    .filter((c) => c.nascimento && aniversarioEntre(c.nascimento, de, ate))
    .sort((a, c) => (a.nascimento!.slice(5) < c.nascimento!.slice(5) ? -1 : 1));
}

/** Formas de pagamento recebidas no período. */
export function porFormaPagamento(b: Banco, de: string, ate: string): Record<string, number> {
  const r: Record<string, number> = {};
  for (const a of b.agendamentos) {
    if (a.status !== "concluido" || !noPeriodo(a, de, ate) || !a.pagamento) continue;
    r[a.pagamento.forma] = (r[a.pagamento.forma] ?? 0) + a.pagamento.valor;
  }
  return r;
}
