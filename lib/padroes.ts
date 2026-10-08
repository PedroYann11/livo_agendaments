// =====================================================================
// Valores PADRÃO de um negócio novo e os presets por nicho.
//
// Regra herdada do livo (migration 014, D-1): negócio novo nasce NEUTRO.
// Nada aqui é dado de outro negócio — nada de telefone, endereço ou Pix de
// ninguém. O que varia por nicho é só o que faz sentido ligar de saída.
// =====================================================================

import type {
  Modulo,
  ModeloMensagem,
  Negocio,
  Nicho,
  Pele,
  RegrasAgendamento,
  Semana,
  Tema,
} from "./tipos";

export const MODULOS: { id: Modulo; nome: string; descricao: string; icone: string }[] = [
  {
    id: "anamnese",
    nome: "Ficha de anamnese",
    descricao: "Perguntas de saúde antes do atendimento. Essencial em laser, estética e saúde.",
    icone: "ficha",
  },
  {
    id: "pacotes",
    nome: "Pacotes e assinaturas",
    descricao: "Venda de sessões (10 sessões de laser) ou planos mensais (clube do corte).",
    icone: "pacote",
  },
  {
    id: "comissoes",
    nome: "Comissões",
    descricao: "Percentual de cada profissional calculado sozinho a cada atendimento concluído.",
    icone: "comissao",
  },
  {
    id: "financeiro",
    nome: "Financeiro",
    descricao: "Entradas, despesas, lucro do mês e meta de faturamento.",
    icone: "financeiro",
  },
  {
    id: "sinal",
    nome: "Sinal via Pix",
    descricao: "Cobrar uma parte antes para garantir o horário. Reduz faltas em serviços longos.",
    icone: "pix",
  },
  {
    id: "retorno",
    nome: "Lembrete de retorno",
    descricao: "Avisa quando o cliente passou do tempo de voltar (sessão de laser, manutenção, corte).",
    icone: "retorno",
  },
  {
    id: "avaliacoes",
    nome: "Avaliações",
    descricao: "Depoimentos de clientes na sua página, com aprovação antes de aparecer.",
    icone: "estrela",
  },
  {
    id: "aniversarios",
    nome: "Aniversariantes",
    descricao: "Lista de quem faz aniversário na semana, com mensagem pronta.",
    icone: "presente",
  },
];

const TODOS_DESLIGADOS: Record<Modulo, boolean> = {
  anamnese: false,
  pacotes: false,
  comissoes: false,
  financeiro: true,
  sinal: false,
  retorno: true,
  avaliacoes: true,
  aniversarios: true,
};

export const NICHOS: { id: Nicho; nome: string; pele: Pele; modulos: Partial<Record<Modulo, boolean>> }[] = [
  { id: "depilacao", nome: "Depilação", pele: "beleza", modulos: { anamnese: true, pacotes: true, comissoes: true } },
  { id: "barbearia", nome: "Barbearia", pele: "barbearia", modulos: { pacotes: true, comissoes: true } },
  { id: "unhas", nome: "Unhas / nail designer", pele: "delicada", modulos: { sinal: true } },
  { id: "salao", nome: "Salão de beleza", pele: "beleza", modulos: { comissoes: true, pacotes: true } },
  { id: "estetica", nome: "Estética", pele: "beleza", modulos: { anamnese: true, pacotes: true, comissoes: true } },
  { id: "sobrancelha", nome: "Sobrancelha e cílios", pele: "delicada", modulos: { sinal: true } },
  { id: "saude", nome: "Saúde (fisio, nutri, psico…)", pele: "generica", modulos: { anamnese: true, pacotes: true } },
  { id: "outro", nome: "Outro serviço", pele: "generica", modulos: {} },
];

export function modulosDoNicho(nicho: Nicho): Record<Modulo, boolean> {
  return { ...TODOS_DESLIGADOS, ...(NICHOS.find((n) => n.id === nicho)?.modulos ?? {}) };
}

export const TEMA_NEUTRO: Tema = {
  marca: "#1f5c4b",
  sobreMarca: "#ffffff",
  fundo: "#f6f5f2",
  superficie: "#ffffff",
  texto: "#1c1c20",
  textoSuave: "#5f5f69",
  acento: "#c9a46a",
};

export const REGRAS_PADRAO: RegrasAgendamento = {
  intervaloSlotsMin: 15,
  antecedenciaMinHoras: 2,
  janelaMaxDias: 45,
  confirmacao: "automatica",
  cancelamentoAteHoras: 12,
  fuso: "America/Fortaleza",
  escolherProfissional: true,
  multiplosServicos: true,
};

export function semanaComercial(
  inicio = "08:00",
  fim = "18:00",
  almoco: [string, string] | null = ["12:00", "13:00"],
  sabado: [string, string] | null = ["08:00", "12:00"],
): Semana {
  const dia = almoco
    ? [
        { inicio, fim: almoco[0] },
        { inicio: almoco[1], fim },
      ]
    : [{ inicio, fim }];
  return {
    0: [],
    1: dia,
    2: dia,
    3: dia,
    4: dia,
    5: dia,
    6: sabado ? [{ inicio: sabado[0], fim: sabado[1] }] : [],
  };
}

export const MENSAGENS_PADRAO: ModeloMensagem[] = [
  {
    tipo: "confirmacao",
    titulo: "Confirmação",
    ativo: true,
    texto:
      "Oi, {nome}! Seu horário na {negocio} está marcado:\n{servico}\n{data}, às {hora}, com {profissional}.\n\nPara confirmar, remarcar ou cancelar: {link}",
  },
  {
    tipo: "lembrete",
    titulo: "Lembrete da véspera",
    ativo: true,
    texto:
      "Oi, {nome}! Passando para lembrar do seu horário amanhã, {data}, às {hora} ({servico}).\nEndereço: {endereco}\n\nResponda SIM para confirmar. Se precisar remarcar: {link}",
  },
  {
    tipo: "aniversario",
    titulo: "Aniversário",
    ativo: true,
    texto:
      "Feliz aniversário, {nome}! Toda a equipe da {negocio} deseja um ano lindo para você. Tem um mimo esperando por aqui no seu próximo horário.",
  },
  {
    tipo: "pos_atendimento",
    titulo: "Pós-atendimento",
    ativo: true,
    texto:
      "{nome}, obrigado pela visita hoje! Sua opinião ajuda muito a {negocio}. Se puder, conta pra gente como foi: {link}",
  },
  {
    tipo: "retorno",
    titulo: "Hora de voltar",
    ativo: true,
    texto:
      "Oi, {nome}! Já está na hora do seu próximo {servico}. Que tal garantir um horário? É só escolher por aqui: {link}",
  },
  {
    tipo: "cancelamento",
    titulo: "Cancelamento",
    ativo: true,
    texto:
      "Oi, {nome}. Seu horário de {data} às {hora} foi cancelado. Quando quiser remarcar, é só escolher um novo horário: {link}",
  },
];

/** Um negócio recém-criado: só o nome e o nicho, o resto neutro. */
export function negocioNovo(id: string, slug: string, nome: string, nicho: Nicho): Negocio {
  const preset = NICHOS.find((n) => n.id === nicho);
  return {
    id,
    slug,
    nome,
    nicho,
    pele: preset?.pele ?? "generica",
    tagline: "",
    descricao: "",
    sobre: "",
    destaques: [],
    tema: TEMA_NEUTRO,
    logoUrl: null,
    logoCompletoUrl: null,
    capaUrl: null,
    galeria: [],
    contato: { whatsapp: "", instagram: "", telefone: "", email: "" },
    endereco: { cep: "", rua: "", numero: "", complemento: "", bairro: "", cidade: "", uf: "", referencia: "" },
    horario: semanaComercial(),
    datasEspeciais: [],
    regras: REGRAS_PADRAO,
    modulos: modulosDoNicho(nicho),
    pix: { chave: "", nome: "", cidade: "" },
    sinal: { percentual: 30, servicosIds: [] },
    metaMensal: 0,
    aviso: { texto: "", ativo: false },
  };
}
