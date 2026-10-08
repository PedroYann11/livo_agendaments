import type { Metadata } from "next";
import { FichaPublica } from "@/components/agendar/FichaPublica";

export const metadata: Metadata = { title: "Ficha de anamnese", robots: { index: false } };

export default async function PaginaFicha({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <FichaPublica token={token} />;
}
