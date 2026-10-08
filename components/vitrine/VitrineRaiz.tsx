"use client";

// A raiz da página pública: veste o tema do negócio.
// O servidor já manda as cores (sem "piscar" o padrão); quando o banco
// carrega no navegador, as cores dele valem — é assim que uma mudança feita
// no painel aparece na página na hora, na demonstração.

import { useEffect, type ReactNode } from "react";
import { MotionConfig } from "motion/react";
import { useLoja } from "@/lib/dados/loja";
import { variaveisTema } from "@/lib/cor";
import type { Pele, Tema } from "@/lib/tipos";

export function VitrineRaiz({ tema, pele, children }: { tema: Tema; pele: Pele; children: ReactNode }) {
  const { banco } = useLoja();
  const temaAtual = banco?.negocio.tema ?? tema;
  const peleAtual = banco?.negocio.pele ?? pele;
  const vars = variaveisTema(temaAtual);

  useEffect(() => {
    const antes = document.body.style.background;
    document.body.style.background = vars["--v-fundo"];
    const meta = document.querySelector('meta[name="theme-color"]');
    const metaAntes = meta?.getAttribute("content");
    meta?.setAttribute("content", vars["--v-fundo"]);
    return () => {
      document.body.style.background = antes;
      if (metaAntes) meta?.setAttribute("content", metaAntes);
    };
  }, [vars["--v-fundo"]]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <MotionConfig reducedMotion="user">
      <div className={`vt pele-${peleAtual}`} style={vars as React.CSSProperties}>
        {children}
      </div>
    </MotionConfig>
  );
}
