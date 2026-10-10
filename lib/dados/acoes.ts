// =====================================================================
// Ações: funções PURAS Banco → Banco.
//
// Cada uma corresponde a uma RPC do backend (docs/PLANEJAMENTO.md, 5).
// Pura de propósito: a tela chama `mudar(b => acao(b, …))`, e na fase de
// backend a mesma assinatura vira uma chamada ao Supabase sem a tela saber.
// =====================================================================

import type {
  Agendamento,
  Banco,
  Bloqueio,
  Canal,
  Categoria,
  Cliente,
  Cupom,
  Depoimento,
  Ficha,
  FormaPagamento,
  Lancamento,
  ModeloFicha,
  ModeloMensagem,
  Negocio,
  Pacote,
  PacoteCliente,
  Profissional,
  Servico,
  StatusAgendamento,
  TipoMensagem,
} from "../tipos";
import { juntar, somarDias, somarMin } from "../datas";
import { duracaoTotal, servicosDoPedido, validarHorario } from "../disponibilidade";
import { novoId, novoToken } from "../id";
import { apenasDigitos, capitalizarNome } from "../masks";
import { calcularPreco } from "../precos";
import type { LinhaImportada } from "../importar";

export type Resultado<T> = { ok: true; banco: Banco; valor: T } | { ok: false; motivo: string };

function upsert<T extends { id: string }>(lista: T[], item: T): T[] {
  const i = lista.findIndex((x) => x.id === item.id);
  if (i < 0) return [...lista, item];
  const nova = lista.slice();
  nova[i] = item;
  return nova;
}

function trocar<T extends { id: string }>(lista: T[], id: string, fn: (x: T) => T): T[] {
  return lista.map((x) => (x.id === id ? fn(x) : x));
}

// ---------------------------------------------------------------------
// Clientes
// ---------------------------------------------------------------------

export function acharClientePorTelefone(b: Banco, telefone: string): Cliente | undefined {
  const t = apenasDigitos(telefone);
  return b.clientes.find((c) => apenasDigitos(c.telefone) === t);
}

/**
 * Primeira vez (espelho de public.cliente_e_novo): nenhum cadastro com este
 * telefone foi atendido — horário cancelado não conta — nem veio da lista antiga.
 * Sem telefone, vale o próprio cadastro.
 */
export function clienteENovo(b: Banco, telefone: string, clienteId?: string): boolean {
  const t = apenasDigitos(telefone);
  const mesmos = b.clientes.filter((c) => (t ? apenasDigitos(c.telefone) === t : c.id === clienteId));
  return !mesmos.some(
    (c) => c.origem === "importado" || b.agendamentos.some((a) => a.clienteId === c.id && a.status !== "cancelado"),
  );
}

/** "aaaa-mm-dd" que existe e já passou; o resto vira null (como data_ou_nulo no banco). */
export function nascimentoValido(texto: string | null | undefined, hoje: string): string | null {
  if (!texto || !/^\d{4}-\d{2}-\d{2}$/.test(texto)) return null;
  const [a, m, d] = texto.split("-").map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d));
  if (dt.getUTCFullYear() !== a || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return texto >= "1900-01-01" && texto <= hoje ? texto : null;
}

export function salvarCliente(b: Banco, c: Cliente): Banco {
  return { ...b, clientes: upsert(b.clientes, { ...c, nome: capitalizarNome(c.nome), telefone: apenasDigitos(c.telefone) }) };
}

export function novoCliente(dados: Partial<Cliente> & { nome: string; telefone: string }, agora: string): Cliente {
  return {
    id: novoId("cl"),
    email: "",
    nascimento: null,
    observacoes: "",
    tags: [],
    origem: "painel",
    criadoEm: agora,
    consentimentoWhats: true,
    ...dados,
    nome: capitalizarNome(dados.nome),
    telefone: apenasDigitos(dados.telefone),
  };
}

export function importarClientes(b: Banco, linhas: LinhaImportada[], agora: string, tagExtra?: string): Banco {
  const novos = linhas
    .filter((l) => !l.problema)
    .map((l) =>
      novoCliente(
        {
          nome: l.nome,
          telefone: l.telefone,
          email: l.email,
          nascimento: l.nascimento,
          observacoes: l.observacoes,
          tags: tagExtra ? [...l.tags, tagExtra] : l.tags,
          origem: "importado",
        },
        agora,
      ),
    );
  return { ...b, clientes: [...b.clientes, ...novos] };
}

// ---------------------------------------------------------------------
// Agendamentos
// ---------------------------------------------------------------------

export type DadosAgendamento = {
  servicosIds: string[];
  profissionalId: string | null;
  data: string;
  hora: string;
  canal: Canal;
  agora: string;
  cliente: { id?: string; nome: string; telefone: string; email?: string; nascimento?: string | null };
  observacao?: string;
  cupom?: string | null;
  /** o painel pode encaixar fora da antecedência mínima */
  encaixe?: boolean;
  /** o painel pode marcar sem as promoções automáticas (o cupom continua valendo) */
  semPromocoes?: boolean;
};

export function aplicarCupom(b: Banco, codigo: string | null | undefined, total: number): { cupom: Cupom | null; desconto: number } {
  if (!codigo) return { cupom: null, desconto: 0 };
  const c = b.cupons.find((x) => x.ativo && x.codigo.toUpperCase() === codigo.trim().toUpperCase());
  if (!c) return { cupom: null, desconto: 0 };
  const desconto = c.tipo === "percentual" ? Math.round(total * c.valor) / 100 : Math.min(total, c.valor);
  return { cupom: c, desconto };
}

export function criarAgendamento(b: Banco, d: DadosAgendamento): Resultado<Agendamento> {
  const servicos = servicosDoPedido(b, d.servicosIds);
  if (!servicos.length) return { ok: false, motivo: "Escolha pelo menos um serviço." };
  // o preço vem do banco, nunca de quem pediu (lição 049 do livo)
  const v = validarHorario(b, {
    servicosIds: d.servicosIds,
    profissionalId: d.profissionalId,
    data: d.data,
    hora: d.hora,
    agora: d.agora,
    ignorarRegras: d.encaixe,
  });
  if (!v.ok) return v;

  const n = b.negocio;
  const nascimento = nascimentoValido(d.cliente.nascimento, d.agora.slice(0, 10));
  if (d.canal === "online" && !nascimento && n.regras.pedirNascimento === "obrigatorio") {
    return { ok: false, motivo: "Informe sua data de nascimento." };
  }

  let banco = b;
  let cliente = d.cliente.id
    ? b.clientes.find((c) => c.id === d.cliente.id)
    : acharClientePorTelefone(b, d.cliente.telefone);
  // primeira vez? (antes de cadastrar: o cadastro novo não muda a resposta)
  const novo = clienteENovo(b, cliente?.telefone ?? d.cliente.telefone, cliente?.id);
  if (!cliente) {
    cliente = novoCliente(
      {
        nome: d.cliente.nome,
        telefone: d.cliente.telefone,
        email: d.cliente.email ?? "",
        nascimento,
        origem: d.canal === "online" ? "online" : "painel",
      },
      d.agora,
    );
    banco = { ...banco, clientes: [...banco.clientes, cliente] };
  } else if (!cliente.nascimento && nascimento) {
    // o cadastro sem data ganha a digitada; com data, ela não muda por aqui
    cliente = { ...cliente, nascimento };
    banco = { ...banco, clientes: upsert(banco.clientes, cliente) };
  }

  const { atendimento, intervalo } = duracaoTotal(servicos);
  const inicio = juntar(d.data, d.hora);
  const { cupom } = aplicarCupom(b, d.cupom, 0);
  // a mesma regra do banco (public.preco_calcular)
  const preco = calcularPreco({
    promocoes: d.semPromocoes ? null : n.promocoes,
    precos: servicos.map((s) => s.preco),
    novo,
    nascimento: cliente.nascimento,
    dia: d.data,
    cupom,
  });
  const cupomUsado = preco.descontos.some((x) => x.tipo === "cupom");
  const exigeSinal = n.modulos.sinal && servicos.some((s) => n.sinal.servicosIds.includes(s.id));

  // pacote do cliente que cobre o serviço principal
  const pk = b.pacotesClientes.find((pc) => {
    const p = b.pacotes.find((x) => x.id === pc.pacoteId);
    return pc.clienteId === cliente!.id && p && servicos.some((s) => s.id === p.servicoId) && pc.sessoesUsadas < p.sessoes && pc.validoAte >= d.data;
  });

  const ag: Agendamento = {
    id: novoId("ag"),
    token: novoToken(),
    clienteId: cliente.id,
    profissionalId: v.profissionalId,
    inicio,
    fim: somarMin(inicio, atendimento),
    intervaloMin: intervalo,
    status: d.canal === "online" && n.regras.confirmacao === "manual" ? "pendente" : "confirmado",
    canal: d.canal,
    itens: servicos.map((s) => ({ servicoId: s.id, nome: s.nome, preco: s.preco, duracaoMin: s.duracaoMin })),
    total: preco.total,
    desconto: preco.desconto,
    descontos: preco.descontos,
    observacao: d.observacao ?? "",
    criadoEm: d.agora,
    confirmadoEm: null,
    lembreteEm: null,
    canceladoPor: null,
    motivoCancelamento: "",
    pagamento: null,
    sinal: exigeSinal ? { valor: Math.round((preco.total * n.sinal.percentual) / 100), pago: false } : null,
    pacoteClienteId: pk?.id ?? null,
    cupom: cupomUsado ? cupom!.codigo : null,
  };
  if (ag.status === "confirmado") ag.confirmadoEm = d.agora;

  banco = { ...banco, agendamentos: [...banco.agendamentos, ag] };
  if (cupomUsado) banco = { ...banco, cupons: trocar(banco.cupons, cupom!.id, (c) => ({ ...c, usos: c.usos + 1 })) };
  return { ok: true, banco, valor: ag };
}

export function mudarStatus(b: Banco, id: string, status: StatusAgendamento, agora: string): Banco {
  return {
    ...b,
    agendamentos: trocar(b.agendamentos, id, (a) => ({
      ...a,
      status,
      confirmadoEm: status === "confirmado" ? agora : a.confirmadoEm,
    })),
  };
}

export function cancelar(b: Banco, id: string, por: "cliente" | "negocio", motivo: string): Banco {
  return {
    ...b,
    agendamentos: trocar(b.agendamentos, id, (a) => ({ ...a, status: "cancelado", canceladoPor: por, motivoCancelamento: motivo })),
  };
}

export function concluir(
  b: Banco,
  id: string,
  pagamento: { forma: FormaPagamento; valor: number },
  agora: string,
): Banco {
  const ag = b.agendamentos.find((a) => a.id === id);
  if (!ag) return b;
  let banco: Banco = {
    ...b,
    agendamentos: trocar(b.agendamentos, id, (a) => ({
      ...a,
      status: "concluido",
      pagamento: { ...pagamento, pagoEm: agora },
    })),
  };
  if (pagamento.forma === "pacote" && ag.pacoteClienteId) {
    banco = {
      ...banco,
      pacotesClientes: trocar(banco.pacotesClientes, ag.pacoteClienteId, (p) => ({ ...p, sessoesUsadas: p.sessoesUsadas + 1 })),
    };
  }
  return banco;
}

export function remarcar(
  b: Banco,
  id: string,
  novo: { data: string; hora: string; profissionalId: string | null; agora: string; encaixe?: boolean },
): Resultado<Agendamento> {
  const ag = b.agendamentos.find((a) => a.id === id);
  if (!ag) return { ok: false, motivo: "Agendamento não encontrado." };
  const v = validarHorario(b, {
    servicosIds: ag.itens.map((i) => i.servicoId),
    profissionalId: novo.profissionalId,
    data: novo.data,
    hora: novo.hora,
    agora: novo.agora,
    ignorarAgendamentoId: id,
    ignorarRegras: novo.encaixe,
  });
  if (!v.ok) return v;
  const inicio = juntar(novo.data, novo.hora);
  const duracao = ag.itens.reduce((s, i) => s + i.duracaoMin, 0);
  const atualizado: Agendamento = {
    ...ag,
    inicio,
    fim: somarMin(inicio, duracao),
    profissionalId: v.profissionalId,
    status: ag.status === "cancelado" || ag.status === "faltou" ? "confirmado" : ag.status,
    lembreteEm: null,
  };
  return { ok: true, banco: { ...b, agendamentos: upsert(b.agendamentos, atualizado) }, valor: atualizado };
}

export function marcarSinalPago(b: Banco, id: string): Banco {
  return {
    ...b,
    agendamentos: trocar(b.agendamentos, id, (a) => (a.sinal ? { ...a, sinal: { ...a.sinal, pago: true }, status: a.status === "pendente" ? "confirmado" : a.status } : a)),
  };
}

export function registrarMensagem(b: Banco, tipo: TipoMensagem, clienteId: string, agendamentoId: string | null, agora: string): Banco {
  let banco: Banco = {
    ...b,
    registrosMensagem: [...b.registrosMensagem, { id: novoId("rm"), tipo, clienteId, agendamentoId, enviadaEm: agora }],
  };
  if (tipo === "lembrete" && agendamentoId) {
    banco = { ...banco, agendamentos: trocar(banco.agendamentos, agendamentoId, (a) => ({ ...a, lembreteEm: agora })) };
  }
  return banco;
}

// ---------------------------------------------------------------------
// Catálogo e equipe
// ---------------------------------------------------------------------

export function salvarServico(b: Banco, s: Servico): Banco {
  return { ...b, servicos: upsert(b.servicos, s) };
}

export function servicoNovo(b: Banco, categoriaId: string | null): Servico {
  return {
    id: novoId("sv"),
    categoriaId,
    nome: "",
    descricao: "",
    duracaoMin: 30,
    intervaloMin: 0,
    preco: 0,
    modoPreco: "fixo",
    online: true,
    ativo: true,
    pausado: false,
    destaque: false,
    ordem: b.servicos.length,
    retornoDias: null,
    fichaId: null,
    fotoUrl: null,
  };
}

/** Remoção suave: some de tudo, mas o histórico continua apontando para ele. */
export function arquivarServico(b: Banco, id: string): Banco {
  return {
    ...b,
    servicos: trocar(b.servicos, id, (s) => ({ ...s, ativo: false })),
    profissionais: b.profissionais.map((p) => ({ ...p, servicosIds: p.servicosIds.filter((x) => x !== id) })),
  };
}

export function reordenar<T extends { id: string; ordem: number }>(lista: T[], ids: string[]): T[] {
  return lista.map((x) => (ids.includes(x.id) ? { ...x, ordem: ids.indexOf(x.id) } : x));
}

export function salvarCategoria(b: Banco, c: Categoria): Banco {
  return { ...b, categorias: upsert(b.categorias, c) };
}

export function removerCategoria(b: Banco, id: string): Banco {
  return {
    ...b,
    categorias: b.categorias.filter((c) => c.id !== id),
    servicos: b.servicos.map((s) => (s.categoriaId === id ? { ...s, categoriaId: null } : s)),
  };
}

export function salvarProfissional(b: Banco, p: Profissional): Banco {
  return { ...b, profissionais: upsert(b.profissionais, p) };
}

export function profissionalNovo(b: Banco): Profissional {
  const usadas = new Set(b.profissionais.map((p) => p.cor));
  let cor = 0;
  while (usadas.has(cor) && cor < 7) cor++;
  return {
    id: novoId("pr"),
    nome: "",
    cargo: "",
    bio: "",
    cor,
    fotoUrl: null,
    comissaoPct: 40,
    ativo: true,
    ordem: b.profissionais.length,
    servicosIds: b.servicos.filter((s) => s.ativo).map((s) => s.id),
    horario: structuredClone(b.negocio.horario),
    acesso: null,
  };
}

export function salvarBloqueio(b: Banco, bl: Bloqueio): Banco {
  return { ...b, bloqueios: upsert(b.bloqueios, bl) };
}

export function removerBloqueio(b: Banco, id: string): Banco {
  return { ...b, bloqueios: b.bloqueios.filter((x) => x.id !== id) };
}

// ---------------------------------------------------------------------
// Financeiro, pacotes, fichas, mensagens, página
// ---------------------------------------------------------------------

export function salvarLancamento(b: Banco, l: Lancamento): Banco {
  return { ...b, lancamentos: upsert(b.lancamentos, l) };
}

export function removerLancamento(b: Banco, id: string): Banco {
  return { ...b, lancamentos: b.lancamentos.filter((l) => l.id !== id) };
}

export function salvarPacote(b: Banco, p: Pacote): Banco {
  return { ...b, pacotes: upsert(b.pacotes, p) };
}

export function venderPacote(b: Banco, pacoteId: string, clienteId: string, hoje: string, forma: FormaPagamento): Banco {
  const p = b.pacotes.find((x) => x.id === pacoteId);
  if (!p) return b;
  const pc: PacoteCliente = {
    id: novoId("pc"),
    pacoteId,
    clienteId,
    compradoEm: hoje,
    sessoesUsadas: 0,
    validoAte: somarDias(hoje, p.validadeDias),
  };
  const receita: Lancamento = {
    id: novoId("lc"),
    tipo: "receita",
    categoria: "Pacotes",
    descricao: `${p.nome} (${forma})`,
    valor: p.preco,
    data: hoje,
    pago: true,
    recorrente: false,
  };
  return { ...b, pacotesClientes: [...b.pacotesClientes, pc], lancamentos: [...b.lancamentos, receita] };
}

export function salvarModeloFicha(b: Banco, m: ModeloFicha): Banco {
  return { ...b, modelosFicha: upsert(b.modelosFicha, m) };
}

export function salvarFicha(b: Banco, f: Ficha): Banco {
  return { ...b, fichas: upsert(b.fichas, f) };
}

export function salvarMensagem(b: Banco, m: ModeloMensagem): Banco {
  return { ...b, mensagens: b.mensagens.map((x) => (x.tipo === m.tipo ? m : x)) };
}

export function salvarNegocio(b: Banco, parcial: Partial<Negocio>): Banco {
  return { ...b, negocio: { ...b.negocio, ...parcial } };
}

export function salvarDepoimento(b: Banco, d: Depoimento): Banco {
  return { ...b, depoimentos: upsert(b.depoimentos, d) };
}

export function salvarCupom(b: Banco, c: Cupom): Banco {
  return { ...b, cupons: upsert(b.cupons, c) };
}

export function removerCupom(b: Banco, id: string): Banco {
  return { ...b, cupons: b.cupons.filter((c) => c.id !== id) };
}
