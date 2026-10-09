"use client";

// Para quem acabou de criar o negócio: os quatro passos até o primeiro
// cliente marcar sozinho. Some quando o catálogo e a página estão prontos,
// ou quando a pessoa fecha.

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { BotaoCopiar, BotaoIcone } from "@/components/ui/basicos";
import { Icone, type NomeIcone } from "@/components/ui/Icone";
import type { Banco } from "@/lib/tipos";

export function PrimeirosPassos({ b }: { b: Banco }) {
  const n = b.negocio;
  const chave = `livo-agenda:passos-fechados:${n.slug}`;
  const [fechado, setFechado] = useState(true);
  const [link, setLink] = useState(`agenda.livo.tec.br/${n.slug}`);

  useEffect(() => {
    try {
      setFechado(localStorage.getItem(chave) === "1");
    } catch {
      setFechado(false);
    }
    setLink(`${window.location.host}/${n.slug}`);
  }, [chave, n.slug]);

  const temServico = b.servicos.some((s) => s.ativo);
  const paginaPronta = Boolean(n.logoUrl || n.tagline);
  if (fechado || (temServico && paginaPronta)) return null;

  const passos: { icone: NomeIcone; titulo: string; texto: string; href?: string; feito?: boolean }[] = [
    { icone: "servicos", titulo: "Cadastre seus serviços", texto: "Nome, duração e preço. É o que o cliente escolhe.", href: "/painel/servicos", feito: temServico },
    { icone: "relogio", titulo: "Confira seus horários", texto: "Dias da semana, ou só datas marcadas.", href: "/painel/configuracoes?s=funcionamento" },
    { icone: "paleta", titulo: "Deixe a página com a sua cara", texto: "Logo, cores e uma frase curta.", href: "/painel/configuracoes?s=pagina", feito: paginaPronta },
    { icone: "instagram", titulo: "Coloque o link na bio", texto: link },
  ];

  const fechar = () => {
    setFechado(true);
    try {
      localStorage.setItem(chave, "1");
    } catch {}
  };

  return (
    <motion.section className="pn-cartao pp" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: [0.23, 1, 0.32, 1] }}>
      <div className="pn-cartao-cabeca">
        <h2>
          <Icone nome="raio" tamanho={18} /> Primeiros passos
        </h2>
        <BotaoIcone icone="fechar" rotulo="Fechar os primeiros passos" tamanho={16} onClick={fechar} />
      </div>
      <ol className="pp-lista">
        {passos.map((p, i) => {
          const corpo = (
            <>
              <span className={`pp-marca${p.feito ? " feito" : ""}`}>{p.feito ? <Icone nome="ok" tamanho={14} peso="bold" /> : i + 1}</span>
              <span className="pp-texto">
                <strong>{p.titulo}</strong>
                <small>{p.texto}</small>
              </span>
            </>
          );
          return (
            <li key={p.titulo} className={p.feito ? "feito" : ""}>
              {p.href ? (
                <Link href={p.href} className="pp-item">
                  {corpo}
                  <Icone nome="direita" tamanho={16} />
                </Link>
              ) : (
                <div className="pp-item">
                  {corpo}
                  <BotaoCopiar texto={`https://${link.replace(/^https?:\/\//, "")}`} rotulo="Copiar link" />
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </motion.section>
  );
}
