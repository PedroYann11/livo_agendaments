"use client";

import { useEffect } from "react";

/**
 * Rede de segurança do aviso de navegador antigo (NavegadorAntigo): se o
 * React chegou a rodar, o navegador é novo o bastante — o aviso some, mesmo
 * que o teste (public/compat/moderno.js) não tenha carregado por algum tropeço.
 */
export function AvisoRodou() {
  useEffect(() => {
    document.getElementById("navegador-antigo")?.setAttribute("hidden", "");
  }, []);
  return null;
}
