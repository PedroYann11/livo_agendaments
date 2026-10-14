// =====================================================================
// O que a edge "avisos" faz, sem depender de rede nem de Supabase: quem
// chama entrega o acesso ao banco (rpc), o web-push e o fetch. Assim o
// mesmo código roda na Supabase (index.ts) e no teste local.
//
// Origem: livo@d74d591 · supabase/functions/notify-new-order/index.ts
// (segredoConfere copiado igual; o resto adaptado: o texto vem pronto do
// banco, as chaves VAPID nascem aqui e o acesso ao banco é só por RPC)
// =====================================================================

export type Rpc = (nome: string, args?: Record<string, unknown>) => Promise<unknown>;

type Detalhes = { method: string; headers: Record<string, string | number>; body: BodyInit | null; endpoint: string };

export type Dependencias = {
  rpc: Rpc;
  webpush: {
    generateVAPIDKeys(): { publicKey: string; privateKey: string };
    generateRequestDetails(
      assinatura: { endpoint: string; keys: { p256dh: string; auth: string } },
      corpo: string,
      opcoes: Record<string, unknown>,
    ): Detalhes;
  };
  fetch: typeof fetch;
};

type Chaves = { publicKey: string; privateKey: string };
type Destino = { id: string; endpoint: string; p256dh: string; auth: string };

/** Quem manda os avisos, para o serviço de push (Apple exige URL ou mailto). */
const ASSUNTO = "https://agenda.livo.tec.br";
/** Celular desligado por mais de um dia: o aviso já não ajuda. */
const VALIDADE_S = 24 * 60 * 60;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * [H-3] Compara o segredo sem short-circuit.
 *
 * `verify_jwt: false` está correto nesta function — quem a chama é o próprio
 * Postgres via pg_net, sem Bearer. Isso faz do header `x-avisos-segredo` o
 * ÚNICO gate de autenticação, então ele merece uma comparação que não vaze
 * informação pelo tempo de execução.
 */
export function segredoConfere(recebido: string, esperado: string): boolean {
  const enc = new TextEncoder();
  const a = enc.encode(recebido);
  const b = enc.encode(esperado);

  let diff = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return diff === 0;
}

function resposta(dados: unknown, status = 200) {
  return new Response(JSON.stringify(dados), { status, headers: { "Content-Type": "application/json" } });
}

const texto = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

/** O par VAPID do Vault; na primeira vez, nasce aqui e é guardado lá. */
async function garantirChaves(d: Dependencias): Promise<Chaves> {
  const [pub, priv] = await Promise.all([
    d.rpc("aviso_segredo", { p_nome: "avisos_vapid_publica" }),
    d.rpc("aviso_segredo", { p_nome: "avisos_vapid_privada" }),
  ]);
  if (typeof pub === "string" && typeof priv === "string") return { publicKey: pub, privateKey: priv };

  const novas = d.webpush.generateVAPIDKeys();
  const vale = await d.rpc("aviso_chaves_guardar", { p_publica: novas.publicKey, p_privada: novas.privateKey });
  if (vale === novas.publicKey) return novas;
  // outra chamada guardou primeiro: vale o par dela
  const privada = await d.rpc("aviso_segredo", { p_nome: "avisos_vapid_privada" });
  if (typeof vale !== "string" || typeof privada !== "string") throw new Error("par VAPID incompleto no Vault");
  return { publicKey: vale, privateKey: privada };
}

/** Cifra e entrega a um aparelho. 404/410: o aparelho não existe mais. */
async function entregar(d: Dependencias, chaves: Chaves, tenant: string, a: Destino, corpo: string) {
  try {
    const det = d.webpush.generateRequestDetails(
      { endpoint: a.endpoint, keys: { p256dh: a.p256dh, auth: a.auth } },
      corpo,
      { vapidDetails: { subject: ASSUNTO, ...chaves }, TTL: VALIDADE_S, urgency: "high" },
    );
    // o tamanho o fetch calcula sozinho; TTL vem como número
    const cabecalhos = Object.fromEntries(Object.entries(det.headers)
      .filter(([k]) => k.toLowerCase() !== "content-length").map(([k, v]) => [k, String(v)]));
    const r = await d.fetch(det.endpoint, { method: det.method, headers: cabecalhos, body: det.body });
    if (r.status === 404 || r.status === 410) {
      await d.rpc("aviso_esquecer", { p_tenant: tenant, p_id: a.id });
      return "esquecido";
    }
    if (!r.ok) {
      console.warn(`push ${r.status} em ${new URL(a.endpoint).host}: ${(await r.text()).slice(0, 200)}`);
      return "falhou";
    }
    return "enviado";
  } catch (e) {
    console.error(e);
    return "falhou";
  }
}

export async function tratar(req: Request, d: Dependencias): Promise<Response> {
  if (req.method !== "POST") return resposta({ ok: false }, 405);
  try {
    // segredo ausente no Vault nunca pode virar "qualquer header serve"
    const esperado = await d.rpc("aviso_segredo", { p_nome: "avisos_segredo" });
    if (typeof esperado !== "string" || esperado === "" ||
        !segredoConfere(req.headers.get("x-avisos-segredo") ?? "", esperado)) {
      return resposta({ ok: false }, 401);
    }

    const pedido = await req.json().catch(() => null);
    const chaves = await garantirChaves(d);
    if (pedido?.acao === "preparar") return resposta({ ok: true, chave: chaves.publicKey });
    if (pedido?.acao !== "avisar") return resposta({ ok: false, erro: "ação desconhecida" }, 400);

    // sem tenant_id não há como escopar o envio: recusa em vez de arriscar
    const tenant = pedido.tenant_id;
    const usuario = pedido.usuario_id ?? null;
    if (typeof tenant !== "string" || !UUID.test(tenant) || (usuario !== null && (typeof usuario !== "string" || !UUID.test(usuario)))) {
      return resposta({ ok: false, erro: "negócio inválido" }, 400);
    }
    const corpo = JSON.stringify({
      titulo: texto(pedido.aviso?.titulo, 120),
      corpo: texto(pedido.aviso?.corpo, 300),
      url: texto(pedido.aviso?.url, 200).startsWith("/painel") ? texto(pedido.aviso?.url, 200) : "/painel",
      tag: texto(pedido.aviso?.tag, 120),
    });

    // só os aparelhos do MESMO negócio (e, no teste, só os de quem pediu)
    const destinos = ((await d.rpc("aviso_destinos", { p_tenant: tenant, p_usuario: usuario })) ?? []) as Destino[];
    const resultados = await Promise.all(destinos.map((a) => entregar(d, chaves, tenant, a, corpo)));
    const conta = (r: string) => resultados.filter((x) => x === r).length;
    return resposta({ ok: true, enviados: conta("enviado"), esquecidos: conta("esquecido"), falhas: conta("falhou") });
  } catch (e) {
    console.error(e);
    return resposta({ ok: false, erro: String(e) }, 500);
  }
}
