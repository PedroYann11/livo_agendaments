// Dinheiro, números e textos curtos — sempre pt-BR.

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const BRL_INTEIRO = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

export function brl(valor: number): string {
  return BRL.format(valor || 0);
}

/** R$ 1.240 — para cabeçalhos e números grandes, sem centavos. */
export function brlCurto(valor: number): string {
  if (Math.abs(valor) >= 100_000) {
    return "R$ " + (valor / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 0 }) + " mil";
  }
  return BRL_INTEIRO.format(valor || 0);
}

export function numero(valor: number): string {
  return (valor || 0).toLocaleString("pt-BR");
}

export function pct(valor: number, casas = 0): string {
  return (Number.isFinite(valor) ? valor * 100 : 0).toLocaleString("pt-BR", {
    maximumFractionDigits: casas,
    minimumFractionDigits: casas,
  }) + "%";
}

/** 90 → "1h 30min", 45 → "45 min", 60 → "1h" */
export function duracao(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}min` : `${h}h`;
}

export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return "?";
  const a = partes[0][0] ?? "";
  const b = partes.length > 1 ? partes[partes.length - 1][0] : "";
  return (a + b).toUpperCase();
}

export function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] ?? "";
}

export function plural(n: number, um: string, varios: string): string {
  return `${numero(n)} ${n === 1 ? um : varios}`;
}

/** Remove acentos e caixa — para busca. */
export function normalizar(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}
