import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { resolverNegocio } from "@/lib/negocio-server";
import { BancoProvider } from "@/lib/dados/loja";
import { Provedores } from "@/components/ui/Avisos";
import { VitrineRaiz } from "@/components/vitrine/VitrineRaiz";
import "./vitrine.css";
import "./agendar.css";

type Props = { children: React.ReactNode; params: Promise<{ negocio: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { negocio } = await params;
  const n = await resolverNegocio(negocio);
  if (!n) return { title: "Negócio não encontrado" };
  return {
    title: { default: `${n.nome} · Agende online`, template: `%s · ${n.nome}` },
    description: n.descricao || n.tagline,
    openGraph: { title: n.nome, description: n.tagline || n.descricao, type: "website" },
  };
}

export default async function LayoutNegocio({ children, params }: Props) {
  const { negocio } = await params;
  // link digitado com maiúscula (comum no Instagram) vai para o endereço certo
  if (negocio !== negocio.toLowerCase()) permanentRedirect(`/${negocio.toLowerCase()}`);
  const n = await resolverNegocio(negocio);
  if (!n) notFound();
  return (
    <BancoProvider slug={n.slug} publico={n}>
      <Provedores>
        <VitrineRaiz tema={n.tema} pele={n.pele}>
          {children}
        </VitrineRaiz>
      </Provedores>
    </BancoProvider>
  );
}
