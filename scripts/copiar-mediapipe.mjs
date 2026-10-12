// Copia o programa do recorte (WASM do MediaPipe) do pacote para public/mediapipe,
// para o site servir ele mesmo (CSP 'self'). Roda antes do dev e do build.
import fs from "node:fs";
import path from "node:path";

const origem = path.join(process.cwd(), "node_modules/@mediapipe/tasks-vision/wasm");
const destino = path.join(process.cwd(), "public/mediapipe");
fs.mkdirSync(destino, { recursive: true });
for (const f of fs.readdirSync(origem)) {
  fs.copyFileSync(path.join(origem, f), path.join(destino, f));
}
console.log(`mediapipe: ${fs.readdirSync(destino).length} arquivos em public/mediapipe`);
