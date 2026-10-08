import type { Metadata } from "next";
import { Gerenciar } from "@/components/agendar/Gerenciar";

export const metadata: Metadata = { title: "Seu horário", robots: { index: false } };

export default async function PaginaGerenciar({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <Gerenciar token={token} />;
}
