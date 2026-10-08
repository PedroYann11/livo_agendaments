import { Suspense } from "react";
import type { Metadata } from "next";
import { Fluxo } from "@/components/agendar/Fluxo";

export const metadata: Metadata = { title: "Agendar" };

export default function PaginaAgendar() {
  return (
    <Suspense>
      <Fluxo />
    </Suspense>
  );
}
