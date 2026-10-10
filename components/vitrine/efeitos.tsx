"use client";

// =====================================================================
// Os efeitos da página pública. Poucos, e com propósito:
//   Emergir  — o título entra palavra a palavra, saindo do desfoque
//              (ideia do "Text Emerge" do Originkit, feita com Motion);
//   Revelar  — blocos sobem 14px e aparecem uma vez ao entrar na tela;
//   Arte     — o fundo do herói, um por pele, todo em CSS (sem WebGL:
//              tem que abrir rápido no navegador do Instagram).
// Tudo respeita "reduzir movimento" (MotionConfig na raiz + CSS).
// =====================================================================

import type { ReactNode } from "react";
import { motion } from "motion/react";
import type { Pele } from "@/lib/tipos";

const SAIDA = [0.23, 1, 0.32, 1] as const;

export function Emergir({ texto, atraso = 0.08 }: { texto: string; atraso?: number }) {
  const palavras = texto.trim().split(/\s+/);
  return (
    <span aria-label={texto}>
      {palavras.map((p, i) => (
        <span key={i} aria-hidden="true">
          <motion.span
            className="vt-palavra"
            initial={{ opacity: 0, y: "0.35em", filter: "blur(10px)", scale: 0.96 }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)", scale: 1 }}
            transition={{ duration: 0.75, delay: atraso + i * 0.065, ease: SAIDA }}
          >
            {p}
          </motion.span>
          {i < palavras.length - 1 ? " " : ""}
        </span>
      ))}
    </span>
  );
}

export function Revelar({ children, atraso = 0, className }: { children: ReactNode; atraso?: number; className?: string }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.6, delay: atraso, ease: SAIDA }}
    >
      {children}
    </motion.div>
  );
}

/** desenho = false ("Enfeite do topo: nenhum" no painel): fica só o fundo, sem a figura do canto */
export function Arte({ pele, nome, desenho = true }: { pele: Pele; nome: string; desenho?: boolean }) {
  if (pele === "beleza") {
    return (
      <div className="vt-arte" aria-hidden="true">
        <span className="vt-aurora a1" />
        <span className="vt-aurora a2" />
        {desenho && (
          <svg className="vt-arco" viewBox="0 0 200 280" fill="none">
            <path d="M10 280V100a90 90 0 0 1 180 0v180" stroke="currentColor" strokeWidth="1" />
            <path d="M34 280V104a66 66 0 0 1 132 0v176" stroke="currentColor" strokeWidth="1" />
          </svg>
        )}
        <span className="vt-grao" />
      </div>
    );
  }
  if (pele === "barbearia") {
    return (
      <div className="vt-arte" aria-hidden="true">
        <span className="vt-raios" />
        {desenho && <span className="vt-vazado">{nome.split(" ")[0]}</span>}
        {desenho && <span className="vt-poste" />}
        <span className="vt-grao" />
      </div>
    );
  }
  if (pele === "delicada") {
    return (
      <div className="vt-arte" aria-hidden="true">
        <span className="vt-bolha b1" />
        <span className="vt-bolha b2" />
        {desenho && (
          <svg className="vt-brilhos" width="60" height="60" viewBox="0 0 60 60" fill="currentColor">
            <path d="M30 6c1.6 9.6 4.4 12.4 14 14-9.6 1.6-12.4 4.4-14 14-1.6-9.6-4.4-12.4-14-14 9.6-1.6 12.4-4.4 14-14Z" />
            <path d="M48 36c.8 4.8 2.2 6.2 7 7-4.8.8-6.2 2.2-7 7-.8-4.8-2.2-6.2-7-7 4.8-.8 6.2-2.2 7-7Z" opacity=".6" />
          </svg>
        )}
        <span className="vt-grao" />
      </div>
    );
  }
  return (
    <div className="vt-arte" aria-hidden="true">
      {desenho && <span className="vt-grade-fundo" />}
    </div>
  );
}
