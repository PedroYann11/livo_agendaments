import type { Metadata, Viewport } from "next";
import { Big_Shoulders, Fraunces, Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import "./base.css";
import "./inicio.css";

// Fontes servidas pelo próprio app (next/font baixa no build): nenhuma
// requisição ao Google no navegador do cliente, e a CSP fica em 'self'.
const geist = Geist({ subsets: ["latin"], variable: "--f-sans", display: "swap" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--f-mono", display: "swap", preload: false });
// peles da página pública — só baixam quando a pele usa
const instrument = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--f-beleza",
  display: "swap",
  preload: false,
});
const ombros = Big_Shoulders({ subsets: ["latin"], variable: "--f-barbearia", display: "swap", preload: false });
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--f-delicada",
  display: "swap",
  preload: false,
  axes: ["SOFT", "opsz"],
});

export const metadata: Metadata = {
  title: { default: "Livo Agenda", template: "%s · Livo Agenda" },
  description: "Agendamento online com a cara do seu negócio.",
  applicationName: "Livo Agenda",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f4f3ef",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="pt-BR"
      className={`${geist.variable} ${mono.variable} ${instrument.variable} ${ombros.variable} ${fraunces.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
