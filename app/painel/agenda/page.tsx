import { Suspense } from "react";
import type { Metadata } from "next";
import { Agenda } from "@/components/painel/telas/Agenda";

export const metadata: Metadata = { title: "Agenda" };

export default function PaginaAgenda() {
  return (
    <Suspense>
      <Agenda />
    </Suspense>
  );
}
