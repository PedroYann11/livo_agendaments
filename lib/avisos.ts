// =====================================================================
// Avisos no celular (Web Push) — o lado do aparelho.
//
// O aparelho pede permissão, assina o push com a chave pública VAPID do
// servidor e entrega a assinatura ao banco (aviso_aparelho_salvar). A chave
// privada nunca sai do Supabase (migration 013, edge "avisos").
//
// No iPhone o push só existe com o painel na Tela de Início (iOS 16.4+),
// aberto pelo ícone — e só pelo Safari.
//
// Origem: livo@d74d591 · lib/push.ts (adaptado: a chave vem do banco, as
// portas são por negócio e o service worker cuida só do /painel)
// =====================================================================

import { chamar } from "@/lib/dados/remoto";

/** Por que este aparelho não recebe avisos (ou "ok"). */
export type MotivoSemAviso = "ok" | "ios-precisa-safari" | "ios-precisa-instalar" | "ios-versao-antiga" | "sem-suporte";

export type SituacaoAvisos = {
  motivo: MotivoSemAviso;
  /** a pessoa bloqueou os avisos deste site no aparelho */
  negado: boolean;
  /** este aparelho está recebendo */
  ligado: boolean;
  /** sem a chave pública, o servidor ainda não está pronto */
  chave: string | null;
  /** aparelhos do negócio que recebem avisos */
  aparelhos: number;
};

type DoBanco = { chave: string | null; esteAparelho: boolean; aparelhos: number };

const ESCOPO = "/painel";

export function suportaAvisos(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

/** O painel está aberto pelo ícone da Tela de Início (e não numa aba)? */
export function rodandoInstalado(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(display-mode: standalone)").matches === true || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/**
 * iPad se apresenta como "Macintosh" desde o iPadOS 13: o sinal é ser Mac com
 * toque. No iOS, Chrome (CriOS), Firefox (FxiOS) e outros também "adicionam à
 * Tela de Início", mas sai um atalho sem push — só o Safari instala de verdade.
 */
export function plataforma(): "ios-safari" | "ios-outro" | "android" | "outro" {
  if (typeof navigator === "undefined") return "outro";
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && (navigator.maxTouchPoints ?? 0) > 1);
  if (ios) return /CriOS|FxiOS|EdgiOS|OPiOS|GSA/i.test(ua) ? "ios-outro" : "ios-safari";
  if (/Android/i.test(ua)) return "android";
  return "outro";
}

export function motivoSemAviso(): MotivoSemAviso {
  if (suportaAvisos()) return "ok";
  const p = plataforma();
  if (p === "ios-outro") return "ios-precisa-safari";
  // no iOS o push só aparece dentro do app instalado: "não instalado" vem antes de "antigo"
  if (p === "ios-safari") return rodandoInstalado() ? "ios-versao-antiga" : "ios-precisa-instalar";
  return "sem-suporte";
}

/** Para a pessoa reconhecer o aparelho na lista. */
function nomeDoAparelho(): string {
  const ua = navigator.userAgent;
  if (/iPad/i.test(ua) || (/Macintosh/.test(ua) && (navigator.maxTouchPoints ?? 0) > 1)) return "iPad";
  if (/iPhone|iPod/i.test(ua)) return "iPhone";
  if (/Android/i.test(ua)) return "Android";
  return "Computador";
}

function bytesDaChave(base64url: string): Uint8Array<ArrayBuffer> {
  const b64 = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const bruto = atob(b64);
  const bytes = new Uint8Array(bruto.length);
  for (let i = 0; i < bruto.length; i++) bytes[i] = bruto.charCodeAt(i);
  return bytes;
}

function mesmaChave(atual: ArrayBuffer | null | undefined, desejada: Uint8Array): boolean {
  if (!atual) return false;
  const a = new Uint8Array(atual);
  return a.length === desejada.length && a.every((x, i) => x === desejada[i]);
}

async function assinaturaAtual(): Promise<PushSubscription | null> {
  if (!suportaAvisos()) return null;
  const reg = await navigator.serviceWorker.getRegistration(ESCOPO);
  return (await reg?.pushManager.getSubscription()) ?? null;
}

export async function lerSituacao(slug: string): Promise<SituacaoAvisos> {
  const motivo = motivoSemAviso();
  const sub = motivo === "ok" ? await assinaturaAtual().catch(() => null) : null;
  const r = await chamar<DoBanco>("aviso_situacao", { p_slug: slug, p_endpoint: sub?.endpoint ?? null });
  const negado = motivo === "ok" && Notification.permission === "denied";
  return { motivo, negado, ligado: Boolean(sub) && r.esteAparelho && !negado, chave: r.chave, aparelhos: r.aparelhos };
}

/**
 * Liga os avisos neste aparelho. Chamar direto do toque: o iPhone só aceita
 * o pedido de permissão dentro do gesto, então ele vem antes de qualquer espera.
 */
export async function ligarAvisos(slug: string, chave: string): Promise<void> {
  if (!suportaAvisos()) throw new Error("Este navegador não recebe avisos.");
  const permissao = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
  if (permissao !== "granted") throw new Error("Sem permissão para avisos neste aparelho.");

  if (!(await navigator.serviceWorker.getRegistration(ESCOPO))) await navigator.serviceWorker.register("/sw.js", { scope: ESCOPO });
  // `ready` só resolve com o service worker ATIVO: assinar antes disso falha às vezes
  const reg = await navigator.serviceWorker.ready;

  // uma assinatura velha, com outra chave, fica presa no navegador e impede a nova
  const bytes = bytesDaChave(chave);
  let sub = await reg.pushManager.getSubscription();
  if (sub && !mesmaChave(sub.options?.applicationServerKey, bytes)) {
    await sub.unsubscribe().catch(() => {});
    sub = null;
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes });

  const j = sub.toJSON();
  if (!j.endpoint || !j.keys?.p256dh || !j.keys?.auth) throw new Error("O navegador não entregou a assinatura completa.");
  await chamar("aviso_aparelho_salvar", { p_slug: slug, p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth, p_nome: nomeDoAparelho() });
}

export async function desligarAvisos(slug: string): Promise<void> {
  const sub = await assinaturaAtual();
  if (!sub) return;
  await chamar("aviso_aparelho_remover", { p_slug: slug, p_endpoint: sub.endpoint });
  await sub.unsubscribe().catch(() => {});
}

export async function testarAvisos(slug: string): Promise<void> {
  await chamar("aviso_teste", { p_slug: slug });
}
