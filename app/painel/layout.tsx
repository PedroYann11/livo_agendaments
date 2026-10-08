import type { Metadata, Viewport } from "next";
import { PainelRaiz } from "@/components/painel/PainelRaiz";
import "./painel.css";

export const metadata: Metadata = {
  title: { default: "Painel", template: "%s · Painel" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#f5f4f0" };

export default function LayoutPainel({ children }: { children: React.ReactNode }) {
  return <PainelRaiz>{children}</PainelRaiz>;
}
