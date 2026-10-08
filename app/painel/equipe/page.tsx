import  type { Metadata } from "next";
import { Area } from "@/components/painel/Area";
import { Equipe } from "@/components/painel/telas/Equipe";

export const metadata: Metadata = { title: "Equipe" };

export default function PaginaEquipe() {
  return (
    <Area area="equipe">
      <Equipe />
    </Area>
  );
}
