import  type { Metadata } from "next";
import { Area } from "@/components/painel/Area";
import { Financeiro } from "@/components/painel/telas/Financeiro";

export const metadata: Metadata = { title: "Financeiro" };

export default function PaginaFinanceiro() {
  return (
    <Area area="financeiro">
      <Financeiro />
    </Area>
  );
}
