// =====================================================================
// O vocabulário da Livo Agenda.
//
// Estes tipos são o contrato entre as telas e a camada de dados. Hoje a
// camada de dados é local (lib/dados, no navegador); na fase de backend
// ela passa a ser o Supabase, e as telas não mudam. Por isso os nomes aqui
// já seguem o modelo do docs/PLANEJAMENTO.md (seção 4).
//
// Datas e horas são "hora de parede" do negócio, sem fuso no texto:
//   data  "2026-10-08"
//   hora  "14:30"
//   inst. "2026-10-08T14:30"
// O fuso do negócio mora em `regras.fuso`; quem converte é o banco.
// =====================================================================

export type Nicho =
  | "depilacao"
  | "barbearia"
  | "unhas"
  | "salao"
  | "estetica"
  | "sobrancelha"
  | "saude"
  | "outro";

/** A "pele" da página pública. Um motor, várias peles (padrão do livo). */
export type Pele = "beleza" | "barbearia" | "delicada" | "generica";

/** Funções que fazem sentido para uns negócios e não para outros. */
export type Modulo =
  | "anamnese"
  | "pacotes"
  | "comissoes"
  | "financeiro"
  | "sinal"
  | "retorno"
  | "avaliacoes"
  | "aniversarios";

export type Papel = "owner" | "admin" | "reception" | "professional";

export type Tema = {
  /** cor da marca: botões, destaques, links */
  marca: string;
  /** texto por cima da cor da marca */
  sobreMarca: string;
  /** fundo da página pública */
  fundo: string;
  /** cartões e folhas */
  superficie: string;
  texto: string;
  textoSuave: string;
  /** segunda cor, usada com parcimônia */
  acento: string;
};

export type Intervalo = { inicio: string; fim: string };

/** 0 = domingo … 6 = sábado. Dia sem intervalo = fechado. */
export type Semana = Record<number, Intervalo[]>;

export type Endereco = {
  cep: string;
  rua: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
  referencia: string;
};

export type RegrasAgendamento = {
  intervaloSlotsMin: number;
  antecedenciaMinHoras: number;
  janelaMaxDias: number;
  confirmacao: "automatica" | "manual";
  cancelamentoAteHoras: number;
  fuso: string;
  escolherProfissional: boolean;
  multiplosServicos: boolean;
};

export type Negocio = {
  id: string;
  slug: string;
  nome: string;
  nicho: Nicho;
  pele: Pele;
  tagline: string;
  descricao: string;
  sobre: string;
  destaques: string[];
  tema: Tema;
  /** símbolo compacto: topo da página, painel, ícone */
  logoUrl: string | null;
  /** logo com o nome, no começo da página */
  logoCompletoUrl: string | null;
  capaUrl: string | null;
  galeria: string[];
  contato: { whatsapp: string; instagram: string; telefone: string; email: string };
  endereco: Endereco;
  horario: Semana;
  /** dias avulsos de atendimento: abre SÓ nessa data, nesse horário, para toda a equipe
   *  (negócio que atende um sábado por mês). Passa na frente do horário da semana. */
  aberturas: { data: string; inicio: string; fim: string }[];
  /** dias fechados (feriado, férias): ninguém marca, nem em dia avulso */
  datasEspeciais: { data: string; rotulo: string }[];
  regras: RegrasAgendamento;
  modulos: Record<Modulo, boolean>;
  pix: { chave: string; nome: string; cidade: string };
  sinal: { percentual: number; servicosIds: string[] };
  metaMensal: number;
  aviso: { texto: string; ativo: boolean };
  /** o enfeite do canto do topo (celular): o desenho do estilo da página ou nenhum */
  enfeiteTopo: EnfeiteTopo;
};

export type EnfeiteTopo = "desenho" | "nenhum";

export type Categoria = {
  id: string;
  nome: string;
  /** uma linha no cartão da categoria, na hora de agendar */
  descricao: string;
  ordem: number;
  /** some da página sem apagar nada (os serviços dela também somem) */
  pausada: boolean;
};

export type ModoPreco = "fixo" | "a_partir_de" | "oculto";

export type Servico = {
  id: string;
  categoriaId: string | null;
  nome: string;
  descricao: string;
  duracaoMin: number;
  /** limpeza/preparo depois do atendimento — ocupa a agenda, não aparece ao cliente */
  intervaloMin: number;
  preco: number;
  modoPreco: ModoPreco;
  online: boolean;
  ativo: boolean;
  pausado: boolean;
  destaque: boolean;
  ordem: number;
  /** módulo retorno: em quantos dias o cliente costuma voltar */
  retornoDias: number | null;
  /** módulo anamnese: ficha pedida antes do primeiro atendimento */
  fichaId: string | null;
  fotoUrl: string | null;
};

export type Profissional = {
  id: string;
  nome: string;
  cargo: string;
  bio: string;
  /** índice da paleta categórica (identidade na agenda e nos gráficos) */
  cor: number;
  fotoUrl: string | null;
  comissaoPct: number;
  ativo: boolean;
  ordem: number;
  servicosIds: string[];
  horario: Semana;
  acesso: { email: string; papel: Papel } | null;
};

export type Bloqueio = {
  id: string;
  /** null = o negócio inteiro */
  profissionalId: string | null;
  inicio: string;
  fim: string;
  motivo: string;
};

export type Cliente = {
  id: string;
  nome: string;
  telefone: string;
  email: string;
  nascimento: string | null;
  observacoes: string;
  tags: string[];
  origem: "online" | "painel" | "importado";
  criadoEm: string;
  consentimentoWhats: boolean;
};

export type StatusAgendamento = "pendente" | "confirmado" | "concluido" | "cancelado" | "faltou";

export type Canal = "online" | "painel" | "whatsapp";

export type FormaPagamento = "pix" | "dinheiro" | "debito" | "credito" | "pacote";

export type ItemAgendamento = {
  servicoId: string;
  nome: string;
  preco: number;
  duracaoMin: number;
};

export type Agendamento = {
  id: string;
  /** link de gestão do cliente: /<negocio>/a/<token> */
  token: string;
  clienteId: string;
  profissionalId: string;
  inicio: string;
  fim: string;
  /** limpeza depois do fim — ocupa a agenda */
  intervaloMin: number;
  status: StatusAgendamento;
  canal: Canal;
  itens: ItemAgendamento[];
  total: number;
  desconto: number;
  observacao: string;
  criadoEm: string;
  confirmadoEm: string | null;
  lembreteEm: string | null;
  canceladoPor: "cliente" | "negocio" | null;
  motivoCancelamento: string;
  pagamento: { forma: FormaPagamento; valor: number; pagoEm: string } | null;
  sinal: { valor: number; pago: boolean } | null;
  pacoteClienteId: string | null;
  cupom: string | null;
};

export type Lancamento = {
  id: string;
  tipo: "receita" | "despesa";
  categoria: string;
  descricao: string;
  valor: number;
  data: string;
  pago: boolean;
  recorrente: boolean;
};

export type Pacote = {
  id: string;
  nome: string;
  servicoId: string;
  sessoes: number;
  preco: number;
  validadeDias: number;
  ativo: boolean;
};

export type PacoteCliente = {
  id: string;
  pacoteId: string;
  clienteId: string;
  compradoEm: string;
  sessoesUsadas: number;
  validoAte: string;
};

export type TipoCampoFicha =
  | "texto"
  | "textoLongo"
  | "simNao"
  | "escolha"
  | "multipla"
  | "data";

export type CampoFicha = {
  id: string;
  rotulo: string;
  tipo: TipoCampoFicha;
  opcoes: string[];
  obrigatorio: boolean;
  ajuda: string;
  /** resposta que merece atenção do profissional (ex.: "Sim" em gestante) */
  alerta: string | null;
};

export type ModeloFicha = {
  id: string;
  nome: string;
  descricao: string;
  campos: CampoFicha[];
  ativo: boolean;
};

export type Ficha = {
  id: string;
  modeloId: string;
  clienteId: string;
  agendamentoId: string | null;
  respostas: Record<string, string | string[]>;
  preenchidaEm: string;
  assinatura: string;
};

export type TipoMensagem =
  | "confirmacao"
  | "lembrete"
  | "aniversario"
  | "pos_atendimento"
  | "retorno"
  | "cancelamento";

export type ModeloMensagem = { tipo: TipoMensagem; titulo: string; texto: string; ativo: boolean };

export type RegistroMensagem = {
  id: string;
  tipo: TipoMensagem;
  clienteId: string;
  agendamentoId: string | null;
  enviadaEm: string;
};

export type Depoimento = {
  id: string;
  nome: string;
  texto: string;
  nota: number;
  data: string;
  servico: string;
  visivel: boolean;
};

export type Cupom = {
  id: string;
  codigo: string;
  tipo: "percentual" | "valor";
  valor: number;
  ativo: boolean;
  validoAte: string | null;
  usos: number;
};

/** Tudo de um negócio, no formato das telas. Vem do banco (Supabase) ou, sem ele, do navegador. */
export type Banco = {
  versao: number;
  /** página pública: há cupom valendo (os códigos não vêm — o banco confere o digitado) */
  temCupom?: boolean;
  negocio: Negocio;
  categorias: Categoria[];
  servicos: Servico[];
  profissionais: Profissional[];
  bloqueios: Bloqueio[];
  clientes: Cliente[];
  agendamentos: Agendamento[];
  lancamentos: Lancamento[];
  pacotes: Pacote[];
  pacotesClientes: PacoteCliente[];
  modelosFicha: ModeloFicha[];
  fichas: Ficha[];
  mensagens: ModeloMensagem[];
  registrosMensagem: RegistroMensagem[];
  depoimentos: Depoimento[];
  cupons: Cupom[];
};

/** O que a página pública recebe do servidor antes de qualquer JavaScript. */
export type NegocioPublico = Pick<
  Negocio,
  "id" | "slug" | "nome" | "nicho" | "pele" | "tagline" | "descricao" | "tema"
>;
