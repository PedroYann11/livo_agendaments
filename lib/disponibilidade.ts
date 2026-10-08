// =====================================================================
// Motor de disponibilidade.
//
// Esta é a versão do navegador do que, no backend, será a função
// `horarios_disponiveis` do Postgres (docs/PLANEJAMENTO.md, 5.1). A regra é
// a mesma e está escrita para ser portada linha a linha:
//
//   1. duração = soma dos serviços; a agenda ocupa duração + intervalo;
//   2. janela de trabalho do profissional no dia da semana;
//   3. menos feriados/datas especiais, bloqueios e agendamentos ativos;
//   4. fatia em passos de `intervaloSlotsMin` onde o atendimento cabe;
//   5. corta antecedência mínima e janela máxima;
//   6. "qualquer profissional" = união, atribuída a quem tem menos agenda.
//
// No backend, a MESMA função valida a gravação e uma constraint EXCLUDE
// impede dois agendamentos sobrepostos. Aqui, `validarHorario` faz o papel.
// =====================================================================

import type { Agendamento, Banco, Profissional, Servico } from "./tipos";
import {
  diaDaSemana,
  difMin,
  horaDoMin,
  juntar,
  minDoDia,
  ms,
  somarDias,
  somarMin,
} from "./datas";

export const STATUS_OCUPAM: Agendamento["status"][] = ["pendente", "confirmado", "concluido"];

export type Vaga = { hora: string; profissionalId: string };

export type Pedido = {
  servicosIds: string[];
  /** null = qualquer profissional */
  profissionalId: string | null;
  data: string;
  agora: string;
  /** ao remarcar, o próprio agendamento não conta como ocupado */
  ignorarAgendamentoId?: string;
  /** o painel pode encaixar fora das regras de antecedência */
  ignorarRegras?: boolean;
};

export function servicosDoPedido(b: Banco, ids: string[]): Servico[] {
  return ids.map((id) => b.servicos.find((s) => s.id === id)).filter((s): s is Servico => !!s);
}

export function duracaoTotal(servicos: Servico[]): { atendimento: number; intervalo: number } {
  const atendimento = servicos.reduce((s, x) => s + x.duracaoMin, 0);
  const intervalo = servicos.reduce((m, x) => Math.max(m, x.intervaloMin), 0);
  return { atendimento, intervalo };
}

/** Profissionais ativos que fazem TODOS os serviços pedidos. */
export function profissionaisAptos(b: Banco, servicosIds: string[]): Profissional[] {
  return b.profissionais
    .filter((p) => p.ativo && servicosIds.every((id) => p.servicosIds.includes(id)))
    .sort((a, c) => a.ordem - c.ordem);
}

export function diaFechado(b: Banco, data: string): string | null {
  const especial = b.negocio.datasEspeciais.find((d) => d.data === data);
  return especial ? especial.rotulo || "Fechado" : null;
}

type Faixa = [number, number];

/** Minutos do dia ocupados por agendamentos e bloqueios do profissional. */
function ocupacao(b: Banco, profissionalId: string, data: string, ignorar?: string): Faixa[] {
  const inicioDia = ms(data);
  const fimDia = inicioDia + 86_400_000;
  const faixas: Faixa[] = [];
  for (const a of b.agendamentos) {
    if (a.profissionalId !== profissionalId || a.id === ignorar) continue;
    if (!STATUS_OCUPAM.includes(a.status)) continue;
    if (a.inicio.slice(0, 10) !== data) continue;
    faixas.push([minDoDia(a.inicio.slice(11)), minDoDia(a.inicio.slice(11)) + difMin(a.inicio, a.fim) + a.intervaloMin]);
  }
  for (const bl of b.bloqueios) {
    if (bl.profissionalId && bl.profissionalId !== profissionalId) continue;
    const i = Math.max(ms(bl.inicio), inicioDia);
    const f = Math.min(ms(bl.fim), fimDia);
    if (i >= f) continue;
    faixas.push([Math.round((i - inicioDia) / 60_000), Math.round((f - inicioDia) / 60_000)]);
  }
  return faixas;
}

function minutosOcupados(b: Banco, profissionalId: string, data: string): number {
  return ocupacao(b, profissionalId, data).reduce((s, [i, f]) => s + (f - i), 0);
}

export function horariosDisponiveis(b: Banco, pedido: Pedido): Vaga[] {
  const servicos = servicosDoPedido(b, pedido.servicosIds);
  if (!servicos.length) return [];
  if (diaFechado(b, pedido.data)) return [];
  const { atendimento, intervalo } = duracaoTotal(servicos);
  const regras = b.negocio.regras;

  const hoje = pedido.agora.slice(0, 10);
  if (!pedido.ignorarRegras) {
    if (pedido.data < hoje) return [];
    if (pedido.data > somarDias(hoje, regras.janelaMaxDias)) return [];
  }
  const limite = pedido.ignorarRegras
    ? pedido.agora
    : somarMin(pedido.agora, regras.antecedenciaMinHoras * 60);

  const candidatos = pedido.profissionalId
    ? profissionaisAptos(b, pedido.servicosIds).filter((p) => p.id === pedido.profissionalId)
    : profissionaisAptos(b, pedido.servicosIds);

  const semana = diaDaSemana(pedido.data);
  const passo = regras.intervaloSlotsMin;
  const porHora = new Map<string, { profissionalId: string; carga: number }>();

  for (const pro of candidatos) {
    const faixas = pro.horario[semana] ?? [];
    if (!faixas.length) continue;
    const ocupado = ocupacao(b, pro.id, pedido.data, pedido.ignorarAgendamentoId);
    const carga = minutosOcupados(b, pro.id, pedido.data);
    for (const f of faixas) {
      const ini = minDoDia(f.inicio);
      const fim = minDoDia(f.fim);
      for (let t = Math.ceil(ini / passo) * passo; t + atendimento <= fim; t += passo) {
        const ocupa: Faixa = [t, t + atendimento + intervalo];
        // o intervalo de limpeza pode passar do fim do expediente
        if (ocupado.some(([oi, of]) => ocupa[0] < of && oi < ocupa[1])) continue;
        const hora = horaDoMin(t);
        if (juntar(pedido.data, hora) < limite) continue;
        const atual = porHora.get(hora);
        if (!atual || carga < atual.carga) porHora.set(hora, { profissionalId: pro.id, carga });
      }
    }
  }

  return [...porHora.entries()]
    .sort((a, c) => (a[0] < c[0] ? -1 : 1))
    .map(([hora, v]) => ({ hora, profissionalId: v.profissionalId }));
}

/** Quantas vagas cada dia tem — para pintar a faixa de dias. */
export function vagasPorDia(b: Banco, base: Omit<Pedido, "data">, dias: string[]): Record<string, number> {
  const r: Record<string, number> = {};
  for (const d of dias) r[d] = horariosDisponiveis(b, { ...base, data: d }).length;
  return r;
}

/** A última palavra antes de gravar. Devolve o motivo da recusa, ou null. */
export function validarHorario(
  b: Banco,
  pedido: Pedido & { hora: string },
): { ok: true; profissionalId: string } | { ok: false; motivo: string } {
  const vagas = horariosDisponiveis(b, pedido);
  const vaga = vagas.find((v) => v.hora === pedido.hora);
  if (!vaga) {
    return {
      ok: false,
      motivo: "Esse horário acabou de ser ocupado. Escolha outro, por favor.",
    };
  }
  return { ok: true, profissionalId: vaga.profissionalId };
}

/** Faixas de trabalho do dia (para desenhar a agenda do painel). */
export function expedienteDoDia(b: Banco, data: string): { inicio: number; fim: number } {
  const semana = diaDaSemana(data);
  let inicio = 24 * 60;
  let fim = 0;
  for (const p of b.profissionais.filter((x) => x.ativo)) {
    for (const f of p.horario[semana] ?? []) {
      inicio = Math.min(inicio, minDoDia(f.inicio));
      fim = Math.max(fim, minDoDia(f.fim));
    }
  }
  for (const f of b.negocio.horario[semana] ?? []) {
    inicio = Math.min(inicio, minDoDia(f.inicio));
    fim = Math.max(fim, minDoDia(f.fim));
  }
  if (inicio >= fim) return { inicio: 8 * 60, fim: 18 * 60 };
  return { inicio: Math.floor(inicio / 60) * 60, fim: Math.ceil(fim / 60) * 60 };
}

/** Situação "aberto agora" da vitrine. Origem: livo@d74d591 · situacaoDaLoja. */
export function situacaoAgora(b: Banco, agora: string): { aberto: boolean; texto: string } {
  const data = agora.slice(0, 10);
  const fechado = diaFechado(b, data);
  const min = minDoDia(agora.slice(11));
  const faixas = fechado ? [] : b.negocio.horario[diaDaSemana(data)] ?? [];
  const atual = faixas.find((f) => minDoDia(f.inicio) <= min && min < minDoDia(f.fim));
  if (atual) return { aberto: true, texto: `Aberto agora · até ${atual.fim}` };
  const proxHoje = faixas.find((f) => minDoDia(f.inicio) > min);
  if (proxHoje) return { aberto: false, texto: `Fechado · abre hoje às ${proxHoje.inicio}` };
  for (let i = 1; i <= 7; i++) {
    const d = somarDias(data, i);
    if (diaFechado(b, d)) continue;
    const f = b.negocio.horario[diaDaSemana(d)] ?? [];
    if (f.length) {
      const quando = i === 1 ? "amanhã" : ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"][diaDaSemana(d)];
      return { aberto: false, texto: `Fechado · abre ${quando} às ${f[0].inicio}` };
    }
  }
  return { aberto: false, texto: "Fechado" };
}
