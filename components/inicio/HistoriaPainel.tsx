"use client";

import { useEffect, useRef, useState } from "react";
import { Tela } from "./Tela";

export type CenaPainel = { tela: string; alt: string; titulo: string; texto: string };

/**
 * O lado do dono contado em cenas. No computador o celular fica parado e a
 * tela troca conforme os textos rolam; no celular, as cenas viram um trilho
 * que rola de lado (só CSS).
 */
export function HistoriaPainel({ cenas }: { cenas: CenaPainel[] }) {
  const [ativa, setAtiva] = useState(0);
  const lista = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = lista.current;
    if (!el || !("IntersectionObserver" in window)) return;
    const obs = new IntersectionObserver(
      (entradas) => {
        for (const e of entradas) if (e.isIntersecting) setAtiva(Number((e.target as HTMLElement).dataset.cena));
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    el.querySelectorAll("[data-cena]").forEach((c) => obs.observe(c));
    return () => obs.disconnect();
  }, []);

  return (
    <div className="lv-historia">
      <div className="lv-historia-cenas" ref={lista}>
        {cenas.map((c, i) => (
          <article key={c.tela} data-cena={i} data-ativa={i === ativa}>
            <span className="lv-historia-tela">
              <Tela nome={c.tela} alt={c.alt} />
            </span>
            <h3>{c.titulo}</h3>
            <p>{c.texto}</p>
          </article>
        ))}
      </div>
      <div className="lv-historia-fixo" aria-hidden="true">
        <span className="lv-aparelho">
          {cenas.map((c, i) => (
            <img
              key={c.tela}
              src={`/inicio/${c.tela}-780.webp`}
              width={390}
              height={844}
              alt=""
              loading="lazy"
              decoding="async"
              data-ativa={i === ativa}
            />
          ))}
        </span>
      </div>
    </div>
  );
}
