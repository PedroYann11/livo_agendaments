"use client";

// =====================================================================
// A loja de dados das telas: `useLoja()` / `useBanco()`.
//
// Três jeitos de guardar, uma interface só:
//
//   painel  (com Supabase) — o banco é a fonte. Abre com `painel_dados`;
//           cada `mudar` aparece na hora na tela e vai ao banco como um
//           lote (`painel_salvar`). Se o banco recusar (horário tomado,
//           sessão vencida), a tela volta ao que o banco tem e avisa.
//           Relê a cada 30 s e ao voltar para a aba: o agendamento feito
//           pelo link aparece sozinho na agenda.
//   publico (com Supabase) — a página do negócio: só o que o cliente pode
//           ver (`pagina_publica`, já vem do servidor). Vagas e agendamento
//           são decididos no banco; o link do cliente fala pelo token.
//   local   (sem Supabase configurado) — tudo no navegador, a partir da
//           semente pública (lib/sementes). É o modo de desenvolvimento.
//
// As ações de cliente (agendar, remarcar, cancelar…) passam por `portas`,
// que fazem a coisa certa em cada modo.
// =====================================================================

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { Agendamento, Banco, Cupom, Ficha, NegocioPublico } from "../tipos";
import { bancoDaSemente } from "../sementes";
import { negocioNovo, MENSAGENS_PADRAO } from "../padroes";
import { agoraNo } from "../datas";
import { supabaseOn } from "../supabase";
import {
  aplicarCupom,
  cancelar as cancelarLocal,
  criarAgendamento,
  mudarStatus,
  remarcar as remarcarLocal,
  salvarDepoimento,
  salvarFicha,
  type DadosAgendamento,
} from "./acoes";
import {
  ErroBanco,
  abrirLink,
  bancoSemAgenda,
  acoesDoLink,
  agendarNoBanco,
  carregarPagina,
  carregarPainel,
  diferenca,
  esquecerVagas,
  salvarLote,
} from "./remoto";
import { novoId } from "../id";

export type Modo = "painel" | "publico";

/** Resposta das ações do cliente: o motivo da recusa já vem escrito para gente. */
export type Feito<T = null> = { ok: true; valor: T } | { ok: false; motivo: string };

export type Portas = {
  agendar(d: DadosAgendamento): Promise<Feito<Agendamento>>;
  /** traz o agendamento do link para a loja; false = token desconhecido */
  abrirLink(token: string): Promise<boolean>;
  cancelar(ag: Agendamento): Promise<Feito>;
  confirmar(ag: Agendamento, agora: string): Promise<Feito>;
  remarcar(ag: Agendamento, data: string, hora: string, agora: string): Promise<Feito>;
  avaliar(ag: Agendamento, nota: number, texto: string, nome: string, hoje: string): Promise<Feito>;
  enviarFicha(ag: Agendamento, ficha: Omit<Ficha, "id">): Promise<Feito>;
  /** confere um cupom; se valer, ele entra na loja e `aplicarCupom` passa a enxergá-lo */
  cupom(codigo: string): Promise<Cupom | null>;
};

type Ctx = {
  slug: string;
  modo: Modo;
  /** true = grava no banco de verdade; false = só neste navegador */
  remoto: boolean;
  banco: Banco | null;
  mudar: (fn: (b: Banco) => Banco) => void;
  /** "agora" no fuso do negócio */
  agora: () => string;
  portas: Portas;
  /** painel: há mudança indo para o banco */
  salvando: boolean;
  /** painel: a última recusa do banco (a casca do painel mostra como aviso) */
  recusa: { texto: string; n: number } | null;
  /** não deu para abrir os dados (sessão vencida, sem acesso, sem rede) */
  erroCarga: string | null;
  recarregar: () => void;
};

const BancoCtx = createContext<Ctx | null>(null);

const mensagem = (e: unknown) =>
  e instanceof ErroBanco ? e.message : "Não foi possível falar com o servidor agora. Tente de novo.";

// ---------------------------------------------------------------------
// Modo local: o Banco de cada negócio no localStorage, avisando as telas
// quando muda — inclusive entre abas.
// ---------------------------------------------------------------------

/** Sobe quando o formato muda: o navegador descarta o que guardou antes. */
const VERSAO_BANCO = 6;

const cache = new Map<string, Banco>();
const ouvintes = new Map<string, Set<() => void>>();

function chave(slug: string) {
  return `livo-agenda:${slug}:banco`;
}

function bancoVazio(publico: NegocioPublico): Banco {
  const n = negocioNovo(publico.id, publico.slug, publico.nome, publico.nicho);
  return {
    versao: VERSAO_BANCO,
    negocio: { ...n, pele: publico.pele, tagline: publico.tagline, descricao: publico.descricao, tema: publico.tema },
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
    mensagens: structuredClone(MENSAGENS_PADRAO),
    registrosMensagem: [],
    depoimentos: [],
    cupons: [],
  };
}

function ler(slug: string): Banco | null {
  try {
    const bruto = localStorage.getItem(chave(slug));
    if (!bruto) return null;
    const b = JSON.parse(bruto) as Banco;
    return b.versao === VERSAO_BANCO ? b : null;
  } catch {
    return null;
  }
}

function gravar(slug: string, b: Banco) {
  try {
    localStorage.setItem(chave(slug), JSON.stringify(b));
  } catch {
    // cota cheia ou navegação privada: segue em memória nesta aba
  }
}

function obterBanco(slug: string, publico?: NegocioPublico): Banco {
  const emCache = cache.get(slug);
  if (emCache) return emCache;
  const b = ler(slug) ?? bancoDaSemente(slug, VERSAO_BANCO) ?? (publico ? bancoVazio(publico) : null);
  if (!b) throw new Error(`negócio ${slug} sem dados`);
  cache.set(slug, b);
  return b;
}

function definirBanco(slug: string, b: Banco) {
  cache.set(slug, b);
  gravar(slug, b);
  ouvintes.get(slug)?.forEach((f) => f());
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (!e.key?.startsWith("livo-agenda:") || !e.key.endsWith(":banco")) return;
    const slug = e.key.split(":")[1];
    cache.delete(slug);
    ouvintes.get(slug)?.forEach((f) => f());
  });
}

function assinar(slug: string, f: () => void) {
  if (!ouvintes.has(slug)) ouvintes.set(slug, new Set());
  ouvintes.get(slug)!.add(f);
  return () => {
    ouvintes.get(slug)?.delete(f);
  };
}

/** As ações do cliente sobre um Banco que mora aqui mesmo (modo local). */
function portasLocais(atual: () => Banco, mudar: (fn: (b: Banco) => Banco) => void): Portas {
  return {
    async agendar(d) {
      const r = criarAgendamento(atual(), d);
      if (!r.ok) return r;
      mudar(() => r.banco);
      return { ok: true, valor: r.valor };
    },
    async abrirLink(token) {
      return atual().agendamentos.some((a) => a.token === token);
    },
    async cancelar(ag) {
      mudar((x) => cancelarLocal(x, ag.id, "cliente", "Cancelado pelo link"));
      return { ok: true, valor: null };
    },
    async confirmar(ag, agora) {
      mudar((x) => mudarStatus(x, ag.id, "confirmado", agora));
      return { ok: true, valor: null };
    },
    async remarcar(ag, data, hora, agora) {
      const r = remarcarLocal(atual(), ag.id, { data, hora, profissionalId: ag.profissionalId, agora });
      if (!r.ok) return r;
      mudar(() => r.banco);
      return { ok: true, valor: null };
    },
    async avaliar(ag, nota, texto, nome, hoje) {
      mudar((x) =>
        salvarDepoimento(x, {
          id: novoId("dp"),
          nome,
          texto: texto.trim() || "Ótimo atendimento.",
          nota,
          data: hoje,
          servico: ag.itens[0]?.nome ?? "",
          // aparece na página só depois que o dono aprovar
          visivel: false,
        }),
      );
      return { ok: true, valor: null };
    },
    async enviarFicha(_ag, ficha) {
      mudar((b) => salvarFicha(b, { id: novoId("fc"), ...ficha }));
      return { ok: true, valor: null };
    },
    async cupom(codigo) {
      return aplicarCupom(atual(), codigo, 0).cupom;
    },
  };
}

function ProvedorLocal({ slug, modo, publico, children }: { slug: string; modo: Modo; publico?: NegocioPublico; children: ReactNode }) {
  const banco = useSyncExternalStore(
    useCallback((f: () => void) => assinar(slug, f), [slug]),
    () => obterBanco(slug, publico),
    () => null,
  );
  const mudar = useCallback(
    (fn: (b: Banco) => Banco) => definirBanco(slug, fn(obterBanco(slug, publico))),
    [slug, publico],
  );
  const portas = useMemo(() => portasLocais(() => obterBanco(slug, publico), mudar), [slug, publico, mudar]);
  const fuso = banco?.negocio.regras.fuso ?? "America/Fortaleza";
  const agora = useCallback(() => agoraNo(fuso), [fuso]);
  const valor = useMemo<Ctx>(
    () => ({ slug, modo, remoto: false, banco, mudar, agora, portas, salvando: false, recusa: null, erroCarga: null, recarregar: () => {} }),
    [slug, modo, banco, mudar, agora, portas],
  );
  return <BancoCtx.Provider value={valor}>{children}</BancoCtx.Provider>;
}

// ---------------------------------------------------------------------
// Modo painel: o banco é a fonte; a tela muda na hora e o lote vai atrás.
// ---------------------------------------------------------------------

const RELER_A_CADA = 30_000;

function ProvedorPainel({ slug, onSemAgenda, children }: { slug: string; onSemAgenda: () => void; children: ReactNode }) {
  const [banco, setBanco] = useState<Banco | null>(null);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [recusa, setRecusa] = useState<Ctx["recusa"]>(null);
  const atual = useRef<Banco | null>(null);
  const fila = useRef<Promise<void>>(Promise.resolve());
  const pendentes = useRef(0);
  // cada mudança local sobe a geração: uma leitura que começou antes dela é descartada
  const geracao = useRef(0);

  const aplicar = useCallback((b: Banco) => {
    atual.current = b;
    setBanco(b);
  }, []);

  /** `forcar`: depois de uma recusa, a tela volta ao banco mesmo com lote na fila */
  const recarregar = useCallback(async (forcar = false) => {
    const g = geracao.current;
    try {
      const b = await carregarPainel(slug);
      if (forcar || (g === geracao.current && pendentes.current === 0)) aplicar(b);
      setErroCarga(null);
    } catch (e) {
      if (bancoSemAgenda(e)) onSemAgenda();
      else if (!atual.current) setErroCarga(mensagem(e));
    }
  }, [slug, aplicar, onSemAgenda]);

  useEffect(() => {
    recarregar(true);
    const reler = () => {
      if (document.visibilityState === "visible" && pendentes.current === 0) recarregar();
    };
    const t = setInterval(reler, RELER_A_CADA);
    document.addEventListener("visibilitychange", reler);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", reler);
    };
  }, [recarregar]);

  const mudar = useCallback(
    (fn: (b: Banco) => Banco) => {
      const antes = atual.current;
      if (!antes) return;
      const depois = fn(antes);
      const lote = diferenca(antes, depois);
      if (!lote) return;
      geracao.current++;
      aplicar(depois);
      pendentes.current++;
      setSalvando(true);
      fila.current = fila.current.then(async () => {
        try {
          await salvarLote(slug, lote);
        } catch (e) {
          setRecusa((r) => ({ texto: mensagem(e), n: (r?.n ?? 0) + 1 }));
          // o banco não aceitou: a tela volta ao que ele tem de verdade
          geracao.current++;
          await recarregar(true);
        } finally {
          pendentes.current = Math.max(0, pendentes.current - 1);
          if (pendentes.current === 0) setSalvando(false);
        }
      });
    },
    [slug, aplicar, recarregar],
  );

  const portas = useMemo(() => portasLocais(() => atual.current!, mudar), [mudar]);
  const fuso = banco?.negocio.regras.fuso ?? "America/Fortaleza";
  const agora = useCallback(() => agoraNo(fuso), [fuso]);
  const valor = useMemo<Ctx>(
    () => ({ slug, modo: "painel", remoto: true, banco, mudar, agora, portas, salvando, recusa, erroCarga, recarregar: () => void recarregar(true) }),
    [slug, banco, mudar, agora, portas, salvando, recusa, erroCarga, recarregar],
  );
  return <BancoCtx.Provider value={valor}>{children}</BancoCtx.Provider>;
}

// ---------------------------------------------------------------------
// Modo público: a página do negócio, sem nada privado. O que o cliente
// faz vai direto ao banco; a loja só guarda o que ele pode ver.
// ---------------------------------------------------------------------

function ProvedorPublico({ slug, publico, inicial, children }: { slug: string; publico?: NegocioPublico; inicial?: Banco | null; children: ReactNode }) {
  const [banco, setBanco] = useState<Banco | null>(inicial ?? null);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const atual = useRef<Banco | null>(banco);

  const mudar = useCallback((fn: (b: Banco) => Banco) => {
    if (!atual.current) return;
    atual.current = fn(atual.current);
    setBanco(atual.current);
  }, []);

  useEffect(() => {
    if (atual.current) return;
    carregarPagina(slug)
      .then((b) => {
        const final = b ?? bancoDaSemente(slug, 0) ?? (publico ? bancoVazio(publico) : null);
        atual.current = final;
        setBanco(final);
      })
      .catch((e) => setErroCarga(mensagem(e)));
  }, [slug, publico]);

  // o que o link traz entra na loja: o horário, o primeiro nome do cliente e o que a ficha precisa
  const juntar = useCallback(
    (ag: Agendamento, extra?: { cliente?: { id: string; nome: string }; servicos?: Banco["servicos"]; modelosFicha?: Banco["modelosFicha"]; fichas?: Banco["fichas"] }) =>
      mudar((b) => ({
        ...b,
        agendamentos: [...b.agendamentos.filter((a) => a.id !== ag.id), ag],
        clientes: extra?.cliente
          ? [
              ...b.clientes.filter((c) => c.id !== extra.cliente!.id),
              { id: extra.cliente.id, nome: extra.cliente.nome, telefone: "", email: "", nascimento: null, observacoes: "", tags: [], origem: "online", criadoEm: ag.criadoEm, consentimentoWhats: true },
            ]
          : b.clientes,
        servicos: [...b.servicos, ...(extra?.servicos ?? []).filter((s) => !b.servicos.some((x) => x.id === s.id))],
        modelosFicha: [...b.modelosFicha, ...(extra?.modelosFicha ?? []).filter((m) => !b.modelosFicha.some((x) => x.id === m.id))],
        fichas: [...b.fichas, ...(extra?.fichas ?? []).filter((f) => !b.fichas.some((x) => x.id === f.id))],
      })),
    [mudar],
  );

  const portas = useMemo<Portas>(() => {
    const tentar = async <T,>(f: () => Promise<T>): Promise<Feito<T>> => {
      try {
        return { ok: true, valor: await f() };
      } catch (e) {
        return { ok: false, motivo: mensagem(e) };
      }
    };
    return {
      async agendar(d) {
        const r = await tentar(() =>
          agendarNoBanco(slug, {
            servicosIds: d.servicosIds,
            profissionalId: d.profissionalId,
            data: d.data,
            hora: d.hora,
            observacao: d.observacao ?? "",
            cupom: d.cupom ?? null,
            cliente: { nome: d.cliente.nome, telefone: d.cliente.telefone, email: d.cliente.email ?? "", nascimento: d.cliente.nascimento ?? null },
          }),
        );
        esquecerVagas();
        if (!r.ok) return r;
        juntar(r.valor.agendamento, { cliente: r.valor.cliente });
        return { ok: true, valor: r.valor.agendamento };
      },
      async abrirLink(token) {
        if (atual.current?.agendamentos.some((a) => a.token === token)) return true;
        const r = await tentar(() => abrirLink(slug, token));
        if (!r.ok || !r.valor) return false;
        juntar(r.valor.agendamento, r.valor);
        return true;
      },
      async cancelar(ag) {
        const r = await tentar(() => acoesDoLink.cancelar(slug, ag.token));
        esquecerVagas();
        if (r.ok) juntar(r.valor);
        return r.ok ? { ok: true, valor: null } : r;
      },
      async confirmar(ag) {
        const r = await tentar(() => acoesDoLink.confirmar(slug, ag.token));
        if (r.ok) juntar(r.valor);
        return r.ok ? { ok: true, valor: null } : r;
      },
      async remarcar(ag, data, hora) {
        const r = await tentar(() => acoesDoLink.remarcar(slug, ag.token, data, hora));
        esquecerVagas();
        if (r.ok) juntar(r.valor);
        return r.ok ? { ok: true, valor: null } : r;
      },
      async avaliar(ag, nota, texto) {
        const r = await tentar(() => acoesDoLink.avaliar(slug, ag.token, nota, texto));
        return r.ok ? { ok: true, valor: null } : r;
      },
      async enviarFicha(ag, ficha) {
        const r = await tentar(() => acoesDoLink.ficha(slug, ag.token, ficha.respostas, ficha.assinatura));
        if (r.ok) mudar((b) => salvarFicha(b, { id: `fc_${ag.id}`, ...ficha }));
        return r.ok ? { ok: true, valor: null } : r;
      },
      async cupom(codigo) {
        const r = await tentar(() => acoesDoLink.cupom(slug, codigo));
        if (!r.ok || !r.valor) return null;
        const c = r.valor;
        mudar((b) => ({ ...b, cupons: [...b.cupons.filter((x) => x.id !== c.id), c] }));
        return c;
      },
    };
  }, [slug, juntar, mudar]);

  const fuso = banco?.negocio.regras.fuso ?? "America/Fortaleza";
  const agora = useCallback(() => agoraNo(fuso), [fuso]);
  const valor = useMemo<Ctx>(
    () => ({ slug, modo: "publico", remoto: true, banco, mudar, agora, portas, salvando: false, recusa: null, erroCarga, recarregar: () => {} }),
    [slug, banco, mudar, agora, portas, erroCarga],
  );
  return <BancoCtx.Provider value={valor}>{children}</BancoCtx.Provider>;
}

// ---------------------------------------------------------------------

export function BancoProvider({
  slug,
  modo,
  publico,
  inicial,
  local,
  children,
}: {
  slug: string;
  modo: Modo;
  publico?: NegocioPublico;
  /** página pública: o que o servidor já leu do banco nesta requisição */
  inicial?: Banco | null;
  /** o servidor viu que o banco ainda não tem a agenda: modo local */
  local?: boolean;
  children: ReactNode;
}) {
  const [semAgenda, setSemAgenda] = useState(false);
  const aoFaltarAgenda = useCallback(() => setSemAgenda(true), []);
  if (!supabaseOn || local || semAgenda) return <ProvedorLocal slug={slug} modo={modo} publico={publico}>{children}</ProvedorLocal>;
  if (modo === "painel") return <ProvedorPainel slug={slug} onSemAgenda={aoFaltarAgenda}>{children}</ProvedorPainel>;
  return <ProvedorPublico slug={slug} publico={publico} inicial={inicial}>{children}</ProvedorPublico>;
}

export function useLoja(): Ctx {
  const c = useContext(BancoCtx);
  if (!c) throw new Error("useLoja fora do BancoProvider");
  return c;
}

/** Para telas que só renderizam com dados: o Banco, garantido. */
export function useBanco(): Banco {
  const { banco } = useLoja();
  if (!banco) throw new Error("useBanco antes de carregar");
  return banco;
}
