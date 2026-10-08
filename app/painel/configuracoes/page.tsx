import { Suspense } from "react";
import type { Metadata } from "next";
import { Area } from "@/components/painel/Area";
import { Configuracoes } from "@/components/painel/telas/Configuracoes";

export const metadata: Metadata = { title: "Configurações" };

export default function PaginaConfiguracoes() {
  return (
    <Area area="configuracoes">
      <Suspense>
        <Configuracoes />
      </Suspense>
    </Area>
  );
}
