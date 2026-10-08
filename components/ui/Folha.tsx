"use client";

// =====================================================================
// Folha: o lugar de todo formulário e detalhe.
//   celular  → sobe de baixo, arrasta para fechar (curva de gaveta do iOS)
//   desktop  → painel lateral à direita
// Esc fecha; o foco vai para dentro ao abrir e volta ao sair.
// =====================================================================

import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion, type PanInfo } from "motion/react";
import { BotaoIcone } from "./basicos";

const GAVETA = [0.32, 0.72, 0, 1] as const;

export function useTelaLarga(min = 900): boolean {
  return useSyncExternalStore(
    (f) => {
      const m = window.matchMedia(`(min-width: ${min}px)`);
      m.addEventListener("change", f);
      return () => m.removeEventListener("change", f);
    },
    () => window.matchMedia(`(min-width: ${min}px)`).matches,
    () => false,
  );
}

export function Folha({
  aberta,
  onFechar,
  titulo,
  subtitulo,
  children,
  rodape,
  largura = 460,
}: {
  aberta: boolean;
  onFechar: () => void;
  titulo: ReactNode;
  subtitulo?: ReactNode;
  children: ReactNode;
  rodape?: ReactNode;
  largura?: number;
}) {
  const larga = useTelaLarga();
  const reduzir = useReducedMotion();
  const caixa = useRef<HTMLDivElement>(null);
  const antes = useRef<Element | null>(null);

  useEffect(() => {
    if (!aberta) return;
    antes.current = document.activeElement;
    const t = setTimeout(() => {
      const alvo = caixa.current?.querySelector<HTMLElement>("input, select, textarea, button:not([data-fechar])");
      (alvo ?? caixa.current)?.focus({ preventScroll: true });
    }, 60);
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && onFechar();
    document.addEventListener("keydown", tecla);
    document.documentElement.classList.add("ui-travado");
    return () => {
      clearTimeout(t);
      document.removeEventListener("keydown", tecla);
      document.documentElement.classList.remove("ui-travado");
      (antes.current as HTMLElement | null)?.focus?.({ preventScroll: true });
    };
  }, [aberta, onFechar]);

  const fimArrasto = (_: unknown, info: PanInfo) => {
    if (info.offset.y > 120 || info.velocity.y > 600) onFechar();
  };

  const entrada = reduzir
    ? { opacity: 0 }
    : larga
      ? { x: "100%" }
      : { y: "100%" };
  const parado = larga ? { x: 0, opacity: 1 } : { y: 0, opacity: 1 };

  return (
    <AnimatePresence>
      {aberta && (
        <div className="ui-folha-raiz" role="presentation">
          <motion.div
            className="ui-folha-veu"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onFechar}
          />
          <motion.div
            ref={caixa}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label={typeof titulo === "string" ? titulo : undefined}
            className={`ui-folha ${larga ? "ui-folha-lado" : "ui-folha-baixo"}`}
            style={larga ? { width: largura } : undefined}
            initial={entrada}
            animate={parado}
            exit={entrada}
            transition={{ duration: reduzir ? 0.15 : 0.42, ease: GAVETA }}
            drag={larga || reduzir ? false : "y"}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={fimArrasto}
          >
            {!larga && <span className="ui-folha-alca" aria-hidden="true" />}
            <header className="ui-folha-topo">
              <div>
                <h2>{titulo}</h2>
                {subtitulo && <p>{subtitulo}</p>}
              </div>
              <BotaoIcone icone="fechar" rotulo="Fechar" onClick={onFechar} data-fechar="" />
            </header>
            <div className="ui-folha-corpo" onPointerDown={(e) => e.stopPropagation()}>
              {children}
            </div>
            {rodape && <footer className="ui-folha-rodape">{rodape}</footer>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
