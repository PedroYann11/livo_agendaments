// =====================================================================
// DepiLED — o primeiro negócio real (piloto).
//
// Só dados PÚBLICOS: marca, categorias e serviços com preço e duração,
// transcritos do app que a DepiLED usa hoje (08/10/2026). Clientes e
// agendamentos NÃO entram aqui: este arquivo vai para o navegador de
// qualquer visitante. Eles entram pelo banco, protegidos pela RLS.
//
// Marcados "a confirmar" em docs/ESTADO.md: quem atende e
// WhatsApp/Instagram/endereço. Os 3 serviços sem categoria o dono decide.
// =====================================================================

import type { Categoria, Negocio, Profissional, Semana, Servico } from "../tipos";
import { MENSAGENS_PADRAO, REGRAS_PADRAO, modulosDoNicho } from "../padroes";
import type { Semente } from "./tipos";

const FEM = "dp_cat_feminino";
const MASC = "dp_cat_masculino";
const COMBO = "dp_cat_combos";

const categorias: Categoria[] = [
  { id: FEM, nome: "Procedimentos Femininos", descricao: "", ordem: 0, pausada: false },
  { id: MASC, nome: "Procedimentos Masculinos", descricao: "", ordem: 1, pausada: false },
  { id: COMBO, nome: "Combos", descricao: "Duas áreas com valor promocional", ordem: 2, pausada: false },
];

type Linha = [id: string, categoria: string | null, nome: string, minutos: number, preco: number, extra?: Partial<Servico>];

// mesma ordem e mesmos valores da lista do app atual. Descrições curtas no
// padrão da única que existia lá (Abdome); o cliente só as vê ao escolher.
const linhas: Linha[] = [
  ["dp_abdome", FEM, "Abdome", 10, 90, { descricao: "Remoção definitiva dos pelos na região abdominal, com suavidade e segurança." }],
  ["dp_antebracos", FEM, "Antebraços", 10, 60, { descricao: "Remoção definitiva dos pelos dos antebraços, com suavidade e segurança." }],
  ["dp_axilas", FEM, "Axilas", 5, 55, { destaque: true, descricao: "Remoção definitiva dos pelos das axilas, com suavidade e segurança." }],
  ["dp_axilas_virilha_simples", FEM, "Axilas + Virilha Simples", 10, 100, { descricao: "Axilas e virilha simples na mesma sessão." }],
  ["dp_bracos_completos", FEM, "Braços Completos", 10, 110, { descricao: "Remoção definitiva dos pelos dos braços inteiros, com suavidade e segurança." }],
  ["dp_buco", FEM, "Buço", 5, 45, { descricao: "Remoção definitiva dos pelos do buço, com cuidado com a pele do rosto." }],
  ["dp_corpo_todo_fem", FEM, "Corpo Todo - Feminino", 30, 300, { descricao: "Todas as áreas do corpo em uma única sessão." }],
  ["dp_costas", FEM, "Costas", 10, 120, { descricao: "Remoção definitiva dos pelos das costas, com suavidade e segurança." }],
  ["dp_coxas", FEM, "Coxas", 10, 80, { descricao: "Remoção definitiva dos pelos das coxas, com suavidade e segurança." }],
  ["dp_meia_perna", FEM, "Meia Perna", 10, 70, { descricao: "Remoção definitiva dos pelos do joelho ao tornozelo." }],
  ["dp_meio_bracos", FEM, "Meio Braços", 10, 70, { descricao: "Remoção definitiva dos pelos de meio braço, com suavidade e segurança." }],
  ["dp_perna_completa", FEM, "Perna Completa", 10, 140, { destaque: true, descricao: "Remoção definitiva dos pelos das pernas inteiras, coxas e canelas." }],
  ["dp_seios", FEM, "Seios", 10, 80, { descricao: "Remoção definitiva dos pelos da região dos seios, com delicadeza." }],
  ["dp_virilha_completa", FEM, "Virilha Completa", 10, 90, { destaque: true, descricao: "Remoção definitiva dos pelos de toda a virilha, com suavidade e segurança." }],
  ["dp_virilha_completa_fio", FEM, "Virilha Completa com Fio", 10, 110, { descricao: "Virilha completa, incluindo a região do fio." }],
  ["dp_virilha_simples", FEM, "Virilha Simples", 10, 70, { descricao: "Remoção definitiva dos pelos das laterais da virilha." }],

  ["dp_antebracos_masc", MASC, "Antebraços - Masculino", 10, 60, { descricao: "Remoção definitiva dos pelos dos antebraços." }],
  ["dp_axilas_masc", MASC, "Axilas - Masculino", 5, 55, { descricao: "Remoção definitiva dos pelos das axilas." }],
  ["dp_barba_completa", MASC, "Barba Completa", 10, 80, { descricao: "Remoção definitiva dos pelos da barba, com suavidade e segurança." }],
  ["dp_bigode", MASC, "Bigode", 5, 45, { descricao: "Remoção definitiva dos pelos do bigode." }],
  ["dp_bracos_completos_masc", MASC, "Braços Completos - Masculino", 10, 110, { descricao: "Remoção definitiva dos pelos dos braços inteiros." }],
  ["dp_contorno_barba", MASC, "Contorno de Barba", 10, 55, { descricao: "Remoção definitiva dos pelos do contorno da barba e do pescoço." }],
  ["dp_meio_bracos_masc", MASC, "Meio Braços - Masculino", 10, 70, { descricao: "Remoção definitiva dos pelos de meio braço." }],
  ["dp_peitoral", MASC, "Peitoral", 30, 100, { descricao: "Remoção definitiva dos pelos do peitoral." }],
  ["dp_superior_completo", MASC, "Superior Completo - Costas, Abdome e Peitoral", 30, 250, { descricao: "Costas, abdome e peitoral na mesma sessão." }],

  ["dp_axila_barba", COMBO, "Axila + Barba Completa", 10, 110, { descricao: "Axilas e barba completa na mesma sessão, com valor promocional." }],
  ["dp_axila_bigode", COMBO, "Axila + Bigode", 10, 80, { descricao: "Axilas e bigode na mesma sessão, com valor promocional." }],
  ["dp_axila_buco", COMBO, "Axila + Buço", 10, 80, { descricao: "Axilas e buço na mesma sessão, com valor promocional." }],
  ["dp_axila_contorno", COMBO, "Axila + Contorno de Barba", 10, 90, { descricao: "Axilas e contorno de barba na mesma sessão, com valor promocional." }],
  ["dp_axila_virilha", COMBO, "Axila + Virilha Completa", 10, 120, { destaque: true, descricao: "Axilas e virilha completa na mesma sessão, com valor promocional." }],
  ["dp_axila_virilha_fio", COMBO, "Axila + Virilha Completa com Fio", 10, 140, { descricao: "Axilas e virilha completa com fio na mesma sessão, com valor promocional." }],

  // sem categoria no app atual: ficam só no painel até a DepiLED decidir
  ["dp_aureola", null, "Auréola", 5, 20, { online: false, descricao: "Remoção definitiva dos pelos ao redor da auréola." }],
  ["dp_meia_perna_virilha", null, "Meia Perna + Virilha Completa", 25, 160, { online: false, descricao: "Meia perna e virilha completa na mesma sessão." }],
  ["dp_virilha_parceria", null, "Virilha Completa Parceria", 10, 50, { online: false, descricao: "Virilha completa com valor de parceria." }],
];

const servicos: Servico[] = linhas.map(([id, categoriaId, nome, duracaoMin, preco, extra], ordem) => ({
  id,
  categoriaId,
  nome,
  descricao: "",
  duracaoMin,
  intervaloMin: 0,
  preco,
  modoPreco: "fixo",
  online: true,
  ativo: true,
  pausado: false,
  destaque: false,
  ordem,
  retornoDias: null,
  fichaId: null,
  fotoUrl: null,
  ...extra,
}));

// A DepiLED atende UM sábado por mês, das 8h às 14h (informado pelo Pedro,
// 09/10/2026). Nenhum dia fixo na semana: cada data é um "dia avulso" que o
// dono abre no painel (Agenda › Abrir este dia, ou Configurações).
const semDiaFixo: Semana = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
const diasDeAtendimento = [{ data: "2026-10-10", inicio: "08:00", fim: "14:00" }];

const profissionais: Profissional[] = [
  {
    id: "dp_agenda",
    nome: "DepiLED",
    cargo: "Atendimento",
    bio: "",
    cor: 0,
    fotoUrl: null,
    comissaoPct: 0,
    ativo: true,
    ordem: 0,
    servicosIds: servicos.map((s) => s.id),
    horario: semDiaFixo,
    acesso: null,
  },
];

const negocio: Negocio = {
  id: "ab00de9b-81fa-4a2e-a084-948f77eda90e",
  slug: "depiled",
  nome: "DepiLED",
  nicho: "depilacao",
  pele: "beleza",
  tagline: "Remoção definitiva dos pelos, com suavidade e segurança.",
  descricao: "Depilação definitiva feminina e masculina, em sessões rápidas.",
  sobre: "",
  destaques: ["Sessões de 5 a 30 minutos", "Femininos e masculinos", "Combos com valor promocional"],
  tema: {
    marca: "#62513f",
    sobreMarca: "#ffffff",
    fundo: "#f8f5f0",
    superficie: "#ffffff",
    texto: "#2b241d",
    textoSuave: "#76695b",
    acento: "#c8ae8f",
  },
  logoUrl: "/marcas/depiled/simbolo.png",
  logoCompletoUrl: "/marcas/depiled/logo.png",
  capaUrl: null,
  galeria: [],
  contato: { whatsapp: "", instagram: "", telefone: "", email: "" },
  endereco: { cep: "", rua: "", numero: "", complemento: "", bairro: "", cidade: "", uf: "CE", referencia: "" },
  horario: semDiaFixo,
  aberturas: diasDeAtendimento,
  datasEspeciais: [],
  regras: { ...REGRAS_PADRAO, intervaloSlotsMin: 10, janelaMaxDias: 60, escolherProfissional: false, multiplosServicos: true },
  modulos: { ...modulosDoNicho("depilacao"), comissoes: false },
  pix: { chave: "", nome: "", cidade: "" },
  sinal: { percentual: 30, servicosIds: [] },
  metaMensal: 0,
  aviso: { texto: "", ativo: false },
};

export const depiled: Semente = {
  negocio,
  categorias,
  servicos,
  profissionais,
  mensagens: MENSAGENS_PADRAO,
};
