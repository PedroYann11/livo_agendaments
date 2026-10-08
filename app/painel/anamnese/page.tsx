import  type { Metadata } from "next";
import { Area } from "@/components/painel/Area";
import { Anamnese } from "@/components/painel/telas/Anamnese";

export const metadata: Metadata = { title: "Anamnese" };

export default function PaginaAnamnese() {
  return (
    <Area area="anamnese">
      <Anamnese />
    </Area>
  );
}
