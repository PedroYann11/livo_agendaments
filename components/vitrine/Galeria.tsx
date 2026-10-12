"use client";

// =====================================================================
// As fotos do espaço na página: faixa que desliza no celular, grade no
// computador. Tocar abre a foto inteira (setas, deslizar, Esc fecha).
// =====================================================================

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Icone } from "@/components/ui/Icone";

export function Galeria({ fotos, nome }: { fotos: string[]; nome: string }) {
  const [aberta, setAberta] = useState<number | null>(null);
  if (!fotos.length) return null;
  return (
    <>
      <div className="vt-galeria">
        {fotos.map((url, i) => (
          <button key={url} type="button" className="vt-galeria-foto" onClick={() => setAberta(i)} aria-label={`Ver a foto ${i + 1} de ${fotos.length}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={`Foto ${i + 1} de ${nome}`} loading="lazy" decoding="async" />
          </button>
        ))}
      </div>
      <AnimatePresence>
        {aberta !== null && <Visualizar fotos={fotos} nome={nome} inicial={aberta} onFechar={() => setAberta(null)} />}
      </AnimatePresence>
    </>
  );
}

function Visualizar({ fotos, nome, inicial, onFechar }: { fotos: string[]; nome: string; inicial: number; onFechar: () => void }) {
  const [i, setI] = useState(inicial);
  const fechar = useRef<HTMLButtonElement>(null);
  const toque = useRef<number | null>(null);
  const ir = (d: number) => setI((x) => (x + d + fotos.length) % fotos.length);

  useEffect(() => {
    fechar.current?.focus();
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") onFechar();
      if (e.key === "ArrowRight") setI((x) => (x + 1) % fotos.length);
      if (e.key === "ArrowLeft") setI((x) => (x - 1 + fotos.length) % fotos.length);
    };
    window.addEventListener("keydown", tecla);
    return () => {
      document.body.style.overflow = antes;
      window.removeEventListener("keydown", tecla);
    };
  }, [fotos.length, onFechar]);

  return (
    <motion.div
      className="vt-visor"
      role="dialog"
      aria-modal="true"
      aria-label={`Fotos de ${nome}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onClick={(e) => e.target === e.currentTarget && onFechar()}
      onPointerDown={(e) => (toque.current = e.clientX)}
      onPointerUp={(e) => {
        if (toque.current === null) return;
        const dx = e.clientX - toque.current;
        toque.current = null;
        if (Math.abs(dx) > 50 && fotos.length > 1) ir(dx < 0 ? 1 : -1);
      }}
    >
      <AnimatePresence mode="wait" initial={false}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <motion.img
          key={fotos[i]}
          src={fotos[i]}
          alt={`Foto ${i + 1} de ${nome}`}
          draggable={false}
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
        />
      </AnimatePresence>
      <button ref={fechar} type="button" className="vt-visor-botao vt-visor-fechar" onClick={onFechar} aria-label="Fechar">
        <Icone nome="fechar" tamanho={22} />
      </button>
      {fotos.length > 1 && (
        <>
          <button type="button" className="vt-visor-botao vt-visor-antes" onClick={() => ir(-1)} aria-label="Foto anterior">
            <Icone nome="esquerda" tamanho={22} />
          </button>
          <button type="button" className="vt-visor-botao vt-visor-depois" onClick={() => ir(1)} aria-label="Próxima foto">
            <Icone nome="direita" tamanho={22} />
          </button>
          <span className="vt-visor-conta" aria-live="polite">
            {i + 1} / {fotos.length}
          </span>
        </>
      )}
    </motion.div>
  );
}
