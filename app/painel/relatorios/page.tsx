import  type { Metadata } from "next";
import { Area } from "@/components/painel/Area";
import { Relatorios } from "@/components/painel/telas/Relatorios";

export const metadata: Metadata = { title: "Relatórios" };

export default function PaginaRelatorios() {
  return (
    <Area area="relatorios">
      <Relatorios />
    </Area>
  );
}
