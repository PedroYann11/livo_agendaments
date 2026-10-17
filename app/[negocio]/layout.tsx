import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { resolverNegocio, resolverPagina } from "@/lib/negocio-server";
import { BancoProvider } from "@/lib/dados/loja";
import { Provedores } from "@/components/ui/Avisos";
import { VitrineRaiz } from "@/components/vitrine/VitrineRaiz";
import { ZapDoAviso } from "@/components/ui/NavegadorAntigo";
import "./vitrine.css";
import "../agendar-comum.css";
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
  const pagina = await resolverPagina(negocio);
  if (!pagina) notFound();
  const n = pagina.publico;
  return (
    <>
      {pagina.banco?.negocio.contato.whatsapp && <ZapDoAviso whatsapp={pagina.banco.negocio.contato.whatsapp} nome={n.nome} />}
      <BancoProvider slug={n.slug} modo="publico" publico={n} inicial={pagina.banco} indisponivel={pagina.indisponivel}>
        <Provedores>
          <VitrineRaiz tema={n.tema} pele={n.pele}>
            {children}
          </VitrineRaiz>
        </Provedores>
      </BancoProvider>
    </>
  );
}
