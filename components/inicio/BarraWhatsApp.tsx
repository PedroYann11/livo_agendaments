"use client";

import { useEffect, useState } from "react";
import { Icone } from "@/components/ui/Icone";
import { linkWhatsAppLivo, MENSAGENS } from "@/lib/comercial";

/**
 * Barra fixa no celular: aparece depois que o topo sai da tela e some quando
 * o fechamento (que já tem o mesmo botão) aparece.
 */
export function BarraWhatsApp() {
  const [visivel, setVisivel] = useState(false);

  useEffect(() => {
    const alvos = document.querySelectorAll("[data-esconde-barra]");
    if (!alvos.length || !("IntersectionObserver" in window)) return;
    const vistos = new Set<Element>();
    const obs = new IntersectionObserver((entradas) => {
      for (const e of entradas) e.isIntersecting ? vistos.add(e.target) : vistos.delete(e.target);
      setVisivel(vistos.size === 0);
    });
    alvos.forEach((a) => obs.observe(a));
    return () => obs.disconnect();
  }, []);

  return (
    <div className="lv-barra" data-visivel={visivel} aria-hidden={!visivel}>
      <a href={linkWhatsAppLivo(MENSAGENS.topo)} target="_blank" rel="noopener noreferrer" className="lv-botao" tabIndex={visivel ? 0 : -1}>
        <Icone nome="whatsapp" tamanho={20} />
        Chamar no WhatsApp
      </a>
    </div>
  );
}
