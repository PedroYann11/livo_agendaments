import { ClienteDetalhe } from "@/components/painel/telas/ClienteDetalhe";

export default async function PaginaCliente({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ClienteDetalhe id={id} />;
}
