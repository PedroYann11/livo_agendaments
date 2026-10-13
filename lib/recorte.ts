// =====================================================================
// Tirar o fundo de uma foto (a do topo ou a do Sobre), no próprio navegador.
//
// Usa o MediaPipe do Google (licença Apache 2.0) com o modelo de selfie
// em várias classes (fundo, cabelo, pele, roupa…): o que não é "fundo" fica.
// Nada sai do aparelho além do recorte pronto, que vai para o Storage como
// qualquer outra foto.
//
// O programa (WASM) é servido pelo próprio site (/mediapipe, copiado do
// pacote no build); o modelo (16 MB) vem do Google na primeira vez e o
// navegador guarda. Só o painel carrega isso, e só quando a pessoa pede.
// =====================================================================

import type { ImageSegmenter } from "@mediapipe/tasks-vision";

// versão fixa (1), não "latest": o recorte não muda sozinho de um dia para o outro
const MODELO =
  process.env.NEXT_PUBLIC_MODELO_RECORTE ??
  "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/1/selfie_multiclass_256x256.tflite";
/** o recorte guardado: lado maior, e o teto do bucket (2 MB) com folga */
const LADO = 1100;
const LIMITE = 1_900_000;

let segmentador: Promise<ImageSegmenter> | null = null;

function carregar(): Promise<ImageSegmenter> {
  segmentador ??= (async () => {
    const { FilesetResolver, ImageSegmenter } = await import("@mediapipe/tasks-vision");
    const arquivos = await FilesetResolver.forVisionTasks("/mediapipe");
    return ImageSegmenter.createFromOptions(arquivos, {
      baseOptions: { modelAssetPath: MODELO, delegate: "CPU" },
      runningMode: "IMAGE",
      outputCategoryMask: false,
      outputConfidenceMasks: true,
    });
  })().catch((e) => {
    segmentador = null; // tenta de novo na próxima vez
    throw e;
  });
  return segmentador;
}

/** curva suave entre a e b: tira o "halo" do fundo que gruda na borda */
const suave = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Encolhe a parte visível r pixels para dentro (cada ponto fica com o menor
 * valor ao redor). Tira a linha fina do fundo que gruda no contorno — o
 * preto atrás de um jaleco branco, por exemplo.
 */
function encolher(a: Uint8ClampedArray, w: number, h: number, r: number): Uint8ClampedArray {
  const meio = new Uint8ClampedArray(a.length);
  const fim = new Uint8ClampedArray(a.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let m = 255;
      for (let k = Math.max(0, x - r); k <= Math.min(w - 1, x + r); k++) m = Math.min(m, a[y * w + k]);
      meio[y * w + x] = m;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let m = 255;
      for (let k = Math.max(0, y - r); k <= Math.min(h - 1, y + r); k++) m = Math.min(m, meio[k * w + x]);
      fim[y * w + x] = m;
    }
  }
  return fim;
}

async function abrir(fonte: Blob | string): Promise<ImageBitmap> {
  const blob = typeof fonte === "string" ? await (await fetch(fonte)).blob() : fonte;
  return createImageBitmap(blob);
}

/**
 * A foto sem o fundo: PNG/WebP com transparência, cortado justo na pessoa.
 * Devolve null se não achou ninguém na foto.
 */
export async function tirarFundo(fonte: Blob | string): Promise<Blob | null> {
  const [seg, img] = await Promise.all([carregar(), abrir(fonte)]);
  const r = seg.segment(img);
  const mascara = r.confidenceMasks?.[0];
  if (!mascara) return null;
  const fundo = mascara.getAsFloat32Array();
  const w = mascara.width;
  const h = mascara.height;

  // a foto inteira com a transparência da pessoa
  const c = new OffscreenCanvas(img.width, img.height);
  const ctx = c.getContext("2d")!;
  ctx.drawImage(img, 0, 0, c.width, c.height);
  const px = ctx.getImageData(0, 0, c.width, c.height);
  // quanto de cada pixel é pessoa (a máscara costuma vir do tamanho da foto)
  const pessoa = new Uint8ClampedArray(c.width * c.height);
  for (let y = 0; y < c.height; y++) {
    const my = Math.min(h - 1, Math.floor((y * h) / c.height));
    for (let x = 0; x < c.width; x++) {
      const mx = Math.min(w - 1, Math.floor((x * w) / c.width));
      pessoa[y * c.width + x] = 255 * suave(0.42, 0.85, 1 - fundo[my * w + mx]);
    }
  }
  const contorno = encolher(pessoa, c.width, c.height, Math.max(1, Math.round(Math.max(c.width, c.height) / 600)));
  let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      const i = (y * c.width + x) * 4 + 3;
      px.data[i] = Math.round((px.data[i] * contorno[y * c.width + x]) / 255);
      if (px.data[i] > 12) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  r.close();
  img.close();
  if (x1 < 0 || (x1 - x0) * (y1 - y0) < c.width * c.height * 0.03) return null;
  ctx.putImageData(px, 0, 0);

  // corta justo na pessoa (com uma folga) e limita o tamanho
  const folga = Math.round(Math.max(x1 - x0, y1 - y0) * 0.02);
  x0 = Math.max(0, x0 - folga);
  y0 = Math.max(0, y0 - folga);
  x1 = Math.min(c.width - 1, x1 + folga);
  y1 = Math.min(c.height - 1, y1 + folga);
  const cw = x1 - x0 + 1;
  const ch = y1 - y0 + 1;
  for (const lado of [LADO, 900, 700]) {
    const escala = Math.min(1, lado / Math.max(cw, ch));
    const s = new OffscreenCanvas(Math.round(cw * escala), Math.round(ch * escala));
    const sctx = s.getContext("2d")!;
    sctx.imageSmoothingQuality = "high";
    sctx.drawImage(c, x0, y0, cw, ch, 0, 0, s.width, s.height);
    // WebP é bem menor; quem não sabe gerar WebP (Safari) gera PNG
    let blob = await s.convertToBlob({ type: "image/webp", quality: 0.9 });
    if (blob.type !== "image/webp") blob = await s.convertToBlob({ type: "image/png" });
    if (blob.size <= LIMITE) return blob;
  }
  return null;
}
