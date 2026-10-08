// =====================================================================
// Importação de clientes.
//
// O dono chega com a base em três formatos, nesta ordem de frequência:
//   1. contatos do celular (.vcf, "Exportar contatos" no Android/iPhone);
//   2. planilha (Excel/Google Planilhas salva como CSV, ou colada direto);
//   3. lista solta colada do WhatsApp/bloco de notas ("Maria 85 99999-0000").
// Os três viram a mesma prévia: linhas com nome, telefone, e-mail,
// nascimento e observação — o dono confere antes de gravar.
// =====================================================================

import { apenasDigitos, capitalizarNome, telefoneValido } from "./masks";
import { lerDataBr } from "./datas";
import { normalizar } from "./formato";

export type LinhaImportada = {
  nome: string;
  telefone: string;
  email: string;
  nascimento: string | null;
  observacoes: string;
  tags: string[];
  /** por que esta linha não entra, se não entra */
  problema: string | null;
};

export type CampoDestino = "nome" | "telefone" | "email" | "nascimento" | "observacoes" | "tags" | "ignorar";

export const ROTULOS_CAMPO: Record<CampoDestino, string> = {
  nome: "Nome",
  telefone: "Telefone / WhatsApp",
  email: "E-mail",
  nascimento: "Nascimento",
  observacoes: "Observações",
  tags: "Etiquetas",
  ignorar: "Não importar",
};

const PISTAS: [CampoDestino, RegExp][] = [
  ["telefone", /(tel|cel|fone|whats|zap|contato|numero|número)/],
  ["email", /(e-?mail|correio)/],
  ["nascimento", /(nasc|aniver|data de nasc|birthday|dt nasc)/],
  ["observacoes", /(obs|nota|anota|coment)/],
  ["tags", /(tag|etiqueta|grupo|categoria)/],
  ["nome", /(nome|cliente|name|paciente)/],
];

export function adivinharCampo(cabecalho: string): CampoDestino {
  const c = normalizar(cabecalho);
  for (const [campo, re] of PISTAS) if (re.test(c)) return campo;
  return "ignorar";
}

/** Separador mais provável numa amostra: tab (colado do Excel), ; (Excel BR) ou , */
function separadorDe(amostra: string): string {
  const primeira = amostra.split(/\r?\n/)[0] ?? "";
  const contagens = ["\t", ";", ","].map((s) => [s, primeira.split(s).length - 1] as const);
  contagens.sort((a, b) => b[1] - a[1]);
  return contagens[0][1] > 0 ? contagens[0][0] : ",";
}

/** CSV com aspas, quebras dentro de aspas e aspas duplicadas. */
export function lerTabela(texto: string): string[][] {
  const sep = separadorDe(texto);
  const linhas: string[][] = [];
  let campo = "";
  let linha: string[] = [];
  let aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (aspas) {
      if (c === '"' && texto[i + 1] === '"') {
        campo += '"';
        i++;
      } else if (c === '"') aspas = false;
      else campo += c;
      continue;
    }
    if (c === '"') aspas = true;
    else if (c === sep) {
      linha.push(campo);
      campo = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && texto[i + 1] === "\n") i++;
      linha.push(campo);
      if (linha.some((x) => x.trim())) linhas.push(linha.map((x) => x.trim()));
      linha = [];
      campo = "";
    } else campo += c;
  }
  linha.push(campo);
  if (linha.some((x) => x.trim())) linhas.push(linha.map((x) => x.trim()));
  return linhas;
}

/** A primeira linha é cabeçalho? Se nenhuma célula dela parece telefone, sim. */
export function temCabecalho(tabela: string[][]): boolean {
  const primeira = tabela[0] ?? [];
  return !primeira.some((c) => apenasDigitos(c).length >= 10);
}

export function aplicarMapeamento(
  tabela: string[][],
  mapa: CampoDestino[],
  pularPrimeira: boolean,
): LinhaImportada[] {
  const corpo = pularPrimeira ? tabela.slice(1) : tabela;
  return corpo.map((cel) => {
    const pega = (campo: CampoDestino) =>
      mapa
        .map((m, i) => (m === campo ? cel[i] ?? "" : ""))
        .filter(Boolean)
        .join(" ")
        .trim();
    return validar({
      nome: pega("nome"),
      telefone: pega("telefone"),
      email: pega("email"),
      nascimento: pega("nascimento") ? lerDataBr(pega("nascimento")) : null,
      observacoes: pega("observacoes"),
      tags: pega("tags")
        .split(/[,;|]/)
        .map((t) => t.trim())
        .filter(Boolean),
      problema: null,
    });
  });
}

/** Contatos do celular. Pega FN e o primeiro TEL de cada cartão. */
export function lerVcard(texto: string): LinhaImportada[] {
  const desdobrado = texto.replace(/\r?\n[ \t]/g, "");
  const cartoes = desdobrado.split(/BEGIN:VCARD/i).slice(1);
  return cartoes.map((c) => {
    const campo = (re: RegExp) => c.match(re)?.[1]?.trim() ?? "";
    const nome = campo(/\nFN[^:]*:(.*)/i) || campo(/\nN[^:]*:([^;\r\n]*)/i);
    const tel = campo(/\nTEL[^:]*:(.*)/i);
    const email = campo(/\nEMAIL[^:]*:(.*)/i);
    const bday = campo(/\nBDAY[^:]*:(.*)/i);
    return validar({
      nome: decodificarQP(nome),
      telefone: tel,
      email,
      nascimento: bday ? lerDataBr(bday.replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3")) : null,
      observacoes: "",
      tags: [],
      problema: null,
    });
  });
}

function decodificarQP(t: string): string {
  if (!/=[0-9A-F]{2}/i.test(t)) return t;
  try {
    const bytes = t.replace(/=([0-9A-F]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
    return decodeURIComponent(escape(bytes));
  } catch {
    return t;
  }
}

/** "Maria Souza 85 99876-5432" — uma pessoa por linha, telefone em qualquer lugar. */
export function lerListaSolta(texto: string): LinhaImportada[] {
  return texto
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const tel = l.match(/(\+?55\s?)?\(?\d{2}\)?\s?9?\s?\d{4}[-\s]?\d{4}/)?.[0] ?? "";
      const nome = l.replace(tel, "").replace(/[-–:|,;]+\s*$/, "").replace(/^\s*[-–:|,;]+/, "").trim();
      return validar({ nome, telefone: tel, email: "", nascimento: null, observacoes: "", tags: [], problema: null });
    });
}

function validar(l: LinhaImportada): LinhaImportada {
  const nome = capitalizarNome(l.nome.replace(/\s+/g, " "));
  const telefone = apenasDigitos(l.telefone);
  let problema: string | null = null;
  if (!nome) problema = "sem nome";
  else if (!telefone) problema = "sem telefone";
  else if (!telefoneValido(telefone)) problema = "telefone incompleto";
  return { ...l, nome, telefone, problema };
}

/** Marca repetidos dentro do arquivo e os que já existem na base. */
export function marcarRepetidos(linhas: LinhaImportada[], telefonesExistentes: Set<string>): LinhaImportada[] {
  const vistos = new Set<string>();
  return linhas.map((l) => {
    if (l.problema) return l;
    if (telefonesExistentes.has(l.telefone)) return { ...l, problema: "já cadastrado" };
    if (vistos.has(l.telefone)) return { ...l, problema: "repetido no arquivo" };
    vistos.add(l.telefone);
    return l;
  });
}
