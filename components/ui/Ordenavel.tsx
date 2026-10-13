"use client";

// =====================================================================
// Item de lista que se reordena arrastando SÓ pela alça (⋮).
// Com o item inteiro arrastável, no celular a lista "grudava" no dedo:
// deslizar para rolar a página arrastava o item. Agora o resto do item
// rola a página, toca no botão, digita no campo — e a alça arrasta.
// =====================================================================

import { Reorder, useDragControls } from "motion/react";
import type { CSSProperties, ReactNode } from "react";
import { Icone } from "./Icone";

export function ItemOrdenavel({
  valor,
  ativo = true,
  className,
  style,
  children,
}: {
  valor: string;
  /** sem alça (ex.: lista filtrada pela busca, que não pode ser reordenada) */
  ativo?: boolean;
  className?: string;
  style?: CSSProperties;
  /** recebe a alça para pôr onde quiser no item */
  children: (alca: ReactNode) => ReactNode;
}) {
  const controle = useDragControls();
  const alca = ativo ? (
    <span className="ui-alca" aria-hidden="true" onPointerDown={(e) => controle.start(e)}>
      <Icone nome="menuVertical" tamanho={18} />
    </span>
  ) : null;
  return (
    <Reorder.Item as="div" value={valor} dragListener={false} dragControls={controle} className={className} style={style}>
      {children(alca)}
    </Reorder.Item>
  );
}
