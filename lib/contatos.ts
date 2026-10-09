// =====================================================================
// Clientes a partir dos contatos do celular.
//
// Como no app que a DepiLED usava: o dono escolhe um contato da agenda do
// celular e ele vira cliente. No Android (Chrome) o navegador abre a lista
// de contatos de verdade (Contact Picker API); no iPhone essa porta não
// existe — lá o caminho é exportar os contatos (.vcf) e usar Importar.
//
// Muitos donos salvam o contato como "Maria Cliente DepiLED" para achar no
// WhatsApp. Aqui o nome entra limpo: o sufixo com o nome do negócio sai.
// =====================================================================

import { apenasDigitos, capitalizarNome } from "./masks";
import { normalizar } from "./formato";

export type ContatoEscolhido = { nome: string; telefone: string };

type SeletorDoNavegador = {
  select(propriedades: string[], opcoes: { multiple: boolean }): Promise<{ name?: string[]; tel?: string[] }[]>;
};

export function podeEscolherContatos(): boolean {
  return typeof window !== "undefined" && "contacts" in navigator && "ContactsManager" in window;
}

/** Celular com DDD primeiro (11 dígitos); senão, o primeiro número que houver. */
export function melhorTelefone(numeros: string[]): string {
  const limpos = numeros.map(apenasDigitos).filter(Boolean);
  return limpos.find((n) => n.length === 11) ?? limpos.find((n) => n.length === 10) ?? limpos[0] ?? "";
}

/** "Ana Clara Cliente DepiLED" → "Ana Clara". Só mexe no FIM do nome. */
export function limparSufixoDoNegocio(nome: string, negocio: string): string {
  const palavras = nome.trim().split(/\s+/);
  const alvo = normalizar(negocio).split(/\s+/).filter(Boolean);
  if (!alvo.length) return nome.trim();
  let fim = palavras.length;
  const em = (i: number) => normalizar(palavras[i] ?? "");
  if (fim > 0 && em(fim - 1) === "novo") fim--;
  const comeco = fim - alvo.length;
  if (comeco < 1 || !alvo.every((p, i) => em(comeco + i) === p)) return nome.trim();
  fim = comeco;
  if (fim > 1 && em(fim - 1) === "cliente") fim--;
  return palavras.slice(0, fim).join(" ");
}

export async function escolherContatos(negocio: string, varios: boolean): Promise<ContatoEscolhido[]> {
  const seletor = (navigator as Navigator & { contacts: SeletorDoNavegador }).contacts;
  const escolhidos = await seletor.select(["name", "tel"], { multiple: varios });
  return escolhidos
    .map((c) => ({
      nome: capitalizarNome(limparSufixoDoNegocio(c.name?.[0] ?? "", negocio)),
      telefone: melhorTelefone(c.tel ?? []),
    }))
    .filter((c) => c.nome || c.telefone);
}
