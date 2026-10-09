// =====================================================================
// A ponte com o banco (Supabase), nas duas direções.
//
// Painel: `painel_dados` traz o negócio inteiro no formato do app; cada
// `mudar` do painel vira um LOTE com só o que mudou (`diferenca`), gravado
// por `painel_salvar` — tudo ou nada, como quem está logado (a RLS decide).
//
// Página pública: `pagina_publica` traz só o que o cliente pode ver; as
// vagas e o agendamento são decididos no banco (`vagas_publicas`,
// `agendar`) e o link do cliente fala pelo token.
//
// As telas não sabem de nada disso: continuam lendo o mesmo `Banco`.
// =====================================================================

import type {
  Agendamento,
  Banco,
  Cupom,
  ModeloFicha,
  ModeloMensagem,
  Negocio,
  Servico,
} from "../tipos";
import type { Vaga } from "../disponibilidade";
import { getSupabase, supabaseAnonimo } from "../supabase";
import { MENSAGENS_PADRAO, negocioNovo } from "../padroes";

export const TABELAS = ["categorias", "servicos", "profissionais", "clientes", "bloqueios", "agendamentos"] as const;
export const REGISTROS = [
  "lancamentos",
  "pacotes",
  "pacotesClientes",
  "modelosFicha",
  "fichas",
  "mensagens",
  "registrosMensagem",
  "depoimentos",
  "cupons",
] as const;
type Tabela = (typeof TABELAS)[number];
type ColecaoRegistro = (typeof REGISTROS)[number];

export type Lote = {
  negocio?: Negocio;
  registros?: { salvar: { colecao: ColecaoRegistro; id: string; dados: unknown }[]; remover: { colecao: ColecaoRegistro; id: string }[] };
} & Partial<Record<Tabela, { salvar: unknown[]; remover: string[] }>>;

/** Erro do banco já em português para a tela (as funções do banco escrevem a mensagem). */
export class ErroBanco extends Error {
  constructor(
    mensagem: string,
    readonly codigo: string | null,
  ) {
    super(mensagem);
  }
}

/**
 * O banco ainda não tem as funções da agenda (migration 003 não aplicada):
 * o app segue no modo local, como antes, e passa ao banco sozinho quando
 * elas chegarem — a ordem "publicar código" × "aplicar migration" não importa.
 */
export function bancoSemAgenda(e: unknown): boolean {
  return e instanceof ErroBanco && (e.codigo === "PGRST202" || e.codigo === "42883");
}

function erroDe(e: { message?: string; code?: string } | null): ErroBanco {
  const codigo = e?.code ?? null;
  // P0001 = `raise exception` das funções do banco: a mensagem já foi escrita para gente
  if (codigo === "P0001" && e?.message) return new ErroBanco(e.message, codigo);
  if (codigo === "42501") return new ErroBanco("Sua sessão não tem acesso a isso. Entre de novo.", codigo);
  return new ErroBanco("Não foi possível falar com o servidor agora. Tente de novo.", codigo);
}

async function chamar<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await getSupabase().rpc(fn, args);
  if (error) throw erroDe(error);
  return data as T;
}

// ---------------------------------------------------------------------
// Do banco para o app
// ---------------------------------------------------------------------

type NegocioDoBanco = Partial<Negocio> & Pick<Negocio, "id" | "slug" | "nome" | "nicho">;

/** O negócio do banco por cima do padrão: configuração nova nunca quebra uma tela antiga. */
export function negocioDe(j: NegocioDoBanco): Negocio {
  const base = negocioNovo(j.id, j.slug, j.nome, j.nicho);
  return {
    ...base,
    ...j,
    tema: { ...base.tema, ...j.tema },
    contato: { ...base.contato, ...j.contato },
    endereco: { ...base.endereco, ...j.endereco },
    regras: { ...base.regras, ...j.regras },
    modulos: { ...base.modulos, ...j.modulos },
    pix: { ...base.pix, ...j.pix },
    sinal: { ...base.sinal, ...j.sinal },
    aviso: { ...base.aviso, ...j.aviso },
    horario: j.horario ?? base.horario,
    aberturas: j.aberturas ?? [],
    datasEspeciais: j.datasEspeciais ?? [],
    destaques: j.destaques ?? [],
    galeria: j.galeria ?? [],
  };
}

export function bancoVazio(negocio: Negocio, versao = 0): Banco {
  return {
    versao,
    negocio,
    categorias: [],
    servicos: [],
    profissionais: [],
    bloqueios: [],
    clientes: [],
    agendamentos: [],
    lancamentos: [],
    pacotes: [],
    pacotesClientes: [],
    modelosFicha: [],
    fichas: [],
    mensagens: [],
    registrosMensagem: [],
    depoimentos: [],
    cupons: [],
  };
}

type PaginaDoBanco = { negocio: NegocioDoBanco; temCupom: boolean } & Pick<Banco, "categorias" | "servicos" | "profissionais" | "depoimentos">;

export function bancoDaPagina(j: PaginaDoBanco): Banco {
  return {
    ...bancoVazio(negocioDe(j.negocio)),
    temCupom: j.temCupom,
    categorias: j.categorias,
    servicos: j.servicos,
    profissionais: j.profissionais,
    depoimentos: j.depoimentos,
  };
}

type PainelDoBanco = { negocio: NegocioDoBanco; registros: { colecao: ColecaoRegistro; id: string; dados: unknown }[] } & Pick<
  Banco,
  Tabela
>;

export function bancoDoPainel(j: PainelDoBanco): Banco {
  const b: Banco = { ...bancoVazio(negocioDe(j.negocio)) };
  for (const t of TABELAS) (b[t] as unknown[]) = j[t];
  const porColecao = new Map<ColecaoRegistro, unknown[]>();
  for (const r of j.registros) {
    if (!porColecao.has(r.colecao)) porColecao.set(r.colecao, []);
    porColecao.get(r.colecao)!.push(r.dados);
  }
  for (const c of REGISTROS) (b[c] as unknown[]) = porColecao.get(c) ?? [];
  // modelos de mensagem: os do negócio por cima dos padrões
  const salvas = new Map((b.mensagens as ModeloMensagem[]).map((m) => [m.tipo, m]));
  b.mensagens = MENSAGENS_PADRAO.map((m) => salvas.get(m.tipo) ?? structuredClone(m));
  return b;
}

// ---------------------------------------------------------------------
// Do app para o banco: o lote com só o que mudou
// ---------------------------------------------------------------------

/** Itens que mudaram de referência (as ações são imutáveis) e itens que sumiram. */
function difLista<T>(antes: T[], depois: T[], chave: (x: T) => string) {
  const anteriores = new Map(antes.map((x) => [chave(x), x]));
  const salvar = depois.filter((x) => anteriores.get(chave(x)) !== x);
  const ficaram = new Set(depois.map(chave));
  const remover = antes.filter((x) => !ficaram.has(chave(x))).map(chave);
  return { salvar, remover };
}

const chaveDoRegistro = (colecao: ColecaoRegistro) => (x: unknown) =>
  colecao === "mensagens" ? (x as ModeloMensagem).tipo : (x as { id: string }).id;

export function diferenca(antes: Banco, depois: Banco): Lote | null {
  const lote: Lote = {};
  let algo = false;
  if (antes.negocio !== depois.negocio) {
    lote.negocio = depois.negocio;
    algo = true;
  }
  for (const t of TABELAS) {
    if (antes[t] === depois[t]) continue;
    const d = difLista(antes[t] as { id: string }[], depois[t] as { id: string }[], (x) => x.id);
    if (d.salvar.length || d.remover.length) {
      lote[t] = d;
      algo = true;
    }
  }
  const registros: NonNullable<Lote["registros"]> = { salvar: [], remover: [] };
  for (const c of REGISTROS) {
    if (antes[c] === depois[c]) continue;
    const chave = chaveDoRegistro(c);
    const d = difLista(antes[c] as unknown[], depois[c] as unknown[], chave);
    for (const x of d.salvar) registros.salvar.push({ colecao: c, id: chave(x), dados: x });
    for (const id of d.remover) registros.remover.push({ colecao: c, id });
  }
  if (registros.salvar.length || registros.remover.length) {
    lote.registros = registros;
    algo = true;
  }
  return algo ? lote : null;
}

// ---------------------------------------------------------------------
// Portas
// ---------------------------------------------------------------------

export async function carregarPainel(slug: string): Promise<Banco> {
  return bancoDoPainel(await chamar<PainelDoBanco>("painel_dados", { p_slug: slug }));
}

export async function salvarLote(slug: string, lote: Lote): Promise<void> {
  await chamar("painel_salvar", { p_slug: slug, p_lote: lote });
}

/** No servidor (uma vez por requisição) ou no navegador, sem sessão. */
export async function carregarPagina(slug: string): Promise<Banco | null> {
  const sb = typeof window === "undefined" ? supabaseAnonimo() : getSupabase();
  if (!sb) return null;
  const { data, error } = await sb.rpc("pagina_publica", { p_slug: slug });
  if (error) throw erroDe(error);
  return data ? bancoDaPagina(data as PaginaDoBanco) : null;
}

// a mesma pergunta em poucos segundos (voltar um passo, a vitrine e o
// fluxo pedindo o mesmo serviço) não precisa ir ao banco de novo
const vagasRecentes = new Map<string, { em: number; vagas: Promise<Map<string, Vaga[]>> }>();
const VAGAS_VALEM = 20_000;

/** Depois de agendar, remarcar ou cancelar, as vagas mudaram: pergunta de novo. */
export function esquecerVagas() {
  vagasRecentes.clear();
}

export function vagasDaJanela(
  slug: string,
  servicosIds: string[],
  profissionalId: string | null,
  token?: string,
): Promise<Map<string, Vaga[]>> {
  const chave = JSON.stringify([slug, [...servicosIds].sort(), profissionalId, token ?? null]);
  const recente = vagasRecentes.get(chave);
  if (recente && Date.now() - recente.em < VAGAS_VALEM) return recente.vagas;
  const vagas = chamar<Record<string, Vaga[]>>("vagas_publicas", {
    p_slug: slug,
    p_servicos: servicosIds,
    p_profissional: profissionalId,
    p_token: token ?? null,
  }).then((r) => new Map(Object.entries(r ?? {})));
  vagasRecentes.set(chave, { em: Date.now(), vagas });
  vagas.catch(() => vagasRecentes.delete(chave));
  return vagas;
}

export type PedidoPublico = {
  servicosIds: string[];
  profissionalId: string | null;
  data: string;
  hora: string;
  observacao: string;
  cupom: string | null;
  cliente: { nome: string; telefone: string; email: string; nascimento: string | null };
};

export async function agendarNoBanco(slug: string, pedido: PedidoPublico) {
  return chamar<{ agendamento: Agendamento; cliente: { id: string; nome: string } }>("agendar", {
    p_slug: slug,
    p_pedido: pedido,
  });
}

export type Link = {
  agendamento: Agendamento;
  cliente: { id: string; nome: string };
  servicos: Servico[];
  modelosFicha: ModeloFicha[];
  fichas: Banco["fichas"];
};

export async function abrirLink(slug: string, token: string): Promise<Link | null> {
  return chamar<Link | null>("agendamento_publico", { p_slug: slug, p_token: token });
}

export const acoesDoLink = {
  cancelar: (slug: string, token: string) => chamar<Agendamento>("agendamento_cancelar", { p_slug: slug, p_token: token }),
  confirmar: (slug: string, token: string) => chamar<Agendamento>("agendamento_confirmar", { p_slug: slug, p_token: token }),
  remarcar: (slug: string, token: string, data: string, hora: string) =>
    chamar<Agendamento>("agendamento_remarcar", { p_slug: slug, p_token: token, p_data: data, p_hora: hora }),
  avaliar: (slug: string, token: string, nota: number, texto: string) =>
    chamar<null>("agendamento_avaliar", { p_slug: slug, p_token: token, p_nota: nota, p_texto: texto }),
  ficha: (slug: string, token: string, respostas: Record<string, string | string[]>, assinatura: string) =>
    chamar<null>("ficha_enviar", { p_slug: slug, p_token: token, p_respostas: respostas, p_assinatura: assinatura }),
  cupom: (slug: string, codigo: string) => chamar<Cupom | null>("cupom_publico", { p_slug: slug, p_codigo: codigo }),
};
