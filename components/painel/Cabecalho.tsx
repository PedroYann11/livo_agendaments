import type { ReactNode } from "react";

export function Cabecalho({ titulo, texto, acoes }: { titulo: ReactNode; texto?: ReactNode; acoes?: ReactNode }) {
  return (
    <header className="pn-cabeca">
      <div>
        <h1>{titulo}</h1>
        {texto && <p>{texto}</p>}
      </div>
      {acoes && <div className="pn-cabeca-acoes">{acoes}</div>}
    </header>
  );
}
