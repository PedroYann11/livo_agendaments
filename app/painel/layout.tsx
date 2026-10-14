import type { Metadata, Viewport } from "next";
import { PainelRaiz } from "@/components/painel/PainelRaiz";
import "../agendar-comum.css";
import "./painel.css";

export const metadata: Metadata = {
  title: { default: "Painel", template: "%s · Painel" },
  robots: { index: false, follow: false },
  // o painel instalável (no iPhone, é o que permite receber avisos)
  manifest: "/painel.webmanifest",
  appleWebApp: { capable: true, title: "Agenda", statusBarStyle: "default" },
  icons: { apple: "/icones/painel-180.png" },
};

export const viewport: Viewport = { themeColor: "#f5f4f0" };

export default function LayoutPainel({ children }: { children: React.ReactNode }) {
  return <PainelRaiz>{children}</PainelRaiz>;
}
