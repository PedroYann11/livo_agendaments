"use client";

// A foto do topo da página (Minha página › Topo da página). Com o fundo
// tirado, a pessoa sai de uma forma na cor da página (arco, bloco, forma
// orgânica ou cartão, conforme o estilo); sem recorte, a foto vai dentro da
// moldura do estilo.
//   canto — celular: ao lado do logo, no canto direito
//   lado  — computador: grande, na coluna da direita

import { motion } from "motion/react";

export function RetratoTopo({ url, semFundo, alt, variante }: { url: string; semFundo: string | null; alt: string; variante: "canto" | "lado" }) {
  const entrada = {
    initial: { opacity: 0, y: 14 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.9, delay: 0.1, ease: [0.23, 1, 0.32, 1] as const },
  };
  if (semFundo) {
    return (
      <motion.figure className={`vt-retrato-recorte ${variante}`} {...entrada}>
        <Recorte src={semFundo} alt={alt} />
      </motion.figure>
    );
  }
  return (
    <motion.figure className={`vt-moldura vt-retrato-foto ${variante}`} {...entrada}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={alt} decoding="async" />
    </motion.figure>
  );
}

/** A pessoa sem fundo "saindo" da forma do estilo — no topo e no Sobre (dentro de .vt-retrato-recorte). */
export function Recorte({ src, alt, preguicoso = false }: { src: string; alt: string; preguicoso?: boolean }) {
  return (
    <>
      <span className="vt-moldura vt-retrato-fundo" aria-hidden="true" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} decoding="async" loading={preguicoso ? "lazy" : undefined} />
    </>
  );
}
