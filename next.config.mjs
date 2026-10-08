/** @type {import('next').NextConfig} */

// =====================================================================
// Origem: livo@d74d591 · next.config.mjs (headers de segurança + CSP)
//
// A CSP é montada a partir das origens que o app REALMENTE usa. Recurso
// externo novo precisa entrar aqui, senão o navegador bloqueia em silêncio.
//
// Origens em uso:
//   - Supabase: REST/Auth (https) + Realtime (wss) + Storage;
//   - BrasilAPI: feriados nacionais (painel › funcionamento) e CEP;
//   - ViaCEP: endereço por CEP (cadastro do negócio e do cliente);
//   - blob:/data: — prévia de foto antes do upload.
// Links de saída (wa.me, instagram.com, maps) são navegação, não subrecurso.
// =====================================================================

const supabaseOrigin = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin;
  } catch {
    return null;
  }
})();
const supabaseHttp = supabaseOrigin ?? "https:";
const supabaseWs = supabaseOrigin ? supabaseOrigin.replace(/^https:/, "wss:") : "wss:";

const scriptSrc = [
  "'self'",
  // Next injeta scripts inline de hidratação sem nonce. Mitigante: o app não
  // tem sink de HTML dinâmico (zero dangerouslySetInnerHTML/innerHTML/eval).
  "'unsafe-inline'",
  process.env.NODE_ENV === "development" ? "'unsafe-eval'" : null,
].filter(Boolean);

const csp = [
  "default-src 'self'",
  `script-src ${scriptSrc.join(" ")}`,
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  `img-src 'self' data: blob: ${supabaseHttp}`,
  `connect-src 'self' ${supabaseHttp} ${supabaseWs} https://brasilapi.com.br https://viacep.com.br`,
  "worker-src 'self'",
  "manifest-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
