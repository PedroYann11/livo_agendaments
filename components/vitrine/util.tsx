// Pequenas peças compartilhadas pela vitrine e pelo fluxo de agendamento.

import type { Banco, Servico } from "@/lib/tipos";
import { brl } from "@/lib/formato";

export function precoTexto(s: Servico) {
  if (s.modoPreco === "oculto") return <span className="vt-preco">Sob consulta</span>;
  return (
    <span className="vt-preco">
      {s.modoPreco === "a_partir_de" && <small>a partir de </small>}
      {brl(s.preco)}
    </span>
  );
}

export function servicosVisiveis(b: Banco): Servico[] {
  return b.servicos.filter((s) => s.ativo && !s.pausado && s.online).sort((a, c) => a.ordem - c.ordem);
}

export function capitalizar(t: string) {
  return t.charAt(0).toUpperCase() + t.slice(1);
}
