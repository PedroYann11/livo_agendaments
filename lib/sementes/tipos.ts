import type { Banco } from "../tipos";

/** O ponto de partida público de um negócio: o que a página mostra no primeiro dia. */
export type Semente = Pick<Banco, "negocio" | "categorias" | "servicos" | "profissionais" | "mensagens">;
