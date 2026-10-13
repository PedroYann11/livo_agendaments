// =====================================================================
// O arquivo da agenda de um agendamento, servido pelo site.
//
// "Adicionar à minha agenda" aponta para cá. Como chega com o tipo
// text/calendar, o iPhone abre direto o Calendário com o evento pronto
// (o download pelo navegador só guardava o arquivo em Arquivos); no
// Android e no computador, baixa o .ics como antes.
//
// Mesma porta e mesmo guarda da página /<negocio>/a/<token>: o negócio
// vem do endereço (resolverPagina, falha fechado) e o agendamento só
// sai pelo token, pela RPC pública agendamento_publico — nada além do
// que o cliente já vê no link dele.
// =====================================================================

import { resolverPagina } from "@/lib/negocio-server";
import { supabaseAnonimo } from "@/lib/supabase";
import { agendamentoDe, type Link } from "@/lib/dados/remoto";
import { dadosIcs, gerarIcs } from "@/lib/ics";

const TOKEN = /^[a-z0-9]{6,64}$/;

function naoEncontrado() {
  return new Response("Agendamento não encontrado.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}

export async function GET(req: Request, { params }: { params: Promise<{ negocio: string; token: string }> }) {
  const { negocio, token } = await params;
  if (!TOKEN.test(token)) return naoEncontrado();
  const pagina = await resolverPagina(negocio.toLowerCase());
  const sb = supabaseAnonimo();
  if (!pagina?.banco || !sb) return naoEncontrado();

  const { data, error } = await sb.rpc("agendamento_publico", { p_slug: pagina.publico.slug, p_token: token });
  const link = data as Link | null;
  if (error || !link?.agendamento) return naoEncontrado();

  const ag = agendamentoDe(link.agendamento);
  const origem = new URL(req.url).origin;
  return new Response(gerarIcs(dadosIcs(pagina.banco, ag, origem)), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `inline; filename="${pagina.publico.slug}.ics"`,
      // é de uma pessoa só: nada de cache compartilhado nem de buscador
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
