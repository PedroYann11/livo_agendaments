/** Identificador aleatório. No backend, o Postgres gera uuid; aqui, o navegador. */
export function novoId(prefixo = ""): string {
  const c = globalThis.crypto;
  const base =
    c && "randomUUID" in c
      ? c.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return prefixo ? `${prefixo}_${base}` : base;
}

/** Token curto e difícil de adivinhar para links públicos. */
export function novoToken(): string {
  const bytes = new Uint8Array(12);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => "abcdefghjkmnpqrstuvwxyz23456789"[b % 31]).join("");
}
