"use client";

// =====================================================================
// A casca das telas de acesso (entrar, criar conta, senha esquecida):
// a arte da Livo à esquerda no computador e o formulário ao lado.
// =====================================================================

import Link from "next/link";
import type { ReactNode } from "react";
import { motion } from "motion/react";
import { Icone, type NomeIcone } from "@/components/ui/Icone";
import { PALETA } from "@/lib/paleta";

const ENTRAR = [0.23, 1, 0.32, 1] as const;

export function CascaAcesso({
  titulo,
  subtitulo,
  arte = "agenda",
  children,
}: {
  titulo: string;
  subtitulo?: ReactNode;
  /** agenda: o login de todo dia · cadastro: o que a pessoa ganha ao criar a conta */
  arte?: "agenda" | "cadastro";
  children: ReactNode;
}) {
  return (
    <div className="en">
      <aside className="en-arte">
        <span className="en-arte-grade" />
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 650, color: "inherit" }}>
          <span className="pn-negocio-simbolo" style={{ background: "#f4f4f5", color: "#17171a" }}>
            L
          </span>
          Livo Agenda
        </Link>
        {arte === "agenda" ? <ArteAgenda /> : <ArteCadastro />}
      </aside>

      <main className="en-form">
        <Link href="/" className="en-marca-movel">
          <span className="pn-negocio-simbolo" style={{ background: "#17171a", color: "#f4f4f5" }}>
            L
          </span>
          Livo Agenda
        </Link>
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: ENTRAR }}>
          <h1>{titulo}</h1>
          {subtitulo && <p className="en-sub">{subtitulo}</p>}
          {children}
        </motion.div>
      </main>
    </div>
  );
}

function ArteAgenda() {
  return (
    <>
      <div>
        <h2>A agenda do dia, sem bagunça.</h2>
        <p>Seus clientes marcam sozinhos pelo link. Você abre o painel e já sabe quem vem, quem confirmou e quanto entra hoje.</p>
      </div>
      <div className="en-agenda-mini">
        {[
          ["09:00", "Axilas · 5 min", PALETA[0]],
          ["09:10", "Virilha completa · 10 min", PALETA[2]],
          ["09:30", "Perna completa · 10 min", PALETA[1]],
        ].map(([h, t, c], i) => (
          <motion.div key={h} initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 + i * 0.12, duration: 0.5, ease: ENTRAR }}>
            <b>{h}</b>
            <i style={{ background: c }} />
            {t}
          </motion.div>
        ))}
      </div>
    </>
  );
}

const GANHOS: [NomeIcone, string][] = [
  ["navegador", "Página com o seu nome e as suas cores"],
  ["agenda", "Clientes marcam sozinhos, a qualquer hora"],
  ["whatsapp", "Lembretes prontos para enviar no WhatsApp"],
];

function ArteCadastro() {
  return (
    <>
      <div>
        <h2>Sua agenda online, pronta hoje.</h2>
        <p>Crie a conta, cadastre seus serviços e cole o link na bio do Instagram. O resto a agenda faz por você.</p>
      </div>
      <ul className="en-ganhos">
        {GANHOS.map(([icone, texto], i) => (
          <motion.li key={texto} initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 + i * 0.12, duration: 0.5, ease: ENTRAR }}>
            <Icone nome={icone} tamanho={18} />
            {texto}
          </motion.li>
        ))}
      </ul>
    </>
  );
}

/** Linha de links no pé dos formulários de acesso. */
export function PeAcesso({ children }: { children: ReactNode }) {
  return <div className="en-pe">{children}</div>;
}

/** Aviso dentro do formulário (erro geral, e-mail enviado…). */
export function AvisoAcesso({ tom = "erro", children }: { tom?: "erro" | "ok" | "info"; children: ReactNode }) {
  return (
    <div className={`en-aviso en-aviso-${tom}`} role={tom === "erro" ? "alert" : "status"}>
      <Icone nome={tom === "erro" ? "alerta" : tom === "ok" ? "okCirculo" : "info"} tamanho={18} />
      <div>{children}</div>
    </div>
  );
}

/** O banco ainda não tem o cadastro próprio (migration 008): avisa em vez de abrir o formulário. */
export function CadastroEmBreve() {
  return (
    <CascaAcesso titulo="Cadastro abre em breve" subtitulo="Estamos preparando a criação de contas pelo site. Já tem conta? Entre por aqui." arte="cadastro">
      <div className="en-campos">
        <Link href="/painel/entrar" className="ui-botao ui-botao-principal ui-botao-g">
          Entrar no painel
        </Link>
      </div>
    </CascaAcesso>
  );
}
