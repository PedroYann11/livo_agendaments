// =====================================================================
// Paleta categórica — identidade de profissional na agenda e nos gráficos.
//
// Valores e ORDEM da paleta de referência da skill de visualização de dados
// (validada para daltonismo nos pares adjacentes). A ordem é o mecanismo de
// segurança: cor segue a pessoa, nunca a posição na lista.
// =====================================================================

export const PALETA = [
  "#2a78d6", // azul
  "#eb6834", // laranja
  "#1baf7a", // água
  "#eda100", // amarelo
  "#e87ba4", // magenta
  "#008300", // verde
  "#4a3aa7", // violeta
  "#e34948", // vermelho
] as const;

export function corDaPessoa(indice: number): string {
  return PALETA[((indice % PALETA.length) + PALETA.length) % PALETA.length];
}

/** Rampa sequencial azul (claro → escuro) para mapas de calor. */
export const SEQUENCIAL = [
  "#eef4fd",
  "#cde2fb",
  "#9ec5f4",
  "#6da7ec",
  "#3987e5",
  "#256abf",
  "#184f95",
  "#0d366b",
];

/** Estado: reservado, nunca usado como "série 5". */
export const ESTADO = {
  bom: "#0f8a4f",
  atencao: "#c98500",
  serio: "#d9622b",
  critico: "#d33a3a",
} as const;
