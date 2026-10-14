// =====================================================================
// Edge function "avisos": entrega no celular do dono os avisos que o
// banco monta (migration 013). Publicada com verify_jwt: false — quem
// chama é o Postgres, pelo pg_net; o portão é o segredo do Vault (nucleo.ts).
//
//   { acao: "preparar" }  gera o par VAPID (uma vez) e o guarda no Vault
//   { acao: "avisar", tenant_id, usuario_id?, aviso: { titulo, corpo, url, tag } }
//
// Origem: livo@d74d591 · supabase/functions/notify-new-order/index.ts
// =====================================================================
import webpush from "npm:web-push@3.6.7";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { tratar } from "./nucleo.ts";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

async function rpc(nome: string, args: Record<string, unknown> = {}) {
  const { data, error } = await admin.rpc(nome, args);
  if (error) throw new Error(`${nome}: ${error.message}`);
  return data;
}

Deno.serve((req) => tratar(req, { rpc, webpush, fetch }));
