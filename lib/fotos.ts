// =====================================================================
// Fotos do negócio: preparar no navegador, enviar, apagar.
// Origem da ideia: livo@d74d591 · lib/image.ts (processarFoto)
//
// Preparar: redesenha a foto num canvas, no tamanho certo, e gera um JPEG
// novo. Isso deixa a foto leve E tira os dados escondidos que vêm das fotos
// do celular (localização GPS, modelo do aparelho), porque o canvas só
// carrega os pixels.
//
// Enviar: com banco, vai para o Storage em fotos/<negócio>/<pasta>/<id>.jpg
// (a RLS da migration 011 só deixa dono e administrador, e só na pasta do
// próprio negócio). Sem banco (modo local), vira um data URL menor.
//
// Faxina: foto trocada ou removida continua no Storage até a faxina, que
// apaga o que nenhuma parte da página usa há mais de um dia (o dia de folga
// protege a foto recém-enviada de um rascunho ainda não salvo).
// =====================================================================

import { getSupabase } from "./supabase";
import { novoId } from "./id";
import type { Banco } from "./tipos";

export type PastaFoto = "retrato" | "galeria" | "equipe";

const BUCKET = "fotos";
const PASTAS: PastaFoto[] = ["retrato", "galeria", "equipe"];
/** o bucket aceita até 2 MB; o JPEG sai bem abaixo disso */
const LIMITE = 1_900_000;

/** Lado maior de cada tipo de foto. A da equipe vira quadrada (é um círculo na página). */
const TAMANHO: Record<PastaFoto, number> = { retrato: 1200, galeria: 1600, equipe: 480 };

export class ErroFoto extends Error {}

async function abrir(arquivo: File): Promise<ImageBitmap | HTMLImageElement> {
  if (!arquivo.type.startsWith("image/")) throw new ErroFoto("Escolha um arquivo de imagem.");
  try {
    // respeita a orientação da câmera (foto "deitada" do celular)
    return await createImageBitmap(arquivo, { imageOrientation: "from-image" });
  } catch {
    const url = URL.createObjectURL(arquivo);
    try {
      return await new Promise<HTMLImageElement>((ok, falha) => {
        const i = new Image();
        i.onload = () => ok(i);
        i.onerror = () => falha(new ErroFoto("Não deu para abrir essa foto. Tente uma em JPG."));
        i.src = url;
      });
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

/** Reduz, corrige a orientação e gera um JPEG limpo (sem GPS nem dados do aparelho). */
export async function prepararFoto(arquivo: File, pasta: PastaFoto, local = false): Promise<Blob> {
  const img = await abrir(arquivo);
  const lado = local ? Math.min(TAMANHO[pasta], 900) : TAMANHO[pasta];
  const quadrada = pasta === "equipe";
  let sx = 0,
    sy = 0,
    sw = img.width,
    sh = img.height;
  if (quadrada) {
    const menor = Math.min(img.width, img.height);
    sx = (img.width - menor) / 2;
    sy = (img.height - menor) / 2;
    sw = sh = menor;
  }
  const escala = Math.min(1, lado / Math.max(sw, sh));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(sw * escala));
  c.height = Math.max(1, Math.round(sh * escala));
  const ctx = c.getContext("2d");
  if (!ctx) throw new ErroFoto("Este navegador não conseguiu preparar a foto.");
  ctx.fillStyle = "#ffffff"; // PNG transparente vira fundo branco, não preto
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
  if ("close" in img) img.close();
  for (const qualidade of [0.86, 0.78, 0.68]) {
    const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, "image/jpeg", qualidade));
    if (blob && blob.size <= LIMITE) return blob;
  }
  throw new ErroFoto("A foto ficou grande demais. Tente outra.");
}

function paraDataUrl(blob: Blob): Promise<string> {
  return new Promise((ok, falha) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result));
    r.onerror = () => falha(new ErroFoto("Não deu para ler a foto."));
    r.readAsDataURL(blob);
  });
}

/** Endereço público de um arquivo do bucket. */
function enderecoPublico(caminho: string): string {
  return getSupabase().storage.from(BUCKET).getPublicUrl(caminho).data.publicUrl;
}

/** O caminho no bucket (negócio/pasta/arquivo) de um endereço nosso; null se a foto não é do Storage. */
export function caminhoNoBucket(url: string | null | undefined): string | null {
  const m = url?.match(/\/storage\/v1\/object\/public\/fotos\/(.+)$/);
  return m ? decodeURIComponent(m[1]) : null;
}

/** Prepara e envia. Devolve o endereço que vai na configuração. */
export async function enviarFoto({ remoto, negocioId, pasta, arquivo }: { remoto: boolean; negocioId: string; pasta: PastaFoto; arquivo: File }): Promise<string> {
  const blob = await prepararFoto(arquivo, pasta, !remoto);
  if (!remoto) return paraDataUrl(blob);
  const caminho = `${negocioId}/${pasta}/${novoId("f").replace(/[^A-Za-z0-9_-]/g, "")}.jpg`;
  const { error } = await getSupabase()
    .storage.from(BUCKET)
    .upload(caminho, await blob.arrayBuffer(), { contentType: "image/jpeg", cacheControl: "31536000", upsert: false });
  if (error) {
    const msg = String(error.message ?? "");
    // o banco ainda sem a migration 011 (a pasta de fotos não existe)
    if (/bucket not found/i.test(msg)) throw new ErroFoto("O envio de fotos ainda não foi liberado nesta conta.");
    if (/row-level security|unauthorized|403/i.test(msg)) throw new ErroFoto("Só o dono ou um administrador envia fotos.");
    if (/exceeded|too large|413/i.test(msg)) throw new ErroFoto("A foto ficou grande demais. Tente outra.");
    throw new ErroFoto("Não deu para enviar a foto. Confira a internet e tente de novo.");
  }
  return enderecoPublico(caminho);
}

/** Envia a foto sem fundo (já pronta, PNG ou WebP) para a pasta da Sua foto. */
export async function enviarRecorte({ remoto, negocioId, blob }: { remoto: boolean; negocioId: string; blob: Blob }): Promise<string> {
  if (!remoto) return paraDataUrl(blob);
  const ext = blob.type === "image/webp" ? "webp" : "png";
  const caminho = `${negocioId}/retrato/${novoId("r").replace(/[^A-Za-z0-9_-]/g, "")}.${ext}`;
  const { error } = await getSupabase()
    .storage.from(BUCKET)
    .upload(caminho, await blob.arrayBuffer(), { contentType: blob.type, cacheControl: "31536000", upsert: false });
  if (error) {
    const msg = String(error.message ?? "");
    // banco sem a migration 012: a Supabase recusa pelo tipo (.webp/.png) ou,
    // antes disso, pela regra da pasta. Só dono/admin chega aqui (Configurações).
    if (/mime type|invalid_mime|415|row-level security|unauthorized|403/i.test(msg)) throw new ErroFoto("O recorte ainda não foi liberado nesta conta.");
    throw new ErroFoto("Não deu para enviar o recorte. Confira a internet e tente de novo.");
  }
  return enderecoPublico(caminho);
}

/** Todas as fotos do Storage que alguma parte da página usa. */
function emUso(b: Banco): Set<string> {
  const urls = [b.negocio.retrato?.url, b.negocio.retrato?.semFundo, ...(b.negocio.galeria ?? []), ...b.profissionais.map((p) => p.fotoUrl), ...b.servicos.map((s) => s.fotoUrl)];
  return new Set(urls.map(caminhoNoBucket).filter((c): c is string => !!c));
}

/**
 * Apaga do Storage as fotos do negócio que nada mais usa há mais de um dia.
 * Silenciosa: se falhar (sem rede, sem permissão), tenta de novo outro dia.
 */
export async function faxinaDeFotos(b: Banco, agora = Date.now()): Promise<number> {
  const usadas = emUso(b);
  const sb = getSupabase().storage.from(BUCKET);
  const sobras: string[] = [];
  for (const pasta of PASTAS) {
    const { data, error } = await sb.list(`${b.negocio.id}/${pasta}`, { limit: 200 });
    if (error || !data) continue;
    for (const o of data) {
      if (!o.id) continue; // subpasta
      const caminho = `${b.negocio.id}/${pasta}/${o.name}`;
      const idade = agora - new Date(o.created_at ?? agora).getTime();
      if (!usadas.has(caminho) && idade > 24 * 60 * 60 * 1000) sobras.push(caminho);
    }
  }
  if (!sobras.length) return 0;
  const { data } = await sb.remove(sobras);
  return data?.length ?? 0;
}
