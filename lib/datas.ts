// =====================================================================
// Datas em "hora de parede" do negócio.
//
// Tudo aqui trabalha com textos "YYYY-MM-DD" e "YYYY-MM-DDTHH:mm", sem fuso.
// A conta é feita como se fosse UTC (Date.UTC), o que torna somar minutos e
// dias imune a horário de verão e ao fuso de quem abre a página. O único
// ponto que olha o relógio real é `agoraNo(fuso)`.
// =====================================================================

const DIAS_CURTOS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const DIAS_LONGOS = [
  "domingo",
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado",
];
const MESES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];
const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export const NOMES_DIAS = DIAS_LONGOS;
export const NOMES_DIAS_CURTOS = DIAS_CURTOS;
export const NOMES_MESES = MESES;

function d2(n: number) {
  return String(n).padStart(2, "0");
}

/** "YYYY-MM-DD[THH:mm]" → milissegundos "UTC de parede". */
export function ms(texto: string): number {
  const [data, hora = "00:00"] = texto.split("T");
  const [a, m, d] = data.split("-").map(Number);
  const [h, mi] = hora.split(":").map(Number);
  return Date.UTC(a, m - 1, d, h || 0, mi || 0);
}

export function deMs(valor: number): string {
  const x = new Date(valor);
  return `${x.getUTCFullYear()}-${d2(x.getUTCMonth() + 1)}-${d2(x.getUTCDate())}T${d2(
    x.getUTCHours(),
  )}:${d2(x.getUTCMinutes())}`;
}

export function dataDe(instante: string): string {
  return instante.slice(0, 10);
}

export function horaDe(instante: string): string {
  return instante.slice(11, 16);
}

export function juntar(data: string, hora: string): string {
  return `${data}T${hora}`;
}

export function somarMin(instante: string, minutos: number): string {
  return deMs(ms(instante) + minutos * 60_000);
}

export function somarDias(data: string, dias: number): string {
  return deMs(ms(data) + dias * 86_400_000).slice(0, 10);
}

export function difMin(a: string, b: string): number {
  return Math.round((ms(b) - ms(a)) / 60_000);
}

export function difDias(a: string, b: string): number {
  return Math.round((ms(dataDe(b)) - ms(dataDe(a))) / 86_400_000);
}

/** "HH:mm" → minutos do dia */
export function minDoDia(hora: string): number {
  const [h, m] = hora.split(":").map(Number);
  return h * 60 + (m || 0);
}

export function horaDoMin(min: number): string {
  return `${d2(Math.floor(min / 60))}:${d2(min % 60)}`;
}

/** 0 = domingo */
export function diaDaSemana(data: string): number {
  return new Date(ms(data)).getUTCDay();
}

/** Segunda-feira da semana da data. */
export function inicioDaSemana(data: string): string {
  const dia = diaDaSemana(data);
  return somarDias(data, dia === 0 ? -6 : 1 - dia);
}

export function inicioDoMes(data: string): string {
  return data.slice(0, 8) + "01";
}

export function fimDoMes(data: string): string {
  const [a, m] = data.split("-").map(Number);
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return `${a}-${d2(m)}-${d2(ultimo)}`;
}

export function somarMeses(data: string, meses: number): string {
  const [a, m, d] = data.split("-").map(Number);
  const alvo = new Date(Date.UTC(a, m - 1 + meses, 1));
  const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  return `${alvo.getUTCFullYear()}-${d2(alvo.getUTCMonth() + 1)}-${d2(Math.min(d, ultimo))}`;
}

export function sobrepoe(aIni: string, aFim: string, bIni: string, bFim: string): boolean {
  return ms(aIni) < ms(bFim) && ms(bIni) < ms(aFim);
}

/** Agora, no fuso do negócio, como hora de parede. */
export function agoraNo(fuso: string): string {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: fuso,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const v = (t: string) => partes.find((p) => p.type === t)?.value ?? "00";
  return `${v("year")}-${v("month")}-${v("day")}T${v("hour")}:${v("minute")}`;
}

export function hojeNo(fuso: string): string {
  return agoraNo(fuso).slice(0, 10);
}

// ---------- textos ----------

/** "qui, 8 out" */
export function dataCurta(data: string): string {
  const [, m, d] = data.split("-").map(Number);
  return `${DIAS_CURTOS[diaDaSemana(data)]}, ${d} ${MESES_CURTOS[m - 1]}`;
}

/** "quinta-feira, 8 de outubro" */
export function dataLonga(data: string): string {
  const [, m, d] = data.split("-").map(Number);
  return `${DIAS_LONGOS[diaDaSemana(data)]}, ${d} de ${MESES[m - 1]}`;
}

/** "8 de outubro de 2026" */
export function dataExtenso(data: string): string {
  const [a, m, d] = data.split("-").map(Number);
  return `${d} de ${MESES[m - 1]} de ${a}`;
}

/** "08/10/2026" */
export function dataBr(data: string): string {
  const [a, m, d] = data.split("-");
  return `${d}/${m}/${a}`;
}

/** "out 2026" */
export function mesAno(data: string): string {
  const [a, m] = data.split("-").map(Number);
  return `${MESES[m - 1]} ${a}`;
}

export function mesCurto(data: string): string {
  return MESES_CURTOS[Number(data.slice(5, 7)) - 1];
}

/** "hoje", "amanhã", "ontem" ou a data curta */
export function dataRelativa(data: string, hoje: string): string {
  const dif = difDias(hoje, data);
  if (dif === 0) return "hoje";
  if (dif === 1) return "amanhã";
  if (dif === -1) return "ontem";
  return dataCurta(data);
}

/** "há 3 dias", "há 2 meses" */
export function haQuanto(data: string, hoje: string): string {
  const dias = difDias(data, hoje);
  if (dias <= 0) return "hoje";
  if (dias === 1) return "ontem";
  if (dias < 30) return `há ${dias} dias`;
  const meses = Math.floor(dias / 30);
  if (meses < 12) return meses === 1 ? "há 1 mês" : `há ${meses} meses`;
  const anos = Math.floor(meses / 12);
  return anos === 1 ? "há 1 ano" : `há ${anos} anos`;
}

/** "08/10/2026" ou "8/10/26" → "2026-10-08". Aceita também ISO. */
export function lerDataBr(texto: string): string | null {
  const t = texto.trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?$/);
  if (!m) return null;
  const dia = Number(m[1]);
  const mes = Number(m[2]);
  let ano = m[3] ? Number(m[3]) : 2000;
  if (ano < 100) ano += ano > 30 ? 1900 : 2000;
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  return `${ano}-${d2(mes)}-${d2(dia)}`;
}

export function idade(nascimento: string, hoje: string): number {
  const [a, m, d] = nascimento.split("-").map(Number);
  const [ha, hm, hd] = hoje.split("-").map(Number);
  let i = ha - a;
  if (hm < m || (hm === m && hd < d)) i--;
  return i;
}

/** Aniversário cai entre `de` e `ate` (inclusive), ignorando o ano. */
export function aniversarioEntre(nascimento: string, de: string, ate: string): boolean {
  for (let dia = de; ms(dia) <= ms(ate); dia = somarDias(dia, 1)) {
    if (dia.slice(5) === nascimento.slice(5)) return true;
  }
  return false;
}
