// =====================================================================
// DepiLED — o primeiro negócio real (piloto).
//
// Só dados PÚBLICOS: marca, categorias e serviços com preço e duração,
// transcritos do app que a DepiLED usa hoje (08/10/2026). Clientes e
// agendamentos NÃO entram aqui: este arquivo vai para o navegador de
// qualquer visitante. Eles entram pelo banco, protegidos pela RLS.
//
// Marcados "a confirmar" em docs/ESTADO.md: expediente, quem atende,
// WhatsApp/Instagram/endereço e os 3 serviços sem categoria.
// =====================================================================

import type { Categoria, Negocio, Profissional, Servico } from "../tipos";
import { MENSAGENS_PADRAO, REGRAS_PADRAO, modulosDoNicho, semanaComercial } from "../padroes";
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

// mesma ordem e mesmos valores da lista do app atual
const linhas: Linha[] = [
  ["dp_abdome", FEM, "Abdome", 10, 90, { descricao: "Remoção definitiva dos pelos na região abdominal, com suavidade e segurança." }],
  ["dp_antebracos", FEM, "Antebraços", 10, 60],
  ["dp_axilas", FEM, "Axilas", 5, 55, { destaque: true }],
  ["dp_axilas_virilha_simples", FEM, "Axilas + Virilha Simples", 10, 100],
  ["dp_bracos_completos", FEM, "Braços Completos", 10, 110],
  ["dp_buco", FEM, "Buço", 5, 45],
  ["dp_corpo_todo_fem", FEM, "Corpo Todo - Feminino", 30, 300],
  ["dp_costas", FEM, "Costas", 10, 120],
  ["dp_coxas", FEM, "Coxas", 10, 80],
  ["dp_meia_perna", FEM, "Meia Perna", 10, 70],
  ["dp_meio_bracos", FEM, "Meio Braços", 10, 70],
  ["dp_perna_completa", FEM, "Perna Completa", 10, 140, { destaque: true }],
  ["dp_seios", FEM, "Seios", 10, 80],
  ["dp_virilha_completa", FEM, "Virilha Completa", 10, 90, { destaque: true }],
  ["dp_virilha_completa_fio", FEM, "Virilha Completa com Fio", 10, 110],
  ["dp_virilha_simples", FEM, "Virilha Simples", 10, 70],

  ["dp_antebracos_masc", MASC, "Antebraços - Masculino", 10, 60],
  ["dp_axilas_masc", MASC, "Axilas - Masculino", 5, 55],
  ["dp_barba_completa", MASC, "Barba Completa", 10, 80],
  ["dp_bigode", MASC, "Bigode", 5, 45],
  ["dp_bracos_completos_masc", MASC, "Braços Completos - Masculino", 10, 110],
  ["dp_contorno_barba", MASC, "Contorno de Barba", 10, 55],
  ["dp_meio_bracos_masc", MASC, "Meio Braços - Masculino", 10, 70],
  ["dp_peitoral", MASC, "Peitoral", 30, 100],
  ["dp_superior_completo", MASC, "Superior Completo - Costas, Abdome e Peitoral", 30, 250],

  ["dp_axila_barba", COMBO, "Axila + Barba Completa", 10, 110],
  ["dp_axila_bigode", COMBO, "Axila + Bigode", 10, 80],
  ["dp_axila_buco", COMBO, "Axila + Buço", 10, 80],
  ["dp_axila_contorno", COMBO, "Axila + Contorno de Barba", 10, 90],
  ["dp_axila_virilha", COMBO, "Axila + Virilha Completa", 10, 120, { destaque: true }],
  ["dp_axila_virilha_fio", COMBO, "Axila + Virilha Completa com Fio", 10, 140, { descricao: "Duas áreas de depilação com valor promocional." }],

  // sem categoria no app atual: ficam só no painel até a DepiLED decidir
  ["dp_aureola", null, "Auréola", 5, 20, { online: false }],
  ["dp_meia_perna_virilha", null, "Meia Perna + Virilha Completa", 25, 160, { online: false }],
  ["dp_virilha_parceria", null, "Virilha Completa Parceria", 10, 50, { online: false }],
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

// a confirmar com a DepiLED — o app atual não mostra o expediente
const expediente = semanaComercial("08:00", "18:00", null, ["08:00", "13:00"]);

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
    horario: expediente,
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
  horario: expediente,
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
