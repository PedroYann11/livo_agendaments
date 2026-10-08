"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { motion } from "motion/react";
import { Botao, Campo, Entrada } from "@/components/ui/basicos";
import { entrarComSenha } from "@/lib/sessao";
import { supabaseOn } from "@/lib/supabase";
import { PALETA } from "@/lib/paleta";

export default function Entrar() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  const entrar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    setCarregando(true);
    const r = await entrarComSenha(email, senha);
    setCarregando(false);
    if (!r.ok) return setErro(r.motivo);
    router.replace("/painel");
  };

  return (
    <div className="en">
      <aside className="en-arte">
        <span className="en-arte-grade" />
        <div style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 650 }}>
          <span className="pn-negocio-simbolo" style={{ background: "#f4f4f5", color: "#17171a" }}>
            L
          </span>
          Livo Agenda
        </div>
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
            <motion.div key={h} initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 + i * 0.12, duration: 0.5, ease: [0.23, 1, 0.32, 1] }}>
              <b>{h}</b>
              <i style={{ background: c }} />
              {t}
            </motion.div>
          ))}
        </div>
      </aside>

      <main className="en-form">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}>
          <h1>Entrar no painel</h1>
          <p>Use o e-mail cadastrado pela Livo.</p>
          <form onSubmit={entrar} style={{ display: "grid", gap: 14, marginTop: 24 }}>
            <Campo rotulo="E-mail">
              <Entrada type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@seunegocio.com" required icone="cliente" />
            </Campo>
            <Campo rotulo="Senha" erro={erro}>
              <Entrada type="password" autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} required icone="cadeado" />
            </Campo>
            <Botao type="submit" variante="principal" tamanho="g" carregando={carregando} disabled={!supabaseOn}>
              Entrar
            </Botao>
            {!supabaseOn && <small style={{ color: "var(--c-texto-3)" }}>Login real ainda não configurado neste ambiente.</small>}
          </form>

        </motion.div>
      </main>
    </div>
  );
}
