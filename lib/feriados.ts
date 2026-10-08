// =====================================================================
// Feriados nacionais.
//
// Fonte primária: BrasilAPI (https://brasilapi.com.br/api/feriados/v1/<ano>,
// listada em public-apis), chamada do NAVEGADOR no painel. Se ela não
// responder, o cálculo local abaixo cobre os nacionais — inclusive os móveis
// (Carnaval, Sexta-feira Santa, Corpus Christi), que dependem da Páscoa.
// Feriado municipal/estadual o dono marca à mão.
// =====================================================================

export type Feriado = { data: string; nome: string; tipo: "nacional" | "facultativo" };

function d2(n: number) {
  return String(n).padStart(2, "0");
}

/** Domingo de Páscoa — algoritmo de Meeus/Jones/Butcher. */
function pascoa(ano: number): Date {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(ano, mes - 1, dia));
}

function mais(data: Date, dias: number): string {
  const x = new Date(data.getTime() + dias * 86_400_000);
  return `${x.getUTCFullYear()}-${d2(x.getUTCMonth() + 1)}-${d2(x.getUTCDate())}`;
}

export function feriadosNacionais(ano: number): Feriado[] {
  const p = pascoa(ano);
  const fixos: [string, string][] = [
    ["01-01", "Confraternização Universal"],
    ["04-21", "Tiradentes"],
    ["05-01", "Dia do Trabalho"],
    ["09-07", "Independência do Brasil"],
    ["10-12", "Nossa Senhora Aparecida"],
    ["11-02", "Finados"],
    ["11-15", "Proclamação da República"],
    ["11-20", "Dia da Consciência Negra"],
    ["12-25", "Natal"],
  ];
  const lista: Feriado[] = fixos.map(([md, nome]) => ({ data: `${ano}-${md}`, nome, tipo: "nacional" }));
  lista.push({ data: mais(p, -47), nome: "Carnaval", tipo: "facultativo" });
  lista.push({ data: mais(p, -2), nome: "Sexta-feira Santa", tipo: "nacional" });
  lista.push({ data: mais(p, 60), nome: "Corpus Christi", tipo: "facultativo" });
  return lista.sort((a, b) => (a.data < b.data ? -1 : 1));
}

/** BrasilAPI primeiro; sem resposta em 4 s, o cálculo local. */
export async function buscarFeriados(ano: number): Promise<{ feriados: Feriado[]; fonte: "brasilapi" | "local" }> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    const resp = await fetch(`https://brasilapi.com.br/api/feriados/v1/${ano}`, { signal: ctrl.signal });
    clearTimeout(t);
    if (!resp.ok) throw new Error(String(resp.status));
    const dados = (await resp.json()) as { date: string; name: string; type: string }[];
    return {
      feriados: dados.map((f) => ({ data: f.date, nome: f.name, tipo: f.type === "national" ? "nacional" : "facultativo" })),
      fonte: "brasilapi",
    };
  } catch {
    return { feriados: feriadosNacionais(ano), fonte: "local" };
  }
}

/** Endereço pelo CEP — ViaCEP (listado em public-apis), sem chave. */
export async function buscarCep(
  cep: string,
): Promise<{ rua: string; bairro: string; cidade: string; uf: string } | null> {
  const d = cep.replace(/\D/g, "");
  if (d.length !== 8) return null;
  try {
    const resp = await fetch(`https://viacep.com.br/ws/${d}/json/`);
    if (!resp.ok) return null;
    const j = (await resp.json()) as { erro?: boolean; logradouro: string; bairro: string; localidade: string; uf: string };
    if (j.erro) return null;
    return { rua: j.logradouro, bairro: j.bairro, cidade: j.localidade, uf: j.uf };
  } catch {
    return null;
  }
}
