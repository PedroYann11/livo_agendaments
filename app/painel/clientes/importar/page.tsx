import type { Metadata } from "next";
import { Importar } from "@/components/painel/telas/Importar";

export const metadata: Metadata = { title: "Importar clientes" };

export default function PaginaImportar() {
  return <Importar />;
}
