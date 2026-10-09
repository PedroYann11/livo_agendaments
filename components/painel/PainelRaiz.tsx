"use client";

// =====================================================================
// A raiz do painel: sessão → negócio → casca (navegação) → página.
//
// Também é dona das duas folhas que qualquer tela pode abrir:
//   novo agendamento  (o "+" da barra, clicar num horário vago da agenda)
//   detalhe           (clicar num agendamento em qualquer lugar)
// =====================================================================

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { MotionConfig, motion } from "motion/react";
import { BancoProvider, useLoja } from "@/lib/dados/loja";
import { Provedores, useAvisos } from "@/components/ui/Avisos";
import { Folha } from "@/components/ui/Folha";
import { Icone, type NomeIcone } from "@/components/ui/Icone";
import { Avatar, Botao, BotaoIcone, EstadoVazio, Esqueleto } from "@/components/ui/basicos";
import { AREAS_DO_PAPEL, NOME_PAPEL, lerSessao, sair, trocarNegocio, type Sessao } from "@/lib/sessao";
import { variaveisPainel } from "@/lib/cor";
import type { Banco, Modulo, Papel } from "@/lib/tipos";
import { somarMin } from "@/lib/datas";
import { NovoAgendamento, type PreNovo } from "./NovoAgendamento";
import { DetalheAgendamento } from "./DetalheAgendamento";

// ---------------------------------------------------------------------
// sessão como "store" externo (lê localStorage, avisa por evento)
// ---------------------------------------------------------------------

let ultimoBruto: string | null = null;
let ultimaSessao: Sessao | null = null;

function assinarSessao(f: () => void) {
  window.addEventListener("livo-sessao", f);
  window.addEventListener("storage", f);
  return () => {
    window.removeEventListener("livo-sessao", f);
    window.removeEventListener("storage", f);
  };
}
function snapshotSessao(): Sessao | null {
  let bruto: string | null = null;
  try {
    bruto = localStorage.getItem("livo-agenda:sessao");
  } catch {}
  if (bruto !== ultimoBruto) {
    ultimoBruto = bruto;
    ultimaSessao = lerSessao();
  }
  return ultimaSessao;
}

export function useSessao(): Sessao | null | undefined {
  return useSyncExternalStore(assinarSessao, snapshotSessao, () => undefined);
}

// ---------------------------------------------------------------------
// contexto do painel
// ---------------------------------------------------------------------

type CtxPainel = {
  sessao: Sessao;
  papel: Papel;
  /** profissional ligado ao usuário (papel "professional" vê só a própria agenda) */
  meuProfissionalId: string | null;
  novo: (pre?: PreNovo) => void;
  abrir: (agendamentoId: string) => void;
  pode: (area: string) => boolean;
};

const Ctx = createContext<CtxPainel | null>(null);

export function usePainel(): CtxPainel {
  const c = useContext(Ctx);
  if (!c) throw new Error("usePainel fora do painel");
  return c;
}

type ItemNav = { area: string; href: string; rotulo: string; icone: NomeIcone; modulo?: Modulo };

export const NAV: ItemNav[] = [
  { area: "inicio", href: "/painel", rotulo: "Início", icone: "inicio" },
  { area: "agenda", href: "/painel/agenda", rotulo: "Agenda", icone: "agenda" },
  { area: "clientes", href: "/painel/clientes", rotulo: "Clientes", icone: "clientes" },
  { area: "mensagens", href: "/painel/mensagens", rotulo: "Mensagens", icone: "mensagens" },
  { area: "servicos", href: "/painel/servicos", rotulo: "Serviços", icone: "servicos" },
  { area: "equipe", href: "/painel/equipe", rotulo: "Equipe", icone: "equipe" },
  { area: "financeiro", href: "/painel/financeiro", rotulo: "Financeiro", icone: "financeiro", modulo: "financeiro" },
  { area: "relatorios", href: "/painel/relatorios", rotulo: "Relatórios", icone: "relatorios" },
  { area: "anamnese", href: "/painel/anamnese", rotulo: "Anamnese", icone: "ficha", modulo: "anamnese" },
  { area: "configuracoes", href: "/painel/configuracoes", rotulo: "Configurações", icone: "config" },
];

/** Telas do painel que se abrem sem sessão: entrar, criar conta, senha. */
const ABERTAS = new Set(["/painel/entrar", "/painel/criar-conta", "/painel/criar-negocio", "/painel/esqueci-senha", "/painel/nova-senha"]);

export function PainelRaiz({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const sessao = useSessao();
  const naEntrada = ABERTAS.has(pathname);

  useEffect(() => {
    if (sessao === null && !naEntrada) router.replace("/painel/entrar");
  }, [sessao, naEntrada, router]);

  if (naEntrada) {
    return (
      <MotionConfig reducedMotion="user">
        <Provedores>
          <div className="pn">{children}</div>
        </Provedores>
      </MotionConfig>
    );
  }
  if (!sessao) {
    return (
      <div className="pn" style={{ display: "grid", placeItems: "center" }}>
        <Esqueleto altura={8} largura={120} />
      </div>
    );
  }
  return (
    <MotionConfig reducedMotion="user">
      <BancoProvider slug={sessao.slug} modo="painel" key={sessao.slug}>
        <Provedores>
          <Casca sessao={sessao}>{children}</Casca>
        </Provedores>
      </BancoProvider>
    </MotionConfig>
  );
}

function Casca({ sessao, children }: { sessao: Sessao; children: ReactNode }) {
  const { banco, agora, remoto, salvando, recusa, erroCarga, recarregar } = useLoja();
  const avisar = useAvisos();
  const pathname = usePathname();
  const [pre, setPre] = useState<PreNovo | null>(null);
  const [detalhe, setDetalhe] = useState<string | null>(null);
  const [mais, setMais] = useState(false);
  const [rolou, setRolou] = useState(false);

  useEffect(() => {
    const f = () => setRolou(window.scrollY > 8);
    window.addEventListener("scroll", f, { passive: true });
    return () => window.removeEventListener("scroll", f);
  }, []);
  useEffect(() => setMais(false), [pathname]);
  // o banco recusou uma mudança (horário tomado, sessão vencida): a tela já voltou; aqui, o porquê
  useEffect(() => {
    if (recusa) avisar(recusa.texto, "erro");
  }, [recusa, avisar]);

  const meuProfissionalId = useMemo(() => {
    if (!banco || sessao.papel !== "professional") return null;
    return (
      banco.profissionais.find((p) => p.acesso?.email === sessao.email)?.id ??
      banco.profissionais.find((p) => p.acesso?.papel === "professional")?.id ??
      null
    );
  }, [banco, sessao]);

  const pode = useCallback(
    (area: string) => {
      if (!AREAS_DO_PAPEL[sessao.papel].includes(area)) return false;
      const item = NAV.find((n) => n.area === area);
      if (item?.modulo && banco && !banco.negocio.modulos[item.modulo]) return false;
      return true;
    },
    [sessao.papel, banco],
  );

  const ctx = useMemo<CtxPainel>(
    () => ({
      sessao,
      papel: sessao.papel,
      meuProfissionalId,
      novo: (p) => setPre(p ?? {}),
      abrir: (id) => setDetalhe(id),
      pode,
    }),
    [sessao, meuProfissionalId, pode],
  );

  if (!banco && erroCarga) {
    return (
      <div className="pn" style={{ display: "grid", placeItems: "center", padding: 24 }}>
        <EstadoVazio
          icone="info"
          titulo="Não foi possível abrir o painel"
          texto={erroCarga}
          acao={
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
              <Botao variante="principal" onClick={recarregar}>
                Tentar de novo
              </Botao>
              <Botao variante="secundario" onClick={() => sair()}>
                Entrar de novo
              </Botao>
            </div>
          }
        />
      </div>
    );
  }

  if (!banco) {
    return (
      <div className="pn">
        <div className="pn-conteudo">
          <div className="pn-pagina" style={{ paddingTop: 30, display: "grid", gap: 14 }}>
            <Esqueleto altura={34} largura={220} />
            <Esqueleto altura={110} raio={16} />
            <Esqueleto altura={260} raio={16} />
          </div>
        </div>
      </div>
    );
  }

  const n = banco.negocio;
  const itens = NAV.filter((i) => pode(i.area));
  const pendentes = contarPendentes(banco, agora());
  const ativo = (href: string) => (href === "/painel" ? pathname === "/painel" : pathname.startsWith(href));
  const abas = itens.filter((i) => ["inicio", "agenda", "clientes"].includes(i.area));

  return (
    <Ctx.Provider value={ctx}>
      <div className="pn" style={variaveisPainel(n.tema.marca) as React.CSSProperties}>
        <aside className="pn-lado">
          <SeletorNegocio sessao={sessao} banco={banco} />
          <nav className="pn-nav" aria-label="Painel">
            {itens.map((i) => (
              <Link key={i.href} href={i.href} className={ativo(i.href) ? "ativo" : ""} aria-current={ativo(i.href) ? "page" : undefined}>
                {ativo(i.href) && <motion.span layoutId="pn-nav" className="pn-nav-fundo" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
                <Icone nome={i.icone} tamanho={19} peso={ativo(i.href) ? "fill" : "regular"} />
                {i.rotulo}
                {i.area === "agenda" && pendentes > 0 && <span className="pn-nav-contagem">{pendentes}</span>}
              </Link>
            ))}
          </nav>
          <div className="pn-lado-pe">
            <button type="button" className="ui-botao ui-botao-principal ui-botao-m ui-bloco" onClick={() => setPre({})}>
              <Icone nome="agendaMais" tamanho={18} /> Novo agendamento
            </button>
            <a href={`/${n.slug}`} target="_blank" rel="noopener noreferrer" className="ui-botao ui-botao-secundario ui-botao-m ui-bloco">
              <Icone nome="navegador" tamanho={18} /> Ver minha página
            </a>
            <div className="pn-usuario">
              <Avatar nome={sessao.nome} tamanho={32} />
              <div>
                <strong>{sessao.nome}</strong>
                <small>{NOME_PAPEL[sessao.papel]} · {sessao.email}</small>
              </div>
              <BotaoIcone icone="sair" rotulo="Sair" tamanho={18} onClick={() => sair()} />
            </div>
          </div>
        </aside>

        <div className="pn-conteudo">
          {/* sem banco configurado, o painel grava no navegador — dizer isso com todas as letras */}
          {!remoto && (
            <div className="pn-faixa-demo">
              <Icone nome="info" tamanho={15} />
              <span>Modo de testes: o que você muda aqui fica só neste aparelho.</span>
            </div>
          )}
          <span className={`pn-salvando${salvando ? " ativo" : ""}`} role="status" aria-live="polite">
            {salvando ? "Salvando…" : ""}
          </span>
          <header className={`pn-topo-movel${rolou ? " rolou" : ""}`}>
            <SimboloNegocio n={n} />
            <strong>{n.nome}</strong>
            <a href={`/${n.slug}`} target="_blank" rel="noopener noreferrer" className="ui-botao-icone" aria-label="Ver minha página">
              <Icone nome="navegador" />
            </a>
          </header>
          <motion.main key={pathname} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}>
            {children}
          </motion.main>
        </div>

        <nav className="pn-abas" aria-label="Navegação">
          {abas.slice(0, 2).map((i) => (
            <AbaMovel key={i.href} item={i} ativo={ativo(i.href)} selo={i.area === "agenda" ? pendentes : 0} />
          ))}
          <button type="button" className="pn-aba-mais" aria-label="Novo agendamento" onClick={() => setPre({})}>
            <Icone nome="mais" tamanho={24} peso="bold" />
          </button>
          {abas.slice(2, 3).map((i) => (
            <AbaMovel key={i.href} item={i} ativo={ativo(i.href)} selo={0} />
          ))}
          <button type="button" className={`pn-aba${mais ? " ativo" : ""}`} onClick={() => setMais(true)}>
            <Icone nome="grade" tamanho={22} />
            Mais
          </button>
        </nav>

        <Folha aberta={mais} onFechar={() => setMais(false)} titulo={n.nome} subtitulo={`${sessao.nome} · ${NOME_PAPEL[sessao.papel]}`}>
          <div className="pn-mais-grade">
            {itens
              .filter((i) => !["inicio", "agenda", "clientes"].includes(i.area))
              .map((i) => (
                <Link key={i.href} href={i.href}>
                  <Icone nome={i.icone} tamanho={24} />
                  {i.rotulo}
                </Link>
              ))}
            <a href={`/${n.slug}`} target="_blank" rel="noopener noreferrer">
              <Icone nome="navegador" tamanho={24} />
              Minha página
            </a>
            <button type="button" onClick={() => sair()}>
              <Icone nome="sair" tamanho={24} />
              Sair
            </button>
          </div>
          {sessao.negocios.length > 1 && (
            <div style={{ marginTop: 20 }}>
              <h3 style={{ fontSize: 12, fontWeight: 650, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--c-texto-3)", marginBottom: 8 }}>
                Trocar de negócio
              </h3>
              <div className="pn-checks">
                {sessao.negocios.map((x) => (
                  <button key={x.slug} type="button" className="pn-check" onClick={() => trocarNegocio(sessao, x.slug)}>
                    <Icone nome={x.slug === sessao.slug ? "okCirculo" : "pagina"} tamanho={18} />
                    <span style={{ textAlign: "left" }}>{x.nome}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </Folha>

        <NovoAgendamento pre={pre} onFechar={() => setPre(null)} onCriado={(id) => setDetalhe(id)} />
        <DetalheAgendamento id={detalhe} onFechar={() => setDetalhe(null)} />
      </div>
    </Ctx.Provider>
  );
}

function AbaMovel({ item, ativo, selo }: { item: ItemNav; ativo: boolean; selo: number }) {
  return (
    <Link href={item.href} className={`pn-aba${ativo ? " ativo" : ""}`} aria-current={ativo ? "page" : undefined}>
      {ativo && <motion.span layoutId="pn-aba" className="pn-aba-ponto" transition={{ type: "spring", stiffness: 500, damping: 38 }} />}
      <Icone nome={item.icone} tamanho={22} peso={ativo ? "fill" : "regular"} />
      {item.rotulo}
      {selo > 0 && <span className="pn-aba-selo">{selo > 9 ? "9+" : selo}</span>}
    </Link>
  );
}

function SeletorNegocio({ sessao, banco }: { sessao: Sessao; banco: Banco }) {
  const [aberto, setAberto] = useState(false);
  const n = banco.negocio;
  return (
    <>
      <button type="button" className="pn-negocio" onClick={() => setAberto(true)} disabled={sessao.negocios.length < 2}>
        <SimboloNegocio n={n} />
        <span className="pn-negocio-nome">
          <strong>{n.nome}</strong>
          <small>/{n.slug}</small>
        </span>
        {sessao.negocios.length > 1 && <Icone nome="baixo" tamanho={16} />}
      </button>
      <Folha aberta={aberto} onFechar={() => setAberto(false)} titulo="Trocar de negócio">
        <div className="pn-checks">
          {sessao.negocios.map((x) => (
            <button
              key={x.slug}
              type="button"
              className="pn-check"
              onClick={() => {
                trocarNegocio(sessao, x.slug);
                setAberto(false);
              }}
            >
              <Icone nome={x.slug === sessao.slug ? "okCirculo" : "pagina"} tamanho={18} />
              <span style={{ textAlign: "left" }}>{x.nome}</span>
              <small>/{x.slug}</small>
            </button>
          ))}
        </div>
      </Folha>
    </>
  );
}

function SimboloNegocio({ n }: { n: Banco["negocio"] }) {
  return (
    <span className={`pn-negocio-simbolo${n.logoUrl ? " com-imagem" : ""}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {n.logoUrl ? <img src={n.logoUrl} alt="" /> : n.nome.charAt(0)}
    </span>
  );
}

/** Agendamentos a confirmar nas próximas 48 h — o número na aba Agenda. */
export function contarPendentes(b: Banco, agora: string): number {
  const limite = somarMin(agora, 48 * 60);
  return b.agendamentos.filter((a) => a.status === "pendente" && a.inicio >= agora && a.inicio <= limite).length;
}
