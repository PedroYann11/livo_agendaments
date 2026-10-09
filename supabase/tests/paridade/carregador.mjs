// Deixa o Node rodar o TypeScript de lib/ como está: resolve import sem
// extensão ("./tipos" → "./tipos.ts") e o alias "@/" do projeto.
import { pathToFileURL } from "node:url";
import { resolve as caminho } from "node:path";

const RAIZ = caminho(import.meta.dirname, "../../..") + "/";

export async function resolve(spec, ctx, next) {
  if (spec.startsWith("@/")) spec = pathToFileURL(RAIZ + spec.slice(2)).href;
  try {
    return await next(spec, ctx);
  } catch (erro) {
    for (const ext of [".ts", ".tsx"]) {
      try {
        return await next(spec + ext, ctx);
      } catch {}
    }
    throw erro;
  }
}
