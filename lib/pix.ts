// Origem: livo@d74d591 · lib/pix.ts (BR Code "copia e cola" do Bacen, sem gateway)

function tlv(id: string, valor: string): string {
  const len = valor.length.toString().padStart(2, "0");
  return `${id}${len}${valor}`;
}

/** Remove acentos e caracteres fora do padrão EMV */
function sanitizar(texto: string, max: number): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9 .-]/g, "")
    .toUpperCase()
    .slice(0, max)
    .trim();
}

/** CRC16-CCITT (0xFFFF), exigido pelo padrão do Bacen */
function crc16(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

export function gerarPixCopiaECola(dados: {
  chave: string;
  nome: string; // nome do recebedor (máx 25)
  cidade: string; // cidade do recebedor (máx 15)
  valor: number;
  txid?: string; // identificador (máx 25) — ex.: número do pedido
}): string {
  const merchantAccount =
    tlv("00", "br.gov.bcb.pix") + tlv("01", dados.chave.trim());

  const txid = sanitizar(dados.txid || "***", 25) || "***";

  let payload =
    tlv("00", "01") + // payload format
    tlv("26", merchantAccount) + // conta Pix
    tlv("52", "0000") + // categoria
    tlv("53", "986") + // moeda BRL
    tlv("54", dados.valor.toFixed(2)) + // valor
    tlv("58", "BR") +
    tlv("59", sanitizar(dados.nome, 25) || "RECEBEDOR") +
    tlv("60", sanitizar(dados.cidade, 15) || "BRASIL") +
    tlv("62", tlv("05", txid)) +
    "6304"; // CRC vem em seguida

  return payload + crc16(payload);
}
