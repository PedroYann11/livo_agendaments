// =====================================================================
// Os descontos de um agendamento, um por linha: o resumo antes de
// confirmar, o bilhete do "Confirmado" e o link do cliente mostram o
// porquê do preço — "2 áreas ou mais · 15%   −R$ 39,00".
// =====================================================================

import type { DescontoAplicado } from "@/lib/tipos";
import { brl } from "@/lib/formato";

export function LinhasDesconto({ descontos, subtotal }: { descontos: DescontoAplicado[]; subtotal?: number }) {
  if (!descontos.length) return null;
  return (
    <div className="ag-descontos">
      {subtotal !== undefined && (
        <div>
          <span>Serviços</span>
          <span>{brl(subtotal)}</span>
        </div>
      )}
      {descontos.map((d) => (
        <div key={d.tipo} className="ag-desconto">
          <span>
            {d.nome}
            {d.percentual !== null && <em> · {d.percentual}%</em>}
          </span>
          <span>−{brl(d.valor)}</span>
        </div>
      ))}
    </div>
  );
}
