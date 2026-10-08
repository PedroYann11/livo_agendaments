// Origem: livo@d74d591 · lib/masks.ts (máscaras de telefone, nome e dinheiro)

/** Formata telefone brasileiro conforme digita: (88) 9 9271-7158 */
export function mascaraTelefone(valor: string): string {
  const d = valor.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "").slice(0, 11);
  if (d.length === 0) return "";
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 3) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2, 3)} ${d.slice(3)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 3)} ${d.slice(3, 7)}-${d.slice(7, 11)}`;
}

/** Só os dígitos do telefone (para salvar/enviar), sem o 55. */
export function apenasDigitos(valor: string): string {
  return valor.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
}

export function telefoneValido(valor: string): boolean {
  const d = apenasDigitos(valor);
  return d.length === 10 || d.length === 11;
}

const MINUSCULAS = new Set(["de", "da", "do", "das", "dos", "e", "a", "o"]);

/** Primeira letra de cada palavra em maiúscula (respeita "de", "da"...) */
export function capitalizarNome(valor: string): string {
  return valor
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((p, i) => (i > 0 && MINUSCULAS.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(" ");
}

export function mascaraCep(valor: string): string {
  const d = valor.replace(/\D/g, "").slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

/**
 * Campo de dinheiro "por centavos": cada dígito empurra os anteriores, como
 * em maquininha. "0","5","0" vira 0,05 e depois 0,50.
 */
export function centavosParaReais(bruto: string): number {
  const digitos = bruto.replace(/\D/g, "");
  if (!digitos) return 0;
  return parseInt(digitos, 10) / 100;
}

export function formatarValorCampo(valor: number): string {
  return (Number.isFinite(valor) ? valor : 0).toFixed(2).replace(".", ",");
}
