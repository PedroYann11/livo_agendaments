"use client";

// =====================================================================
// /<negocio>/ficha/<token> — a ficha de anamnese que o cliente preenche
// no celular antes de chegar.
//
// Dado de saúde é dado SENSÍVEL na LGPD (art. 11): o consentimento é
// explícito, separado e com a finalidade escrita. No backend, a ficha só é
// legível por quem atende (PLANEJAMENTO, 4.6).
// =====================================================================

import Link from "next/link";
import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { useLoja } from "@/lib/dados/loja";
import type { CampoFicha, ModeloFicha } from "@/lib/tipos";
import { Icone } from "@/components/ui/Icone";
import { Botao, Campo, Entrada, Esqueleto, EstadoVazio, Texto } from "@/components/ui/basicos";
import { useAvisos } from "@/components/ui/Avisos";
import { SeloAnimado } from "./Confirmado";
import { salvarFicha } from "@/lib/dados/acoes";
import { novoId } from "@/lib/id";
import { primeiroNome } from "@/lib/formato";

export function FichaPublica({ token }: { token: string }) {
  const { banco, mudar, agora, slug } = useLoja();
  const avisar = useAvisos();
  const [respostas, setRespostas] = useState<Record<string, string | string[]>>({});
  const [assinatura, setAssinatura] = useState("");
  const [consentimento, setConsentimento] = useState(false);
  const [erros, setErros] = useState<Record<string, boolean>>({});
  const [feito, setFeito] = useState(false);

  const ag = banco?.agendamentos.find((a) => a.token === token);
  const modelo: ModeloFicha | undefined = useMemo(() => {
    if (!banco || !ag) return undefined;
    const ids = ag.itens.map((i) => banco.servicos.find((s) => s.id === i.servicoId)?.fichaId).filter(Boolean) as string[];
    return banco.modelosFicha.find((m) => ids.includes(m.id) && m.ativo);
  }, [banco, ag]);

  if (!banco) return <div className="gs"><Esqueleto altura={300} raio={20} /></div>;
  const n = banco.negocio;
  const cliente = ag ? banco.clientes.find((c) => c.id === ag.clienteId) : undefined;

  if (!ag || !modelo || !n.modulos.anamnese) {
    return (
      <div className="gs">
        <EstadoVazio icone="ficha" titulo="Nenhuma ficha para preencher" texto="Este link não tem ficha pendente." acao={<Link href={`/${slug}`} className="ui-botao ui-botao-secundario ui-botao-m">Voltar</Link>} />
      </div>
    );
  }

  if (feito) {
    return (
      <div className="ok-tela">
        <SeloAnimado />
        <h1 className="vt-titulo">Ficha enviada!</h1>
        <p>Obrigado{cliente ? `, ${primeiroNome(cliente.nome)}` : ""}. Suas respostas ficam só no seu prontuário, com {n.nome}.</p>
        <div className="gs-acoes">
          <Link href={`/${slug}/a/${token}`} className="ui-botao ui-botao-principal ui-botao-g">
            Ver meu horário
          </Link>
        </div>
      </div>
    );
  }

  const enviar = () => {
    const e: Record<string, boolean> = {};
    for (const c of modelo.campos) {
      const v = respostas[c.id];
      if (c.obrigatorio && (!v || (Array.isArray(v) && !v.length))) e[c.id] = true;
    }
    if (assinatura.trim().split(/\s+/).length < 2) e._assinatura = true;
    if (!consentimento) e._consentimento = true;
    setErros(e);
    if (Object.keys(e).length) {
      avisar("Faltam algumas respostas.", "erro");
      document.querySelector(".com-erro, [data-erro]")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    mudar((b) =>
      salvarFicha(b, {
        id: novoId("fc"),
        modeloId: modelo.id,
        clienteId: ag.clienteId,
        agendamentoId: ag.id,
        respostas,
        preenchidaEm: agora(),
        assinatura: assinatura.trim(),
      }),
    );
    setFeito(true);
    window.scrollTo({ top: 0 });
  };

  return (
    <div className="gs">
      <Link href={`/${slug}/a/${token}`} className="vt-link" style={{ marginLeft: -14, marginBottom: 8 }}>
        <Icone nome="voltar" tamanho={18} /> Meu horário
      </Link>
      <span className="vt-sobretitulo">{n.nome}</span>
      <h1 className="vt-titulo">{modelo.nome.replace(/^Anamnese\s*·\s*/i, "Ficha de ")}</h1>
      <p className="ag-passo-texto" style={{ marginTop: 10 }}>
        {modelo.descricao || "Responda com calma. Isso garante um atendimento seguro para a sua pele."}
      </p>
      <div className="ag-form">
        {modelo.campos.map((c, i) => (
          <motion.div key={c.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 6) * 0.04, duration: 0.35 }}>
            <Pergunta campo={c} valor={respostas[c.id]} erro={!!erros[c.id]} onMudar={(v) => setRespostas((r) => ({ ...r, [c.id]: v }))} />
          </motion.div>
        ))}

        <div className="ficha-campo" data-erro={erros._consentimento || undefined}>
          <strong>Consentimento</strong>
          <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 14, color: "var(--c-texto-2)" }}>
            <input type="checkbox" checked={consentimento} onChange={(e) => setConsentimento(e.target.checked)} style={{ marginTop: 4, width: 18, height: 18, accentColor: "var(--c-marca)" }} />
            Declaro que as informações são verdadeiras e autorizo {n.nome} a guardá-las no meu prontuário, apenas para a segurança do meu atendimento (LGPD, art. 11).
          </label>
          {erros._consentimento && <span className="ui-campo-erro">Precisamos da sua autorização.</span>}
        </div>

        <Campo rotulo="Assinatura (seu nome completo)" erro={erros._assinatura ? "Escreva nome e sobrenome." : null}>
          <Entrada value={assinatura} onChange={(e) => setAssinatura(e.target.value)} placeholder={cliente?.nome ?? "Nome completo"} autoComplete="name" />
        </Campo>
        <Botao variante="principal" tamanho="g" onClick={enviar}>
          Enviar ficha
        </Botao>
      </div>
    </div>
  );
}

export function Pergunta({
  campo,
  valor,
  erro,
  onMudar,
}: {
  campo: CampoFicha;
  valor: string | string[] | undefined;
  erro: boolean;
  onMudar: (v: string | string[]) => void;
}) {
  const titulo = (
    <>
      <strong>
        {campo.rotulo}
        {!campo.obrigatorio && <em style={{ fontStyle: "normal", fontWeight: 450, color: "var(--c-texto-3)" }}> · opcional</em>}
      </strong>
      {campo.ajuda && <small>{campo.ajuda}</small>}
    </>
  );
  if (campo.tipo === "simNao" || campo.tipo === "escolha" || campo.tipo === "multipla") {
    const opcoes = campo.tipo === "simNao" ? ["Sim", "Não"] : campo.opcoes;
    const multipla = campo.tipo === "multipla";
    const lista = Array.isArray(valor) ? valor : valor ? [valor] : [];
    return (
      <div className="ficha-campo" data-erro={erro || undefined} style={erro ? { borderColor: "var(--critico)" } : undefined}>
        {titulo}
        <div className="ficha-escolhas">
          {opcoes.map((o) => {
            const ativo = lista.includes(o);
            return (
              <button
                key={o}
                type="button"
                aria-pressed={ativo}
                onClick={() => {
                  if (!multipla) return onMudar(o);
                  if (o === "Nenhuma") return onMudar(ativo ? [] : ["Nenhuma"]);
                  const sem = lista.filter((x) => x !== "Nenhuma");
                  onMudar(ativo ? sem.filter((x) => x !== o) : [...sem, o]);
                }}
              >
                {o}
              </button>
            );
          })}
        </div>
        {erro && <span className="ui-campo-erro">Escolha uma opção.</span>}
      </div>
    );
  }
  return (
    <div className="ficha-campo" data-erro={erro || undefined} style={erro ? { borderColor: "var(--critico)" } : undefined}>
      {titulo}
      {campo.tipo === "textoLongo" ? (
        <Texto value={(valor as string) ?? ""} onChange={(e) => onMudar(e.target.value)} />
      ) : (
        <Entrada type={campo.tipo === "data" ? "date" : "text"} value={(valor as string) ?? ""} onChange={(e) => onMudar(e.target.value)} />
      )}
      {erro && <span className="ui-campo-erro">Campo obrigatório.</span>}
    </div>
  );
}
