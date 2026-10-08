import { Suspense } from "react";
import type { Metadata } from "next";
import { Area } from "@/components/painel/Area";
import { Mensagens } from "@/components/painel/telas/Mensagens";

export const metadata: Metadata = { title: "Mensagens" };

export default function PaginaMensagens() {
  return (
    <Area area="mensagens">
      <Suspense>
        <Mensagens />
      </Suspense>
    </Area>
  );
}
