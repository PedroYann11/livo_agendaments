// Origem: livo@d74d591 · lib/cor-painel.ts (contraste, mistura, tinta)
//
// A loja escolhe cores; o código garante que o texto continua legível.
// Nada que venha de configuração vira CSS sem passar por `hexValido`.

import type { Tema } from "./tipos";

export function hexValido(v: unknown): v is string {
  return typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v);
}

function canais(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}

function paraHex(c: number[]): string {
  return "#" + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");
}

export function luminancia(hex: string): number {
  const [r, g, b] = canais(hex)
    .map((c) => c / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contraste(a: string, b: string): number {
  const [x, y] = [luminancia(a), luminancia(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

/** `peso` de `a` sobre `b`, como color-mix(in srgb, a peso%, b). */
export function misturar(a: string, b: string, peso: number): string {
  const ca = canais(a);
  const cb = canais(b);
  return paraHex(ca.map((c, i) => c * peso + cb[i] * (1 - peso)));
}

/** Branco ou preto — o que lê melhor por cima da cor. */
export function textoSobre(cor: string): string {
  return contraste(cor, "#ffffff") >= contraste(cor, "#111111") ? "#ffffff" : "#111111";
}

/** A cor usada como TEXTO sobre um fundo: o mesmo tom, ajustado até ler (4,5:1). */
export function tinta(cor: string, fundo: string): string {
  const escurecer = luminancia(fundo) > 0.4;
  let t = cor;
  for (let passo = 1; contraste(t, fundo) < 4.5 && passo <= 20; passo++) {
    t = misturar(escurecer ? "#000000" : "#ffffff", cor, passo * 0.05);
  }
  return t;
}

/** Variáveis CSS de uma pele, a partir do tema da loja. */
export function variaveisTema(tema: Tema): Record<string, string> {
  const ok = (v: string, padrao: string) => (hexValido(v) ? v : padrao);
  const fundo = ok(tema.fundo, "#f7f5f2");
  const superficie = ok(tema.superficie, "#ffffff");
  const texto = ok(tema.texto, "#1c1c20");
  const marca = ok(tema.marca, "#1f5c4b");
  const acento = ok(tema.acento, marca);
  return {
    "--v-fundo": fundo,
    "--v-superficie": superficie,
    "--v-texto": texto,
    "--v-texto-suave": ok(tema.textoSuave, misturar(texto, fundo, 0.62)),
    "--v-marca": marca,
    "--v-sobre-marca": ok(tema.sobreMarca, textoSobre(marca)),
    "--v-marca-tinta": tinta(marca, fundo),
    "--v-acento": acento,
    "--v-linha": misturar(texto, fundo, 0.12),
    "--v-sutil": misturar(texto, fundo, 0.05),
    "--v-marca-sutil": misturar(marca, superficie, 0.1),
  };
}

/** A cor do painel: a da marca, com a tinta garantida sobre o branco. */
export function variaveisPainel(marca: string): Record<string, string> {
  const cor = hexValido(marca) ? marca : "#1f5c4b";
  return {
    "--p-marca": cor,
    "--p-sobre-marca": textoSobre(cor),
    "--p-marca-tinta": tinta(cor, "#ffffff"),
    "--p-marca-sutil": misturar(cor, "#ffffff", 0.09),
    "--p-marca-media": misturar(cor, "#ffffff", 0.22),
  };
}
