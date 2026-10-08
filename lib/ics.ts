// Arquivo .ics — "adicionar à minha agenda" no celular do cliente.
// Hora de parede + TZID do negócio: o calendário do aparelho converte.

function carimbo(instante: string): string {
  return instante.replace(/[-:]/g, "") + "00";
}

function escapar(t: string): string {
  return t.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

export function gerarIcs(dados: {
  uid: string;
  titulo: string;
  descricao: string;
  local: string;
  inicio: string;
  fim: string;
  fuso: string;
}): string {
  const agora = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Livo Agenda//PT-BR",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${dados.uid}@agenda.livo.tec.br`,
    `DTSTAMP:${agora}`,
    `DTSTART;TZID=${dados.fuso}:${carimbo(dados.inicio)}`,
    `DTEND;TZID=${dados.fuso}:${carimbo(dados.fim)}`,
    `SUMMARY:${escapar(dados.titulo)}`,
    `DESCRIPTION:${escapar(dados.descricao)}`,
    `LOCATION:${escapar(dados.local)}`,
    "BEGIN:VALARM",
    "TRIGGER:-PT2H",
    "ACTION:DISPLAY",
    `DESCRIPTION:${escapar(dados.titulo)}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

export function baixarIcs(nomeArquivo: string, conteudo: string) {
  const blob = new Blob([conteudo], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeArquivo;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Link do Google Agenda (alternativa ao .ics no Android). */
export function linkGoogleAgenda(d: { titulo: string; inicio: string; fim: string; local: string; fuso: string }) {
  const f = (i: string) => carimbo(i);
  const p = new URLSearchParams({
    action: "TEMPLATE",
    text: d.titulo,
    dates: `${f(d.inicio)}/${f(d.fim)}`,
    location: d.local,
    ctz: d.fuso,
  });
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}

