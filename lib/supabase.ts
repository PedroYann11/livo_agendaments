// Origem: livo@d74d591 · lib/supabase.ts (cliente único, chave pública)
//
// Só a chave PUBLICÁVEL (anon) entra no navegador. A autorização de verdade
// é a RLS do banco; nada aqui decide o que alguém pode ver.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL_SB = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const CHAVE = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/** Há backend configurado? Sem ele, o app roda só em demonstração. */
export const supabaseOn = Boolean(URL_SB && CHAVE);

export const demoLiberada = process.env.NEXT_PUBLIC_DEMO !== "0";

let cliente: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!supabaseOn) throw new Error("Supabase não configurado");
  if (!cliente) {
    cliente = createClient(URL_SB, CHAVE, {
      auth: { persistSession: typeof window !== "undefined", autoRefreshToken: true },
    });
  }
  return cliente;
}

/** Cliente sem sessão, para leituras públicas no servidor (uma por request). */
export function supabaseAnonimo(): SupabaseClient | null {
  if (!supabaseOn) return null;
  return createClient(URL_SB, CHAVE, { auth: { persistSession: false, autoRefreshToken: false } });
}
