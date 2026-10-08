// Pequenas peças compartilhadas pela vitrine e pelo fluxo de agendamento.

import type { Banco, Categoria, Servico } from "@/lib/tipos";

/** O que o cliente pode agendar pelo link: ativo, não pausado, online e de categoria no ar. */
export function servicosVisiveis(b: Banco): Servico[] {
  const pausadas = new Set(b.categorias.filter((c) => c.pausada).map((c) => c.id));
  return b.servicos
    .filter((s) => s.ativo && !s.pausado && s.online && !(s.categoriaId && pausadas.has(s.categoriaId)))
    .sort((a, c) => a.ordem - c.ordem);
}

export type Grupo = { id: string; nome: string; descricao: string; servicos: Servico[] };

export const GRUPO_OUTROS = "_outros";

/** Categorias com algo para agendar, na ordem do painel; o que não tem categoria vai em "Outros". */
export function gruposVisiveis(b: Banco): Grupo[] {
  const servicos = servicosVisiveis(b);
  const categorias: Categoria[] = b.categorias.filter((c) => !c.pausada).sort((a, c) => a.ordem - c.ordem);
  const ids = new Set(categorias.map((c) => c.id));
  const grupos: Grupo[] = categorias.map((c) => ({ id: c.id, nome: c.nome, descricao: c.descricao, servicos: servicos.filter((s) => s.categoriaId === c.id) }));
  grupos.push({ id: GRUPO_OUTROS, nome: "Outros", descricao: "", servicos: servicos.filter((s) => !s.categoriaId || !ids.has(s.categoriaId)) });
  return grupos.filter((g) => g.servicos.length);
}

/** "a partir de R$ 45" — o menor preço visível do grupo. */
export function menorPreco(servicos: Servico[]): number | null {
  const precos = servicos.filter((s) => s.modoPreco !== "oculto").map((s) => s.preco);
  return precos.length ? Math.min(...precos) : null;
}

export function capitalizar(t: string) {
  return t.charAt(0).toUpperCase() + t.slice(1);
}
