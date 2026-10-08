// =====================================================================
// Gera o "banco" de um negócio de demonstração.
//
// Determinístico (mesmo negócio + mesmo dia = mesmos dados) e relativo a
// HOJE: sempre há agenda de hoje, semana cheia pela frente e três meses de
// histórico para os relatórios terem o que mostrar.
// =====================================================================

import type {
  Agendamento,
  Banco,
  Bloqueio,
  Cliente,
  Depoimento,
  Ficha,
  FormaPagamento,
  Lancamento,
  Negocio,
  PacoteCliente,
  RegistroMensagem,
  Servico,
} from "../tipos";
import {
  agoraNo,
  diaDaSemana,
  difMin,
  horaDoMin,
  inicioDoMes,
  juntar,
  minDoDia,
  ms,
  somarDias,
  somarMeses,
  somarMin,
} from "../datas";
import { MENSAGENS_PADRAO } from "../padroes";
import { feriadosNacionais } from "../feriados";
import { DEMOS, type DefinicaoDemo } from "./negocios";

export const VERSAO_BANCO = 4;

// ---------- aleatório previsível ----------

function semente(texto: string): number {
  let h = 2166136261;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Rng = () => number;

function escolher<T>(r: Rng, lista: readonly T[]): T {
  return lista[Math.floor(r() * lista.length)];
}

function ponderado<T>(r: Rng, lista: readonly T[], pesos: readonly number[]): T {
  const total = pesos.reduce((s, p) => s + p, 0);
  let x = r() * total;
  for (let i = 0; i < lista.length; i++) {
    x -= pesos[i];
    if (x <= 0) return lista[i];
  }
  return lista[lista.length - 1];
}

function idDe(r: Rng, prefixo: string): string {
  return prefixo + "_" + Math.floor(r() * 0xffffffff).toString(36) + Math.floor(r() * 0xffffff).toString(36);
}

function tokenDe(r: Rng): string {
  let t = "";
  for (let i = 0; i < 12; i++) t += "abcdefghjkmnpqrstuvwxyz23456789"[Math.floor(r() * 31)];
  return t;
}

// ---------- nomes ----------

const FEMININOS = [
  "Ana", "Beatriz", "Camila", "Daniela", "Eduarda", "Fernanda", "Gabriela", "Helena", "Isabela", "Júlia",
  "Larissa", "Mariana", "Natália", "Patrícia", "Rafaela", "Sabrina", "Tatiane", "Vanessa", "Yasmin", "Aline",
  "Bruna", "Carolina", "Débora", "Elaine", "Flávia", "Giovana", "Ingrid", "Jéssica", "Karina", "Letícia",
  "Michele", "Nathália", "Paula", "Priscila", "Renata", "Simone", "Thaís", "Viviane", "Lorena", "Manuela",
  "Cecília", "Alice", "Valentina", "Luana", "Raquel", "Cíntia", "Adriana", "Kelly", "Roberta", "Lívia",
];
const MASCULINOS = [
  "Lucas", "Pedro", "Gabriel", "Matheus", "Rafael", "Gustavo", "Felipe", "Bruno", "Thiago", "Diego",
  "André", "Carlos", "Daniel", "Eduardo", "Fábio", "Guilherme", "Henrique", "Igor", "João", "Leonardo",
  "Marcos", "Nícolas", "Otávio", "Paulo", "Renan", "Samuel", "Tiago", "Vinícius", "Wesley", "Arthur",
  "Caio", "Davi", "Enzo", "Francisco", "Heitor", "Ícaro", "José", "Kauã", "Luiz", "Murilo",
];
const SOBRENOMES = [
  "Silva", "Santos", "Oliveira", "Souza", "Lima", "Pereira", "Costa", "Ferreira", "Rodrigues", "Almeida",
  "Nascimento", "Araújo", "Carvalho", "Gomes", "Martins", "Rocha", "Ribeiro", "Alves", "Monteiro", "Barbosa",
  "Cavalcante", "Teixeira", "Moreira", "Sampaio", "Bezerra", "Brito", "Macedo", "Feitosa", "Tavares", "Pinheiro",
  "Siqueira", "Leite", "Batista", "Freitas", "Mendes", "Coelho", "Duarte", "Viana", "Queiroz", "Holanda",
];
const TAGS = ["VIP", "Pele sensível", "Prefere manhã", "Indicação", "Pacote", "Pontual", "Chega cedo"];
const OBSERVACOES = [
  "",
  "",
  "",
  "Prefere que avise com antecedência pelo WhatsApp.",
  "Gosta de música baixa durante o atendimento.",
  "Pele sensível: usar o protocolo calmante.",
  "Sempre traz a filha junto.",
  "Prefere ser atendida pela mesma profissional.",
];

// ---------- geração ----------

export function gerarBancoDemo(slug: string): Banco | null {
  const def = DEMOS[slug];
  if (!def) return null;
  const negocio: Negocio = structuredClone(def.negocio);
  const agora = agoraNo(negocio.regras.fuso);
  const hoje = agora.slice(0, 10);
  const r = mulberry32(semente(slug + hoje));

  // feriados que vêm por aí viram datas especiais (o dono pode desmarcar)
  negocio.datasEspeciais = feriadosNacionais(Number(hoje.slice(0, 4)))
    .concat(feriadosNacionais(Number(hoje.slice(0, 4)) + 1))
    .filter((f) => f.data > hoje && f.data <= somarDias(hoje, 75))
    .slice(0, 3)
    .map((f) => ({ data: f.data, rotulo: f.nome }));

  const clientes = gerarClientes(r, def, hoje);
  const servicosPorId = new Map(def.servicos.map((s) => [s.id, s]));

  // pacotes vendidos antes do histórico começar
  const pacotesClientes: PacoteCliente[] = [];
  if (negocio.modulos.pacotes) {
    for (const c of clientes) {
      if (r() < (slug === "ambar" ? 0.14 : 0.12) && def.pacotes.length) {
        const pk = ponderado(r, def.pacotes, def.pacotes.map((_, i) => (i === 0 ? 3 : 1)));
        const compradoEm = somarDias(hoje, -Math.floor(20 + r() * 100));
        pacotesClientes.push({
          id: idDe(r, "pc"),
          pacoteId: pk.id,
          clienteId: c.id,
          compradoEm,
          sessoesUsadas: 0,
          validoAte: somarDias(compradoEm, pk.validadeDias),
        });
      }
    }
  }

  const bloqueios = gerarBloqueios(r, def, hoje);
  const agendamentos = gerarAgendamentos(r, def, negocio, clientes, pacotesClientes, bloqueios, agora);
  const lancamentos = gerarLancamentos(r, def, hoje);
  const fichas = gerarFichas(r, def, clientes, agendamentos, servicosPorId);

  const depoimentos: Depoimento[] = def.depoimentos.map((d, i) => ({
    ...d,
    id: idDe(r, "dp"),
    data: somarDias(hoje, -(4 + i * 9)),
  }));

  // o painel mostra o que já foi enviado hoje
  const registrosMensagem: RegistroMensagem[] = agendamentos
    .filter((a) => a.lembreteEm)
    .map((a) => ({
      id: idDe(r, "rm"),
      tipo: "lembrete" as const,
      clienteId: a.clienteId,
      agendamentoId: a.id,
      enviadaEm: a.lembreteEm!,
    }));

  // primeira visita define o cadastro
  const primeira = new Map<string, string>();
  for (const a of agendamentos) {
    const atual = primeira.get(a.clienteId);
    if (!atual || a.criadoEm < atual) primeira.set(a.clienteId, a.criadoEm);
  }
  for (const c of clientes) c.criadoEm = primeira.get(c.id) ?? c.criadoEm;

  return {
    versao: VERSAO_BANCO,
    negocio,
    categorias: structuredClone(def.categorias),
    servicos: structuredClone(def.servicos),
    profissionais: structuredClone(def.profissionais),
    bloqueios,
    clientes,
    agendamentos,
    lancamentos,
    pacotes: structuredClone(def.pacotes),
    pacotesClientes,
    modelosFicha: structuredClone(def.modelosFicha),
    fichas,
    mensagens: structuredClone(MENSAGENS_PADRAO),
    registrosMensagem,
    depoimentos,
    cupons: structuredClone(def.cupons),
  };
}

function gerarClientes(r: Rng, def: DefinicaoDemo, hoje: string): Cliente[] {
  const usados = new Set<string>();
  const lista: Cliente[] = [];
  for (let i = 0; i < def.clientes.quantidade; i++) {
    const fem = r() < def.clientes.feminino;
    let nome = "";
    for (let t = 0; t < 10; t++) {
      nome = `${escolher(r, fem ? FEMININOS : MASCULINOS)} ${escolher(r, SOBRENOMES)}`;
      if (r() < 0.35) nome += " " + escolher(r, SOBRENOMES);
      if (!usados.has(nome)) break;
    }
    usados.add(nome);
    const ddd = escolher(r, ["88", "88", "88", "85"]);
    const telefone = `${ddd}9${Math.floor(81000000 + r() * 18999999)}`;
    // ~6 aniversariantes nos próximos dias, para a lista nunca nascer vazia
    let nascimento: string | null = null;
    if (r() < 0.82) {
      const ano = 1965 + Math.floor(r() * 40);
      const base = i < 6 ? somarDias(hoje, i) : somarDias(hoje, Math.floor(r() * 365));
      nascimento = `${ano}-${base.slice(5)}`;
      if (nascimento.endsWith("02-29")) nascimento = `${ano}-02-28`;
    }
    const primeiroNome = nome.split(" ")[0].toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    lista.push({
      id: idDe(r, "cl"),
      nome,
      telefone,
      email: r() < 0.45 ? `${primeiroNome}.${Math.floor(r() * 90 + 10)}@email.com` : "",
      nascimento,
      observacoes: escolher(r, OBSERVACOES),
      tags: r() < 0.3 ? [escolher(r, TAGS)] : [],
      origem: r() < 0.55 ? "online" : r() < 0.7 ? "importado" : "painel",
      // 30% da base chega durante o histórico: é o que alimenta "clientes novos"
      criadoEm: (i > 8 && r() < 0.3 ? somarDias(hoje, -Math.floor(r() * 70)) : somarDias(hoje, -120)) + "T09:00",
      consentimentoWhats: r() > 0.05,
    });
  }
  return lista;
}

function gerarBloqueios(r: Rng, def: DefinicaoDemo, hoje: string): Bloqueio[] {
  const pro = def.profissionais[0];
  const lista: Bloqueio[] = [];
  // um compromisso do dono daqui a uns dias, à tarde
  let dia = somarDias(hoje, 3);
  while (!pro.horario[diaDaSemana(dia)]?.length) dia = somarDias(dia, 1);
  lista.push({
    id: idDe(r, "bl"),
    profissionalId: pro.id,
    inicio: juntar(dia, "14:00"),
    fim: juntar(dia, "17:00"),
    motivo: def.negocio.nicho === "depilacao" ? "Manutenção do laser" : "Curso de atualização",
  });
  if (def.profissionais.length > 1) {
    const outro = def.profissionais[1];
    let d2 = somarDias(hoje, 8);
    while (!outro.horario[diaDaSemana(d2)]?.length) d2 = somarDias(d2, 1);
    const ini = outro.horario[diaDaSemana(d2)][0].inicio;
    const fim = outro.horario[diaDaSemana(d2)].at(-1)!.fim;
    lista.push({ id: idDe(r, "bl"), profissionalId: outro.id, inicio: juntar(d2, ini), fim: juntar(d2, fim), motivo: "Folga" });
  }
  return lista;
}

function gerarAgendamentos(
  r: Rng,
  def: DefinicaoDemo,
  negocio: Negocio,
  clientes: Cliente[],
  pacotesClientes: PacoteCliente[],
  bloqueios: Bloqueio[],
  agora: string,
): Agendamento[] {
  const hoje = agora.slice(0, 10);
  const lista: Agendamento[] = [];
  const servicos = def.servicos;
  const fiéis = clientes.slice(0, Math.ceil(clientes.length * 0.45)).filter((c) => c.criadoEm.slice(0, 10) <= somarDias(hoje, -75));
  const feriados = new Set(negocio.datasEspeciais.map((d) => d.data));

  for (let dif = -75; dif <= 21; dif++) {
    const dia = somarDias(hoje, dif);
    if (feriados.has(dia)) continue;
    const semana = diaDaSemana(dia);
    // sexta e sábado são mais cheios; o futuro vai esvaziando
    const fatorDia = semana === 5 || semana === 6 ? 1.18 : semana === 1 ? 0.85 : 1;
    const fatorFuturo = dif <= 0 ? 1 : dif <= 2 ? 0.92 : Math.max(0.12, Math.exp(-(dif - 2) / 8));
    const ocupacao = Math.min(0.92, def.ocupacao * fatorDia * fatorFuturo);

    for (const pro of def.profissionais) {
      const faixas = pro.horario[semana] ?? [];
      const meus = servicos.filter((s) => pro.servicosIds.includes(s.id));
      const pesos = meus.map((s) => def.peso[servicos.indexOf(s)] ?? 1);
      const bloqueiosDoDia = bloqueios.filter(
        (b) => (b.profissionalId === pro.id || b.profissionalId === null) && b.inicio.slice(0, 10) === dia,
      );

      for (const faixa of faixas) {
        let t = minDoDia(faixa.inicio);
        const fim = minDoDia(faixa.fim);
        while (t < fim) {
          if (r() > ocupacao) {
            t += escolher(r, [15, 30, 30, 45]);
            continue;
          }
          const s: Servico = ponderado(r, meus, pesos);
          const total = s.duracaoMin + s.intervaloMin;
          if (t + s.duracaoMin > fim) break;
          const inicio = juntar(dia, horaDoMin(t));
          const fimAg = somarMin(inicio, s.duracaoMin);
          const bloqueado = bloqueiosDoDia.some((b) => ms(b.inicio) < ms(somarMin(fimAg, s.intervaloMin)) && ms(inicio) < ms(b.fim));
          if (bloqueado) {
            t += 30;
            continue;
          }
          const cliente = sortearCliente(r, fiéis, clientes, dia);
          lista.push(montar(r, negocio, pro.id, cliente, s, inicio, fimAg, agora, pacotesClientes, def));
          t += total;
          // um respiro entre clientes, às vezes
          if (r() < 0.25) t += 15;
          t = Math.ceil(t / negocio.regras.intervaloSlotsMin) * negocio.regras.intervaloSlotsMin;
        }
      }
    }
  }
  return lista.sort((a, b) => (a.inicio < b.inicio ? -1 : 1));
}

/** Cliente que já "existia" naquele dia — parte da base chega durante o histórico. */
function sortearCliente(r: Rng, fieis: Cliente[], todos: Cliente[], dia: string): Cliente {
  for (let t = 0; t < 8; t++) {
    const c = r() < 0.55 ? escolher(r, fieis) : escolher(r, todos);
    if (c.criadoEm.slice(0, 10) <= dia) return c;
  }
  return fieis[0];
}

function montar(
  r: Rng,
  negocio: Negocio,
  profissionalId: string,
  cliente: Cliente,
  s: Servico,
  inicio: string,
  fim: string,
  agora: string,
  pacotesClientes: PacoteCliente[],
  def: DefinicaoDemo,
): Agendamento {
  const passado = fim <= agora;
  const emCurso = inicio <= agora && fim > agora;
  const criadoEm = somarMin(inicio, -Math.floor((6 + r() * 220) * 60));
  const canalSorteio = r();
  const canal = canalSorteio < 0.58 ? "online" : canalSorteio < 0.9 ? "painel" : "whatsapp";

  let status: Agendamento["status"];
  if (passado) {
    const x = r();
    status = x < 0.885 ? "concluido" : x < 0.95 ? "cancelado" : "faltou";
  } else if (emCurso) {
    status = "confirmado";
  } else {
    const horas = difMin(agora, inicio) / 60;
    const x = r();
    status = x < 0.04 ? "cancelado" : horas < 30 ? (x < 0.78 ? "confirmado" : "pendente") : x < 0.55 ? "confirmado" : "pendente";
  }

  // pacote do cliente para este serviço, com sessões sobrando
  let pacoteClienteId: string | null = null;
  const pk = pacotesClientes.find((p) => {
    const def_pk = def.pacotes.find((x) => x.id === p.pacoteId);
    return p.clienteId === cliente.id && def_pk?.servicoId === s.id && p.sessoesUsadas < def_pk.sessoes && p.compradoEm <= inicio.slice(0, 10);
  });
  if (pk && status !== "cancelado") {
    pacoteClienteId = pk.id;
    if (status === "concluido" || status === "faltou") pk.sessoesUsadas++;
  }

  let pagamento: Agendamento["pagamento"] = null;
  if (status === "concluido") {
    const forma: FormaPagamento = pacoteClienteId
      ? "pacote"
      : ponderado(r, ["pix", "credito", "debito", "dinheiro"] as const, [50, 20, 16, 14]);
    pagamento = { forma, valor: pacoteClienteId ? 0 : s.preco, pagoEm: fim };
  }

  const exigeSinal = negocio.modulos.sinal && negocio.sinal.servicosIds.includes(s.id);

  return {
    id: idDe(r, "ag"),
    token: tokenDe(r),
    clienteId: cliente.id,
    profissionalId,
    inicio,
    fim,
    intervaloMin: s.intervaloMin,
    status,
    canal,
    itens: [{ servicoId: s.id, nome: s.nome, preco: s.preco, duracaoMin: s.duracaoMin }],
    total: s.preco,
    desconto: 0,
    observacao: r() < 0.08 ? "Primeira vez, chegar 10 min antes." : "",
    criadoEm,
    confirmadoEm: status === "confirmado" || status === "concluido" ? somarMin(criadoEm, 30) : null,
    lembreteEm:
      !passado && difMin(agora, inicio) < 26 * 60 && status === "confirmado" && r() < 0.6
        ? somarMin(agora, -Math.floor(r() * 300))
        : passado && r() < 0.7
          ? somarMin(inicio, -20 * 60)
          : null,
    canceladoPor: status === "cancelado" ? (r() < 0.75 ? "cliente" : "negocio") : null,
    motivoCancelamento: status === "cancelado" ? escolher(r, ["Imprevisto no trabalho", "Viagem", "Doença", "Remarcou para outro dia", ""]) : "",
    pagamento,
    sinal: exigeSinal ? { valor: Math.round((s.preco * negocio.sinal.percentual) / 100), pago: status !== "pendente" } : null,
    pacoteClienteId,
    cupom: null,
  };
}

function gerarLancamentos(r: Rng, def: DefinicaoDemo, hoje: string): Lancamento[] {
  const lista: Lancamento[] = [];
  for (let m = -3; m <= 0; m++) {
    const mes = inicioDoMes(somarMeses(hoje, m));
    for (const d of def.despesas) {
      const data = `${mes.slice(0, 8)}${String(d.dia).padStart(2, "0")}`;
      const variacao = d.variacao ? 1 + (r() * 2 - 1) * d.variacao : 1;
      lista.push({
        id: idDe(r, "lc"),
        tipo: "despesa",
        categoria: d.categoria,
        descricao: d.descricao,
        valor: Math.round(d.valor * variacao),
        data,
        pago: data <= hoje,
        recorrente: !d.variacao,
      });
    }
    // vendas no balcão espalhadas pelo mês
    const vendas = 3 + Math.floor(r() * 6);
    for (let v = 0; v < vendas; v++) {
      const data = somarDias(mes, Math.floor(r() * 27));
      if (data > hoje) continue;
      const venda = escolher(r, def.vendasAvulsas);
      lista.push({
        id: idDe(r, "lc"),
        tipo: "receita",
        categoria: "Venda de produtos",
        descricao: venda.descricao,
        valor: venda.valor,
        data,
        pago: true,
        recorrente: false,
      });
    }
  }
  return lista.sort((a, b) => (a.data < b.data ? -1 : 1));
}

function gerarFichas(
  r: Rng,
  def: DefinicaoDemo,
  clientes: Cliente[],
  agendamentos: Agendamento[],
  servicos: Map<string, Servico>,
): Ficha[] {
  if (!def.modelosFicha.length) return [];
  const fichas: Ficha[] = [];
  const feitas = new Set<string>();
  for (const a of agendamentos) {
    const s = servicos.get(a.itens[0].servicoId);
    if (!s?.fichaId || a.status !== "concluido") continue;
    const chave = a.clienteId + s.fichaId;
    if (feitas.has(chave) || r() < 0.12) continue;
    feitas.add(chave);
    const modelo = def.modelosFicha.find((m) => m.id === s.fichaId)!;
    const cliente = clientes.find((c) => c.id === a.clienteId)!;
    const respostas: Record<string, string | string[]> = {};
    for (const campo of modelo.campos) {
      if (campo.tipo === "simNao") respostas[campo.id] = r() < 0.12 ? "Sim" : "Não";
      else if (campo.tipo === "escolha") respostas[campo.id] = ponderado(r, campo.opcoes, campo.opcoes.map((_, i) => (i >= 1 && i <= 3 ? 4 : 1)));
      else if (campo.tipo === "multipla") respostas[campo.id] = r() < 0.8 ? ["Nenhuma"] : [escolher(r, campo.opcoes.slice(0, -1))];
      else if (campo.id === "medicamentos") respostas[campo.id] = r() < 0.75 ? "" : escolher(r, ["Anticoncepcional", "Losartana", "Levotiroxina"]);
      else respostas[campo.id] = "";
    }
    fichas.push({
      id: idDe(r, "fc"),
      modeloId: modelo.id,
      clienteId: cliente.id,
      agendamentoId: a.id,
      respostas,
      preenchidaEm: somarMin(a.inicio, -60 * 20),
      assinatura: cliente.nome,
    });
  }
  return fichas;
}
