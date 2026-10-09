"use client";

// =====================================================================
// Componentes de base. Origem: livo@d74d591 · components/ui/basicos.tsx
//
// Cada coisa tem o seu desenho e o seu nome (lição do livo: a "pílula"
// fazia quatro papéis):
//   navegar entre partes / escolher uma opção → Segmentado
//   ligar/desligar                            → Interruptor
//   executar                                  → Botao / BotaoIcone
//   indicar                                   → Selo
//
// Nenhum tem cor própria: tudo sai dos papéis --c-* que o painel (.pn) e a
// página pública (.vt) definem. O mesmo botão veste a Livo ou a loja.
// =====================================================================

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ComponentProps,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";
import { animate, motion, useInView, useReducedMotion } from "motion/react";
import { Icone, type NomeIcone } from "./Icone";
import { iniciais } from "@/lib/formato";
import { corDaPessoa } from "@/lib/paleta";

type Variante = "principal" | "secundario" | "fantasma" | "perigo" | "suave";

export function Botao({
  variante = "secundario",
  icone,
  iconeDepois,
  carregando,
  tamanho = "m",
  bloco,
  children,
  className,
  ...resto
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variante?: Variante;
  icone?: NomeIcone;
  iconeDepois?: NomeIcone;
  carregando?: boolean;
  tamanho?: "p" | "m" | "g";
  bloco?: boolean;
}) {
  return (
    <button
      type="button"
      {...resto}
      disabled={resto.disabled || carregando}
      aria-busy={carregando || undefined}
      className={`ui-botao ui-botao-${variante} ui-botao-${tamanho}${bloco ? " ui-bloco" : ""}${className ? " " + className : ""}`}
    >
      {carregando ? (
        <Icone nome="carregando" tamanho={18} className="ui-girando" />
      ) : (
        icone && <Icone nome={icone} tamanho={tamanho === "p" ? 16 : 18} />
      )}
      {children && <span>{children}</span>}
      {iconeDepois && !carregando && <Icone nome={iconeDepois} tamanho={tamanho === "p" ? 16 : 18} />}
    </button>
  );
}

/** Botão só de ícone. O rótulo é obrigatório: é o que o leitor de tela lê. */
export function BotaoIcone({
  icone,
  rotulo,
  className,
  tamanho = 20,
  ...resto
}: ButtonHTMLAttributes<HTMLButtonElement> & { icone: NomeIcone; rotulo: string; tamanho?: number }) {
  return (
    <button type="button" {...resto} aria-label={rotulo} title={rotulo} className={`ui-botao-icone${className ? " " + className : ""}`}>
      <Icone nome={icone} tamanho={tamanho} />
    </button>
  );
}

export function Interruptor({
  ligado,
  onMudar,
  rotulo,
  mostrarRotulo = false,
  desabilitado,
}: {
  ligado: boolean;
  onMudar: (v: boolean) => void;
  rotulo: string;
  mostrarRotulo?: boolean;
  desabilitado?: boolean;
}) {
  return (
    <label className={`ui-interruptor${desabilitado ? " desabilitado" : ""}`}>
      <input
        type="checkbox"
        role="switch"
        checked={ligado}
        disabled={desabilitado}
        aria-label={mostrarRotulo ? undefined : rotulo}
        onChange={(e) => onMudar(e.target.checked)}
      />
      <span className="ui-interruptor-trilho" aria-hidden="true" />
      {mostrarRotulo && <span className="ui-interruptor-rotulo">{rotulo}</span>}
    </label>
  );
}

/** Abas/escolha com o indicador que desliza (layoutId) — um movimento só. */
export function Segmentado<T extends string>({
  opcoes,
  valor,
  onMudar,
  rotulo,
  tamanho = "m",
}: {
  opcoes: readonly { id: T; rotulo: string; contagem?: number; icone?: NomeIcone }[];
  valor: T;
  onMudar: (v: T) => void;
  rotulo: string;
  tamanho?: "p" | "m";
}) {
  const grupo = useId();
  const ref = useRef<HTMLDivElement>(null);
  // não coube numa linha (celular estreito)? vira duas colunas: nenhuma opção fica escondida de lado
  const [quebra, setQuebra] = useState(false);
  const chave = opcoes.map((o) => `${o.rotulo}${o.contagem ?? ""}`).join("|");
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const medir = () => {
      // mede sempre na forma de uma linha só
      const tinha = el.classList.contains("quebra");
      if (tinha) el.classList.remove("quebra");
      const naoCabe = el.scrollWidth > el.clientWidth + 1;
      if (tinha) el.classList.add("quebra");
      setQuebra(naoCabe);
    };
    medir();
    const ro = new ResizeObserver(medir);
    if (el.parentElement) ro.observe(el.parentElement);
    return () => ro.disconnect();
  }, [chave]);
  return (
    <div ref={ref} className={`ui-segmentado ui-segmentado-${tamanho}${quebra ? " quebra" : ""}`} role="tablist" aria-label={rotulo}>
      {opcoes.map((o) => {
        const ativo = o.id === valor;
        return (
          <button key={o.id} type="button" role="tab" aria-selected={ativo} className={ativo ? "ativo" : ""} onClick={() => onMudar(o.id)}>
            {ativo && (
              <motion.span
                layoutId={`seg-${grupo}`}
                className="ui-segmentado-fundo"
                transition={{ type: "spring", stiffness: 520, damping: 40 }}
              />
            )}
            <span className="ui-segmentado-texto">
              {o.icone && <Icone nome={o.icone} tamanho={16} />}
              {o.rotulo}
              {o.contagem !== undefined && <span className="ui-contagem">{o.contagem}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function Selo({
  children,
  tom = "neutro",
  icone,
}: {
  children: ReactNode;
  tom?: "neutro" | "marca" | "bom" | "atencao" | "critico" | "info";
  icone?: NomeIcone;
}) {
  return (
    <span className={`ui-selo ui-selo-${tom}`}>
      {icone && <Icone nome={icone} tamanho={13} peso="bold" />}
      {children}
    </span>
  );
}

export function EstadoVazio({
  icone,
  titulo,
  texto,
  acao,
}: {
  icone: NomeIcone;
  titulo: string;
  texto?: string;
  acao?: ReactNode;
}) {
  return (
    <div className="ui-vazio">
      <span className="ui-vazio-icone">
        <Icone nome={icone} tamanho={26} />
      </span>
      <strong>{titulo}</strong>
      {texto && <p>{texto}</p>}
      {acao}
    </div>
  );
}

export function Avatar({
  nome,
  cor,
  tamanho = 36,
  foto,
}: {
  nome: string;
  /** índice da paleta ou cor hex */
  cor?: number | string;
  tamanho?: number;
  foto?: string | null;
}) {
  const fundo = typeof cor === "number" ? corDaPessoa(cor) : cor;
  if (foto) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={foto} alt="" className="ui-avatar" style={{ width: tamanho, height: tamanho }} />;
  }
  return (
    <span
      className={`ui-avatar${fundo ? " ui-avatar-cor" : ""}`}
      style={{ width: tamanho, height: tamanho, fontSize: tamanho * 0.38, ...(fundo ? { ["--av" as string]: fundo } : {}) }}
      aria-hidden="true"
    >
      {iniciais(nome)}
    </span>
  );
}

export function Campo({
  rotulo,
  ajuda,
  erro,
  children,
  opcional,
}: {
  rotulo: string;
  ajuda?: ReactNode;
  erro?: string | null;
  children: ReactNode;
  opcional?: boolean;
}) {
  return (
    <label className={`ui-campo${erro ? " com-erro" : ""}`}>
      <span className="ui-campo-rotulo">
        {rotulo}
        {opcional && <em> · opcional</em>}
      </span>
      {children}
      {erro ? <span className="ui-campo-erro">{erro}</span> : ajuda ? <span className="ui-campo-ajuda">{ajuda}</span> : null}
    </label>
  );
}

export function Entrada({ icone, ...resto }: InputHTMLAttributes<HTMLInputElement> & { icone?: NomeIcone }) {
  if (!icone) return <input {...resto} className={`ui-entrada${resto.className ? " " + resto.className : ""}`} />;
  return (
    <span className="ui-entrada-com-icone">
      <Icone nome={icone} tamanho={18} />
      <input {...resto} className={`ui-entrada${resto.className ? " " + resto.className : ""}`} />
    </span>
  );
}

export function Texto(props: ComponentProps<"textarea">) {
  return <textarea rows={3} {...props} className={`ui-entrada ui-texto${props.className ? " " + props.className : ""}`} />;
}

export function Busca({
  valor,
  onMudar,
  placeholder = "Buscar",
}: {
  valor: string;
  onMudar: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="ui-busca">
      <Icone nome="buscar" tamanho={18} />
      <input type="search" value={valor} placeholder={placeholder} onChange={(e) => onMudar(e.target.value)} aria-label={placeholder} />
      {valor && <BotaoIcone icone="fechar" rotulo="Limpar busca" tamanho={16} onClick={() => onMudar("")} />}
    </div>
  );
}

/** Contador que corre até o valor — uma vez, ao entrar na tela. */
export function NumeroAnimado({ valor, formatar }: { valor: number; formatar: (n: number) => string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const visto = useInView(ref, { once: true });
  const reduzir = useReducedMotion();
  const anterior = useRef(0);
  useEffect(() => {
    const el = ref.current;
    if (!el || !visto) return;
    if (reduzir) {
      el.textContent = formatar(valor);
      return;
    }
    const ctrl = animate(anterior.current, valor, {
      duration: 0.9,
      ease: [0.23, 1, 0.32, 1],
      onUpdate: (v) => {
        el.textContent = formatar(v);
      },
    });
    anterior.current = valor;
    return () => ctrl.stop();
  }, [valor, visto, formatar, reduzir]);
  return <span ref={ref}>{formatar(reduzir ? valor : 0)}</span>;
}

export function Esqueleto({ altura = 16, largura = "100%", raio = 8 }: { altura?: number; largura?: number | string; raio?: number }) {
  return <span className="ui-esqueleto" style={{ height: altura, width: largura, borderRadius: raio }} />;
}

export function Medidor({ valor, tom = "marca", rotulo }: { valor: number; tom?: "marca" | "bom" | "atencao" | "critico"; rotulo: string }) {
  const v = Math.max(0, Math.min(1, valor));
  return (
    <span className={`ui-medidor ui-medidor-${tom}`} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v * 100)} aria-label={rotulo}>
      <motion.span
        className="ui-medidor-cheio"
        initial={{ scaleX: 0 }}
        whileInView={{ scaleX: v }}
        viewport={{ once: true }}
        transition={{ duration: 0.7, ease: [0.23, 1, 0.32, 1] }}
      />
    </span>
  );
}

/** Copiar para a área de transferência, com retorno visível. */
export function BotaoCopiar({ texto, rotulo = "Copiar" }: { texto: string; rotulo?: string }) {
  const [ok, setOk] = useState(false);
  return (
    <Botao
      variante="secundario"
      icone={ok ? "ok" : "copiar"}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(texto);
          setOk(true);
          setTimeout(() => setOk(false), 1800);
        } catch {}
      }}
    >
      {ok ? "Copiado" : rotulo}
    </Botao>
  );
}

export function Estrelas({ nota, tamanho = 14 }: { nota: number; tamanho?: number }) {
  return (
    <span className="ui-estrelas" aria-label={`${nota} de 5 estrelas`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Icone key={i} nome="estrela" tamanho={tamanho} peso={i <= nota ? "fill" : "regular"} />
      ))}
    </span>
  );
}
