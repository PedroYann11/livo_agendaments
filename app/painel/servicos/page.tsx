import  type { Metadata } from "next";
import { Area } from "@/components/painel/Area";
import { Servicos } from "@/components/painel/telas/Servicos";

export const metadata: Metadata = { title: "Serviços" };

export default function PaginaServicos() {
  return (
    <Area area="servicos">
      <Servicos />
    </Area>
  );
}
