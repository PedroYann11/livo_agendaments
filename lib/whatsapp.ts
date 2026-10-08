// =====================================================================
// WhatsApp assistido: o painel monta a mensagem e abre o wa.me.
//
// Regra herdada do livo: mensagem em TEXTO PURO. Emoji se corrompia no
// caminho até o cliente — e quem recebe é cliente do negócio, não nosso.
// =====================================================================

import type { Agendamento, Banco, Cliente, ModeloMensagem, TipoMensagem } from "./tipos";
import { dataLonga, dataDe, horaDe } from "./datas";
import { primeiroNome } from "./formato";

/** Origem: livo@d74d591 · lib/data.ts linkWhatsApp() */
export function linkWhatsApp(telefone: string, mensagem: string): string {
  let digitos = telefone.replace(/\D/g, "");
  if (!digitos.startsWith("55")) digitos = "55" + digitos;
  return `https://wa.me/${digitos}?text=${encodeURIComponent(mensagem)}`;
}

export const VARIAVEIS: { chave: string; rotulo: string }[] = [
  { chave: "{nome}", rotulo: "Primeiro nome do cliente" },
  { chave: "{servico}", rotulo: "Serviço(s)" },
  { chave: "{data}", rotulo: "Data do horário" },
  { chave: "{hora}", rotulo: "Hora" },
  { chave: "{profissional}", rotulo: "Quem atende" },
  { chave: "{negocio}", rotulo: "Nome do negócio" },
  { chave: "{endereco}", rotulo: "Endereço" },
  { chave: "{link}", rotulo: "Link para confirmar ou remarcar" },
];

export const TITULOS: Record<TipoMensagem, string> = {
  confirmacao: "Confirmação",
  lembrete: "Lembrete da véspera",
  aniversario: "Aniversário",
  pos_atendimento: "Pós-atendimento",
  retorno: "Hora de voltar",
  cancelamento: "Cancelamento",
};

export function preencher(texto: string, valores: Record<string, string>): string {
  return texto.replace(/\{(\w+)\}/g, (inteiro, chave: string) => valores[chave] ?? inteiro);
}

export function enderecoTexto(b: Banco): string {
  const e = b.negocio.endereco;
  if (!e.rua) return "";
  return `${e.rua}, ${e.numero}${e.complemento ? " - " + e.complemento : ""} - ${e.bairro}, ${e.cidade}`;
}

export function linkGestao(b: Banco, ag: Agendamento, origem: string): string {
  return `${origem}/${b.negocio.slug}/a/${ag.token}`;
}

export function mensagemPara(
  b: Banco,
  tipo: TipoMensagem,
  cliente: Cliente,
  ag: Agendamento | null,
  origem: string,
): string {
  const modelo: ModeloMensagem | undefined = b.mensagens.find((m) => m.tipo === tipo);
  const pro = ag ? b.profissionais.find((p) => p.id === ag.profissionalId) : null;
  return preencher(modelo?.texto ?? "", {
    nome: primeiroNome(cliente.nome),
    servico: ag ? ag.itens.map((i) => i.nome).join(" + ") : "",
    data: ag ? dataLonga(dataDe(ag.inicio)) : "",
    hora: ag ? horaDe(ag.inicio) : "",
    profissional: pro ? primeiroNome(pro.nome) : "",
    negocio: b.negocio.nome,
    endereco: enderecoTexto(b),
    link: ag ? linkGestao(b, ag, origem) : `${origem}/${b.negocio.slug}`,
  });
}
