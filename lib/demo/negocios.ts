// =====================================================================
// Os três negócios da demonstração.
//
// Existem para provar que UM sistema atende nichos diferentes:
//   âmbar   — clínica de depilação, 3 profissionais, laser + cera, anamnese
//             e pacotes de sessões (o primeiro cliente real é deste nicho);
//   navalha — barbearia, 3 barbeiros, pele escura, clube de assinatura;
//   jade    — nail designer MEI, uma pessoa só, sinal via Pix.
//
// Tudo aqui é FICTÍCIO: nomes, telefones, endereços e chaves Pix não são de
// ninguém. Quando o cliente real mandar a base dele, ela entra pelo
// importador do painel, não por este arquivo.
// =====================================================================

import type {
  Categoria,
  Cupom,
  Depoimento,
  ModeloFicha,
  Negocio,
  Pacote,
  Profissional,
  Servico,
} from "../tipos";
import { MENSAGENS_PADRAO, REGRAS_PADRAO, modulosDoNicho, semanaComercial } from "../padroes";

export type Despesa = { categoria: string; descricao: string; valor: number; dia: number; variacao?: number };

export type DefinicaoDemo = {
  negocio: Negocio;
  categorias: Categoria[];
  servicos: Servico[];
  profissionais: Profissional[];
  pacotes: Pacote[];
  modelosFicha: ModeloFicha[];
  depoimentos: Omit<Depoimento, "id" | "data">[];
  cupons: Cupom[];
  despesas: Despesa[];
  vendasAvulsas: { descricao: string; valor: number }[];
  clientes: { quantidade: number; feminino: number };
  /** popularidade relativa de cada serviço (mesma ordem de `servicos`) */
  peso: number[];
  ocupacao: number;
};

function servico(
  id: string,
  categoriaId: string,
  nome: string,
  duracaoMin: number,
  preco: number,
  extra: Partial<Servico> = {},
): Servico {
  return {
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
    ordem: 0,
    retornoDias: null,
    fichaId: null,
    fotoUrl: null,
    ...extra,
  };
}

function ordenar<T extends { ordem: number }>(lista: T[]): T[] {
  return lista.map((x, i) => ({ ...x, ordem: i }));
}

// ---------------------------------------------------------------------
// ÂMBAR — clínica de depilação
// ---------------------------------------------------------------------

const AMBAR_LASER = "ficha_laser";
const AMBAR_CERA = "ficha_cera";

const ambarServicos = ordenar([
  servico("am_l_axila", "am_laser", "Laser · Axilas", 20, 90, {
    descricao: "Sessão de laser de diodo nas axilas. Indolor na maioria das peles.",
    retornoDias: 35,
    fichaId: AMBAR_LASER,
    destaque: true,
    intervaloMin: 10,
  }),
  servico("am_l_virilha", "am_laser", "Laser · Virilha completa", 30, 160, {
    descricao: "Virilha completa com laser de diodo e resfriamento contínuo.",
    retornoDias: 35,
    fichaId: AMBAR_LASER,
    destaque: true,
    intervaloMin: 10,
  }),
  servico("am_l_buco", "am_laser", "Laser · Buço", 15, 70, {
    descricao: "Rápido e preciso. Ideal para quem tem pele sensível à cera.",
    retornoDias: 35,
    fichaId: AMBAR_LASER,
    intervaloMin: 10,
  }),
  servico("am_l_perna", "am_laser", "Laser · Perna inteira", 60, 280, {
    descricao: "Coxas e pernas completas em uma única sessão.",
    retornoDias: 40,
    fichaId: AMBAR_LASER,
    intervaloMin: 10,
  }),
  servico("am_l_rosto", "am_laser", "Laser · Rosto completo", 30, 150, {
    retornoDias: 35,
    fichaId: AMBAR_LASER,
    intervaloMin: 10,
  }),
  servico("am_l_barba", "am_laser", "Laser · Barba (contorno)", 30, 170, {
    descricao: "Acaba com os pelos encravados do pescoço e do contorno.",
    retornoDias: 35,
    fichaId: AMBAR_LASER,
    intervaloMin: 10,
  }),
  servico("am_c_axila", "am_cera", "Cera · Axilas", 15, 35, {
    descricao: "Cera de baixa temperatura, aplicada com espátula descartável.",
    retornoDias: 28,
    fichaId: AMBAR_CERA,
  }),
  servico("am_c_virilha", "am_cera", "Cera · Virilha completa", 30, 70, {
    retornoDias: 28,
    fichaId: AMBAR_CERA,
    destaque: true,
  }),
  servico("am_c_meia", "am_cera", "Cera · Meia perna", 25, 50, { retornoDias: 28, fichaId: AMBAR_CERA }),
  servico("am_c_perna", "am_cera", "Cera · Perna inteira", 40, 80, { retornoDias: 28, fichaId: AMBAR_CERA }),
  servico("am_c_buco", "am_cera", "Cera · Buço", 10, 20, { retornoDias: 21, fichaId: AMBAR_CERA }),
  servico("am_c_costas", "am_cera", "Cera · Costas (masculino)", 30, 70, {
    retornoDias: 30,
    fichaId: AMBAR_CERA,
  }),
  servico("am_s_design", "am_sobrancelha", "Design de sobrancelha", 30, 45, {
    descricao: "Mapeamento do rosto e design na pinça ou linha.",
    retornoDias: 20,
  }),
  servico("am_s_henna", "am_sobrancelha", "Design com henna", 45, 65, { retornoDias: 20 }),
  servico("am_s_linha", "am_sobrancelha", "Buço na linha", 15, 25, { retornoDias: 21 }),
  servico("am_k_verao", "am_combos", "Combo Verão", 60, 140, {
    descricao: "Axilas, virilha completa e meia perna na cera. Economia de R$ 15.",
    retornoDias: 28,
    fichaId: AMBAR_CERA,
    destaque: true,
  }),
]);

const ambar: DefinicaoDemo = {
  negocio: {
    id: "4b1c2f7e-0a6d-4f51-9a3e-0c2f1d7e8a10",
    slug: "ambar",
    nome: "Âmbar Depilação",
    nicho: "depilacao",
    pele: "beleza",
    tagline: "Pele lisa, cuidado de verdade.",
    descricao:
      "Depilação a laser, cera e design de sobrancelha num espaço pensado para você se sentir à vontade do começo ao fim.",
    sobre:
      "Somos uma clínica especializada em depilação. Trabalhamos com laser de diodo de última geração e cera de baixa temperatura, sempre com material descartável e avaliação da pele antes da primeira sessão. Atendimento sem pressa, ambiente climatizado e uma equipe que explica cada passo.",
    destaques: ["Laser de diodo", "Cera de baixa temperatura", "Material descartável", "Avaliação gratuita"],
    tema: {
      marca: "#9a4a2b",
      sobreMarca: "#ffffff",
      fundo: "#f5ede4",
      superficie: "#fffaf4",
      texto: "#2a1b14",
      textoSuave: "#76604f",
      acento: "#d39a5c",
    },
    logoUrl: null,
    capaUrl: null,
    galeria: [],
    contato: {
      whatsapp: "88999990001",
      instagram: "ambar.depilacao",
      telefone: "",
      email: "contato@ambar.exemplo",
    },
    endereco: {
      cep: "63100-000",
      rua: "Rua das Acácias",
      numero: "120",
      complemento: "Sala 3",
      bairro: "Centro",
      cidade: "Crato",
      uf: "CE",
      referencia: "Em frente à praça",
    },
    horario: semanaComercial("08:00", "19:00", ["12:00", "13:00"], ["08:00", "13:00"]),
    datasEspeciais: [],
    regras: { ...REGRAS_PADRAO, confirmacao: "automatica", antecedenciaMinHoras: 1 },
    modulos: { ...modulosDoNicho("depilacao"), anamnese: true, pacotes: true, comissoes: true },
    pix: { chave: "contato@ambar.exemplo", nome: "AMBAR DEPILACAO", cidade: "CRATO" },
    sinal: { percentual: 30, servicosIds: [] },
    metaMensal: 32000,
    aviso: { texto: "Outubro rosa: 15% off no laser de axilas para novas clientes.", ativo: true },
    demo: true,
  },
  categorias: [
    { id: "am_laser", nome: "Depilação a laser", ordem: 0 },
    { id: "am_cera", nome: "Depilação com cera", ordem: 1 },
    { id: "am_sobrancelha", nome: "Sobrancelha e linha", ordem: 2 },
    { id: "am_combos", nome: "Combos", ordem: 3 },
  ],
  servicos: ambarServicos,
  profissionais: [
    {
      id: "am_p_larissa",
      nome: "Larissa Andrade",
      cargo: "Biomédica esteta",
      bio: "Responsável técnica pelo laser. 8 anos de experiência em depilação definitiva.",
      cor: 0,
      fotoUrl: null,
      comissaoPct: 40,
      ativo: true,
      ordem: 0,
      servicosIds: ambarServicos.filter((s) => s.categoriaId !== "am_sobrancelha").map((s) => s.id),
      horario: semanaComercial("08:00", "18:00", ["12:00", "13:00"], ["08:00", "13:00"]),
      acesso: { email: "larissa@ambar.exemplo", papel: "owner" },
    },
    {
      id: "am_p_camila",
      nome: "Camila Rocha",
      cargo: "Depiladora",
      bio: "Especialista em cera. Mão leve e atendimento rápido.",
      cor: 1,
      fotoUrl: null,
      comissaoPct: 35,
      ativo: true,
      ordem: 1,
      servicosIds: ambarServicos
        .filter((s) => s.categoriaId === "am_cera" || s.categoriaId === "am_combos" || s.id === "am_s_linha")
        .map((s) => s.id),
      horario: semanaComercial("09:00", "19:00", ["13:00", "14:00"], ["08:00", "13:00"]),
      acesso: { email: "camila@ambar.exemplo", papel: "professional" },
    },
    {
      id: "am_p_bruna",
      nome: "Bruna Teles",
      cargo: "Designer de sobrancelhas",
      bio: "Visagismo e design de sobrancelhas que respeitam o seu rosto.",
      cor: 2,
      fotoUrl: null,
      comissaoPct: 40,
      ativo: true,
      ordem: 2,
      servicosIds: ambarServicos
        .filter((s) => s.categoriaId === "am_sobrancelha" || s.id === "am_c_buco")
        .map((s) => s.id),
      horario: {
        0: [],
        1: [],
        2: [{ inicio: "10:00", fim: "19:00" }],
        3: [{ inicio: "10:00", fim: "19:00" }],
        4: [{ inicio: "10:00", fim: "19:00" }],
        5: [{ inicio: "10:00", fim: "19:00" }],
        6: [{ inicio: "08:00", fim: "13:00" }],
      },
      acesso: null,
    },
  ],
  pacotes: [
    { id: "am_pk_axila", nome: "Laser axilas · 10 sessões", servicoId: "am_l_axila", sessoes: 10, preco: 690, validadeDias: 540, ativo: true },
    { id: "am_pk_virilha", nome: "Laser virilha · 10 sessões", servicoId: "am_l_virilha", sessoes: 10, preco: 1290, validadeDias: 540, ativo: true },
    { id: "am_pk_buco", nome: "Laser buço · 8 sessões", servicoId: "am_l_buco", sessoes: 8, preco: 420, validadeDias: 420, ativo: true },
  ],
  modelosFicha: [
    {
      id: AMBAR_LASER,
      nome: "Anamnese · depilação a laser",
      descricao: "Preenchida antes da primeira sessão de laser. Revisar a cada 6 meses.",
      ativo: true,
      campos: [
        { id: "fototipo", rotulo: "Como sua pele reage ao sol?", tipo: "escolha", opcoes: ["Sempre queima, nunca bronzeia", "Queima fácil, bronzeia pouco", "Às vezes queima, bronzeia bem", "Raramente queima, bronzeia fácil", "Quase nunca queima", "Nunca queima (pele negra)"], obrigatorio: true, ajuda: "Usado para ajustar a energia do laser.", alerta: null },
        { id: "gestante", rotulo: "Está grávida ou amamentando?", tipo: "simNao", opcoes: [], obrigatorio: true, ajuda: "", alerta: "Sim" },
        { id: "sol", rotulo: "Tomou sol ou fez bronzeamento nos últimos 15 dias?", tipo: "simNao", opcoes: [], obrigatorio: true, ajuda: "", alerta: "Sim" },
        { id: "medicamentos", rotulo: "Usa algum medicamento contínuo?", tipo: "texto", opcoes: [], obrigatorio: false, ajuda: "Antibióticos, isotretinoína, anticoagulantes, hormônios…", alerta: null },
        { id: "acidos", rotulo: "Usa ácidos ou retinoides na pele?", tipo: "simNao", opcoes: [], obrigatorio: true, ajuda: "", alerta: "Sim" },
        { id: "condicoes", rotulo: "Tem alguma destas condições?", tipo: "multipla", opcoes: ["Diabetes", "Epilepsia", "Queloide", "Vitiligo", "Herpes recorrente", "Nenhuma"], obrigatorio: true, ajuda: "", alerta: "Queloide" },
        { id: "alergias", rotulo: "Alergias", tipo: "textoLongo", opcoes: [], obrigatorio: false, ajuda: "", alerta: null },
        { id: "fotos", rotulo: "Autoriza fotos de antes e depois para acompanhar a evolução?", tipo: "simNao", opcoes: [], obrigatorio: true, ajuda: "As fotos ficam só no seu prontuário.", alerta: null },
      ],
    },
    {
      id: AMBAR_CERA,
      nome: "Anamnese · depilação com cera",
      descricao: "Perguntas rápidas antes da primeira depilação com cera.",
      ativo: true,
      campos: [
        { id: "pele", rotulo: "Sua pele é sensível?", tipo: "escolha", opcoes: ["Normal", "Sensível", "Muito sensível"], obrigatorio: true, ajuda: "", alerta: null },
        { id: "varizes", rotulo: "Tem varizes na região?", tipo: "simNao", opcoes: [], obrigatorio: true, ajuda: "", alerta: "Sim" },
        { id: "acidos", rotulo: "Usa ácidos ou isotretinoína?", tipo: "simNao", opcoes: [], obrigatorio: true, ajuda: "Contraindicado para cera.", alerta: "Sim" },
        { id: "alergias", rotulo: "Alergias", tipo: "texto", opcoes: [], obrigatorio: false, ajuda: "", alerta: null },
      ],
    },
  ],
  depoimentos: [
    { nome: "Mariana C.", texto: "Fiz o pacote de laser de axilas e na quarta sessão já quase não tinha pelo. A Larissa explica tudo com muita calma.", nota: 5, servico: "Laser · Axilas", visivel: true },
    { nome: "Patrícia L.", texto: "Melhor cera da cidade. Rápida, limpa e sem aquela vermelhidão que eu sempre tinha.", nota: 5, servico: "Cera · Virilha completa", visivel: true },
    { nome: "Juliana R.", texto: "Marquei pelo link às 23h e recebi a confirmação na hora. Ambiente lindo e cheiroso.", nota: 5, servico: "Combo Verão", visivel: true },
    { nome: "Renata S.", texto: "A Bruna acertou o formato da minha sobrancelha de primeira. Virei cliente.", nota: 5, servico: "Design com henna", visivel: true },
    { nome: "Fernanda M.", texto: "Atendimento pontual e muito cuidadoso. Só achei o estacionamento difícil.", nota: 4, servico: "Laser · Virilha completa", visivel: true },
  ],
  cupons: [
    { id: "am_cp_1", codigo: "PRIMEIRA10", tipo: "percentual", valor: 10, ativo: true, validoAte: null, usos: 23 },
    { id: "am_cp_2", codigo: "ROSA15", tipo: "percentual", valor: 15, ativo: true, validoAte: null, usos: 8 },
  ],
  despesas: [
    { categoria: "Aluguel", descricao: "Aluguel da sala", valor: 2400, dia: 5 },
    { categoria: "Energia", descricao: "Conta de energia", valor: 610, dia: 12, variacao: 0.2 },
    { categoria: "Água e internet", descricao: "Internet fibra", valor: 120, dia: 10 },
    { categoria: "Insumos", descricao: "Cera, lençol descartável e cosméticos", valor: 1350, dia: 8, variacao: 0.3 },
    { categoria: "Equipamento", descricao: "Parcela do laser de diodo", valor: 2900, dia: 20 },
    { categoria: "Marketing", descricao: "Anúncios no Instagram", valor: 450, dia: 15, variacao: 0.25 },
    { categoria: "Contabilidade", descricao: "Contador", valor: 380, dia: 7 },
  ],
  vendasAvulsas: [
    { descricao: "Venda · loção pós-depilação", valor: 59 },
    { descricao: "Venda · esfoliante corporal", valor: 45 },
  ],
  clientes: { quantidade: 320, feminino: 0.88 },
  peso: [10, 7, 5, 3, 2, 2, 8, 9, 5, 4, 6, 2, 7, 4, 3, 5],
  ocupacao: 0.6,
};

// ---------------------------------------------------------------------
// NAVALHA — barbearia
// ---------------------------------------------------------------------

const navalhaServicos = ordenar([
  servico("nv_corte", "nv_cabelo", "Corte", 40, 45, { descricao: "Tesoura e máquina, lavagem e finalização.", retornoDias: 21, destaque: true }),
  servico("nv_maquina", "nv_cabelo", "Corte na máquina", 25, 35, { retornoDias: 21 }),
  servico("nv_degrade", "nv_cabelo", "Degradê navalhado", 45, 50, { descricao: "Fade com acabamento na navalha.", retornoDias: 18, destaque: true }),
  servico("nv_infantil", "nv_cabelo", "Corte infantil", 30, 35, { descricao: "Até 10 anos, com muita paciência.", retornoDias: 30 }),
  servico("nv_barba", "nv_barba", "Barba", 30, 35, { retornoDias: 14 }),
  servico("nv_toalha", "nv_barba", "Barba com toalha quente", 40, 45, { descricao: "Toalha quente, óleo e navalha. O ritual completo.", retornoDias: 14 }),
  servico("nv_pigmento", "nv_barba", "Pigmentação de barba", 30, 40),
  servico("nv_combo", "nv_combos", "Corte + barba", 70, 75, { descricao: "O mais pedido da casa. Economia de R$ 5.", retornoDias: 21, destaque: true }),
  servico("nv_combo_full", "nv_combos", "Corte + barba + sobrancelha", 80, 85, { retornoDias: 21 }),
  servico("nv_sobrancelha", "nv_extras", "Sobrancelha na navalha", 10, 15),
  servico("nv_hidrata", "nv_extras", "Hidratação capilar", 20, 30),
  servico("nv_relax", "nv_extras", "Relaxamento", 40, 60, { modoPreco: "a_partir_de" }),
]);

const todosNavalha = navalhaServicos.map((s) => s.id);

const navalha: DefinicaoDemo = {
  negocio: {
    id: "8e3d5a90-7b21-4c6e-b1f4-2a9c6d0e3b55",
    slug: "navalha",
    nome: "Navalha Barbearia",
    nicho: "barbearia",
    pele: "barbearia",
    tagline: "Corte afiado. Conversa boa. Sem fila.",
    descricao: "Barbearia clássica com atendimento hora marcada, cerveja gelada e o melhor degradê da região.",
    sobre:
      "A Navalha nasceu em 2019 de três amigos que cansaram de esperar duas horas por um corte. Aqui é hora marcada de verdade: chegou, sentou, cortou. Trabalhamos com toalha quente, navalha descartável e produtos próprios.",
    destaques: ["Hora marcada de verdade", "Navalha descartável", "Cerveja e café por conta", "Wi-Fi e sinuca"],
    tema: {
      marca: "#d4a24c",
      sobreMarca: "#15130f",
      fundo: "#121110",
      superficie: "#1d1b18",
      texto: "#efe8dc",
      textoSuave: "#a89e8f",
      acento: "#b8442f",
    },
    logoUrl: null,
    capaUrl: null,
    galeria: [],
    contato: { whatsapp: "88999990002", instagram: "navalha.barbearia", telefone: "", email: "" },
    endereco: {
      cep: "63010-000",
      rua: "Avenida Padre Cícero",
      numero: "880",
      complemento: "",
      bairro: "São Miguel",
      cidade: "Juazeiro do Norte",
      uf: "CE",
      referencia: "Ao lado da farmácia",
    },
    horario: {
      0: [],
      1: [],
      2: [{ inicio: "09:00", fim: "20:00" }],
      3: [{ inicio: "09:00", fim: "20:00" }],
      4: [{ inicio: "09:00", fim: "20:00" }],
      5: [{ inicio: "09:00", fim: "20:00" }],
      6: [{ inicio: "08:00", fim: "18:00" }],
    },
    datasEspeciais: [],
    regras: { ...REGRAS_PADRAO, intervaloSlotsMin: 15, antecedenciaMinHoras: 1, janelaMaxDias: 30 },
    modulos: modulosDoNicho("barbearia"),
    pix: { chave: "navalha@exemplo.com", nome: "NAVALHA BARBEARIA", cidade: "JUAZEIRO DO NORTE" },
    sinal: { percentual: 30, servicosIds: [] },
    metaMensal: 26000,
    aviso: { texto: "Clube Navalha: 4 cortes por mês por R$ 140. Pergunte na recepção.", ativo: true },
    demo: true,
  },
  categorias: [
    { id: "nv_cabelo", nome: "Cabelo", ordem: 0 },
    { id: "nv_barba", nome: "Barba", ordem: 1 },
    { id: "nv_combos", nome: "Combos", ordem: 2 },
    { id: "nv_extras", nome: "Extras", ordem: 3 },
  ],
  servicos: navalhaServicos,
  profissionais: [
    {
      id: "nv_p_rafa",
      nome: "Rafael Nunes",
      cargo: "Barbeiro e sócio",
      bio: "Especialista em degradê e barba clássica.",
      cor: 0,
      fotoUrl: null,
      comissaoPct: 0,
      ativo: true,
      ordem: 0,
      servicosIds: todosNavalha,
      horario: {
        0: [],
        1: [],
        2: [{ inicio: "09:00", fim: "12:00" }, { inicio: "13:00", fim: "20:00" }],
        3: [{ inicio: "09:00", fim: "12:00" }, { inicio: "13:00", fim: "20:00" }],
        4: [{ inicio: "09:00", fim: "12:00" }, { inicio: "13:00", fim: "20:00" }],
        5: [{ inicio: "09:00", fim: "12:00" }, { inicio: "13:00", fim: "20:00" }],
        6: [{ inicio: "08:00", fim: "18:00" }],
      },
      acesso: { email: "rafa@navalha.exemplo", papel: "owner" },
    },
    {
      id: "nv_p_diego",
      nome: "Diego Martins",
      cargo: "Barbeiro",
      bio: "Cortes clássicos e infantis.",
      cor: 1,
      fotoUrl: null,
      comissaoPct: 50,
      ativo: true,
      ordem: 1,
      servicosIds: todosNavalha.filter((id) => id !== "nv_pigmento"),
      horario: {
        0: [],
        1: [],
        2: [{ inicio: "10:00", fim: "14:00" }, { inicio: "15:00", fim: "20:00" }],
        3: [{ inicio: "10:00", fim: "14:00" }, { inicio: "15:00", fim: "20:00" }],
        4: [{ inicio: "10:00", fim: "14:00" }, { inicio: "15:00", fim: "20:00" }],
        5: [{ inicio: "10:00", fim: "14:00" }, { inicio: "15:00", fim: "20:00" }],
        6: [{ inicio: "08:00", fim: "18:00" }],
      },
      acesso: { email: "diego@navalha.exemplo", papel: "professional" },
    },
    {
      id: "nv_p_thiago",
      nome: "Thiago Lopes",
      cargo: "Barbeiro",
      bio: "Barba, pigmentação e desenhos.",
      cor: 2,
      fotoUrl: null,
      comissaoPct: 50,
      ativo: true,
      ordem: 2,
      servicosIds: todosNavalha.filter((id) => id !== "nv_infantil"),
      horario: {
        0: [],
        1: [],
        2: [],
        3: [{ inicio: "09:00", fim: "13:00" }, { inicio: "14:00", fim: "20:00" }],
        4: [{ inicio: "09:00", fim: "13:00" }, { inicio: "14:00", fim: "20:00" }],
        5: [{ inicio: "09:00", fim: "13:00" }, { inicio: "14:00", fim: "20:00" }],
        6: [{ inicio: "08:00", fim: "18:00" }],
      },
      acesso: null,
    },
  ],
  pacotes: [
    { id: "nv_pk_clube", nome: "Clube Navalha · 4 cortes", servicoId: "nv_corte", sessoes: 4, preco: 140, validadeDias: 30, ativo: true },
    { id: "nv_pk_barba", nome: "Clube Barba · 4 barbas", servicoId: "nv_barba", sessoes: 4, preco: 110, validadeDias: 30, ativo: true },
  ],
  modelosFicha: [],
  depoimentos: [
    { nome: "Lucas A.", texto: "Hora marcada de verdade. Cheguei 14h, 14h02 tava sentado na cadeira.", nota: 5, servico: "Corte", visivel: true },
    { nome: "Pedro H.", texto: "O degradê do Rafa é outro nível. E a cerveja gelada ajuda.", nota: 5, servico: "Degradê navalhado", visivel: true },
    { nome: "Marcos V.", texto: "Levei meu filho de 4 anos e o Diego teve uma paciência absurda.", nota: 5, servico: "Corte infantil", visivel: true },
    { nome: "André S.", texto: "Toalha quente e navalha. Saí outro homem.", nota: 5, servico: "Barba com toalha quente", visivel: true },
  ],
  cupons: [{ id: "nv_cp_1", codigo: "AMIGO15", tipo: "valor", valor: 15, ativo: true, validoAte: null, usos: 41 }],
  despesas: [
    { categoria: "Aluguel", descricao: "Aluguel do ponto", valor: 1800, dia: 5 },
    { categoria: "Energia", descricao: "Conta de energia", valor: 480, dia: 12, variacao: 0.2 },
    { categoria: "Insumos", descricao: "Lâminas, toalhas e produtos", valor: 720, dia: 9, variacao: 0.25 },
    { categoria: "Bar", descricao: "Cerveja e café para clientes", valor: 390, dia: 18, variacao: 0.3 },
    { categoria: "Marketing", descricao: "Impulsionamento Instagram", valor: 250, dia: 15 },
    { categoria: "Contabilidade", descricao: "Contador", valor: 300, dia: 7 },
  ],
  vendasAvulsas: [
    { descricao: "Venda · pomada modeladora", valor: 45 },
    { descricao: "Venda · óleo para barba", valor: 39 },
  ],
  clientes: { quantidade: 260, feminino: 0.04 },
  peso: [10, 4, 8, 3, 6, 3, 1, 9, 3, 2, 2, 1],
  ocupacao: 0.66,
};

// ---------------------------------------------------------------------
// JADE — nail designer MEI (uma profissional)
// ---------------------------------------------------------------------

const jadeServicos = ordenar([
  servico("jd_mani", "jd_maos", "Manicure", 45, 35, { retornoDias: 10 }),
  servico("jd_gel", "jd_maos", "Esmaltação em gel", 60, 70, { descricao: "Dura até 3 semanas sem descascar.", retornoDias: 21, destaque: true }),
  servico("jd_blind", "jd_maos", "Blindagem", 60, 80, { retornoDias: 21 }),
  servico("jd_pedi", "jd_pes", "Pedicure", 50, 40, { retornoDias: 15 }),
  servico("jd_maoepe", "jd_pes", "Mão e pé", 90, 70, { destaque: true, retornoDias: 12 }),
  servico("jd_spa", "jd_pes", "Spa dos pés", 40, 55),
  servico("jd_fibra", "jd_along", "Alongamento em fibra", 150, 160, { descricao: "Fibra de vidro, formato à sua escolha.", retornoDias: 21, destaque: true }),
  servico("jd_manut", "jd_along", "Manutenção do alongamento", 90, 110, { retornoDias: 21 }),
]);

const jade: DefinicaoDemo = {
  negocio: {
    id: "c7a9e2d1-5f3b-4a8c-9d6e-1b2f3a4c5d66",
    slug: "jade",
    nome: "Jade Nails",
    nicho: "unhas",
    pele: "delicada",
    tagline: "Unhas impecáveis, no seu tempo.",
    descricao: "Estúdio de unhas com atendimento individual. Gel, fibra e cuidados para mãos e pés.",
    sobre:
      "Sou a Jade, nail designer há 6 anos. Atendo uma cliente por vez no meu estúdio, com material esterilizado em autoclave e muito capricho em cada detalhe.",
    destaques: ["Atendimento individual", "Material em autoclave", "Mais de 200 cores"],
    tema: {
      marca: "#2f6b58",
      sobreMarca: "#ffffff",
      fundo: "#fbf6f2",
      superficie: "#ffffff",
      texto: "#22302a",
      textoSuave: "#66766f",
      acento: "#e3a49e",
    },
    logoUrl: null,
    capaUrl: null,
    galeria: [],
    contato: { whatsapp: "88999990003", instagram: "jade.nails", telefone: "", email: "" },
    endereco: {
      cep: "63100-000",
      rua: "Rua Monsenhor Esmeraldo",
      numero: "45",
      complemento: "Casa B",
      bairro: "Pimenta",
      cidade: "Crato",
      uf: "CE",
      referencia: "",
    },
    horario: semanaComercial("09:00", "18:00", ["12:00", "13:00"], ["09:00", "14:00"]),
    datasEspeciais: [],
    regras: { ...REGRAS_PADRAO, intervaloSlotsMin: 30, antecedenciaMinHoras: 3, escolherProfissional: false, confirmacao: "manual" },
    modulos: modulosDoNicho("unhas"),
    pix: { chave: "jade.nails@exemplo.com", nome: "JADE NAILS", cidade: "CRATO" },
    sinal: { percentual: 30, servicosIds: ["jd_fibra", "jd_manut"] },
    metaMensal: 7000,
    aviso: { texto: "", ativo: false },
    demo: true,
  },
  categorias: [
    { id: "jd_maos", nome: "Mãos", ordem: 0 },
    { id: "jd_pes", nome: "Pés", ordem: 1 },
    { id: "jd_along", nome: "Alongamento", ordem: 2 },
  ],
  servicos: jadeServicos,
  profissionais: [
    {
      id: "jd_p_jade",
      nome: "Jade Moreira",
      cargo: "Nail designer",
      bio: "",
      cor: 2,
      fotoUrl: null,
      comissaoPct: 0,
      ativo: true,
      ordem: 0,
      servicosIds: jadeServicos.map((s) => s.id),
      horario: semanaComercial("09:00", "18:00", ["12:00", "13:00"], ["09:00", "14:00"]),
      acesso: { email: "jade@exemplo.com", papel: "owner" },
    },
  ],
  pacotes: [],
  modelosFicha: [],
  depoimentos: [
    { nome: "Carla D.", texto: "O gel durou 3 semanas inteirinho. A Jade é caprichosa demais.", nota: 5, servico: "Esmaltação em gel", visivel: true },
    { nome: "Bia F.", texto: "Amo poder marcar pelo celular sem ficar mandando mensagem.", nota: 5, servico: "Mão e pé", visivel: true },
    { nome: "Sofia N.", texto: "Alongamento perfeito, natural e resistente.", nota: 5, servico: "Alongamento em fibra", visivel: true },
  ],
  cupons: [{ id: "jd_cp_1", codigo: "JADE10", tipo: "percentual", valor: 10, ativo: false, validoAte: null, usos: 12 }],
  despesas: [
    { categoria: "Impostos", descricao: "DAS MEI", valor: 76, dia: 20 },
    { categoria: "Insumos", descricao: "Esmaltes, géis e lixas", valor: 520, dia: 6, variacao: 0.3 },
    { categoria: "Energia", descricao: "Energia do estúdio", valor: 140, dia: 12, variacao: 0.15 },
    { categoria: "Marketing", descricao: "Impulsionamento", valor: 100, dia: 15 },
  ],
  vendasAvulsas: [{ descricao: "Venda · óleo de cutícula", valor: 25 }],
  clientes: { quantidade: 110, feminino: 0.97 },
  peso: [5, 9, 4, 4, 8, 2, 4, 7],
  ocupacao: 0.5,
};

export const DEMOS: Record<string, DefinicaoDemo> = { ambar, navalha, jade };

export const SLUGS_DEMO = Object.keys(DEMOS);

export function demoDe(slug: string): DefinicaoDemo | null {
  return DEMOS[slug] ?? null;
}

export { MENSAGENS_PADRAO };
