"use client";

// =====================================================================
// Avisos no celular: ligar neste aparelho, mandar um teste e, no iPhone,
// o passo a passo para pôr o painel na Tela de Início (sem isso a Apple
// não entrega aviso). Em Configurações › Avisos no celular; no Início, um
// convite discreto enquanto este aparelho ainda não recebe.
// =====================================================================

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useLoja } from "@/lib/dados/loja";
import { desligarAvisos, ligarAvisos, lerSituacao, plataforma, testarAvisos, type SituacaoAvisos } from "@/lib/avisos";
import { Icone, type NomeIcone } from "@/components/ui/Icone";
import { Botao, BotaoIcone, Interruptor } from "@/components/ui/basicos";
import { useAvisos } from "@/components/ui/Avisos";

function useSituacao() {
  const { slug, remoto } = useLoja();
  const [s, setS] = useState<SituacaoAvisos | null>(null);
  const [erro, setErro] = useState(false);
  const ler = useCallback(async () => {
    if (!remoto) return;
    try {
      setS(await lerSituacao(slug));
      setErro(false);
    } catch {
      setErro(true);
    }
  }, [slug, remoto]);
  useEffect(() => {
    ler();
  }, [ler]);
  return { s, erro, ler, slug, remoto };
}

const mensagem = (e: unknown) => (e instanceof Error && e.message ? e.message : "Não deu certo agora. Tente de novo.");

/** O passo a passo, com o ícone que a pessoa vai procurar na tela. */
function Passos({ passos }: { passos: { icone: NomeIcone; texto: React.ReactNode }[] }) {
  return (
    <ol className="av-passos">
      {passos.map((p, i) => (
        <li key={i}>
          <span className="av-passo-numero">{i + 1}</span>
          <span className="av-passo-icone" aria-hidden="true">
            <Icone nome={p.icone} tamanho={18} />
          </span>
          <span>{p.texto}</span>
        </li>
      ))}
    </ol>
  );
}

function Recado({ children }: { children: React.ReactNode }) {
  return <p className="av-recado">{children}</p>;
}

export function SecaoAvisos() {
  const { s, erro, ler, slug, remoto } = useSituacao();
  const avisar = useAvisos();
  const [ocupado, setOcupado] = useState<"ligar" | "desligar" | "testar" | null>(null);

  if (!remoto) return <Recado>Os avisos funcionam quando o painel está ligado ao servidor.</Recado>;
  if (erro)
    return (
      <div style={{ display: "grid", gap: 10, justifyItems: "start" }}>
        <Recado>Não foi possível ver os avisos agora.</Recado>
        <Botao variante="secundario" icone="retorno" onClick={ler}>
          Tentar de novo
        </Botao>
      </div>
    );
  if (!s) return <Recado>Vendo este aparelho…</Recado>;

  // chamado direto do toque: o iPhone só pede permissão dentro do gesto
  const ligar = async () => {
    setOcupado("ligar");
    try {
      await ligarAvisos(slug, s.chave!);
      await testarAvisos(slug).catch(() => {});
      avisar("Avisos ligados. Um aviso de teste deve chegar em alguns segundos.");
    } catch (e) {
      avisar(mensagem(e), "erro");
    }
    await ler();
    setOcupado(null);
  };
  const desligar = async () => {
    setOcupado("desligar");
    try {
      await desligarAvisos(slug);
      avisar("Avisos desligados neste aparelho.");
    } catch (e) {
      avisar(mensagem(e), "erro");
    }
    await ler();
    setOcupado(null);
  };
  const testar = async () => {
    setOcupado("testar");
    try {
      await testarAvisos(slug);
      avisar("Aviso de teste enviado. Deve chegar em alguns segundos.");
    } catch (e) {
      avisar(mensagem(e), "erro");
    }
    setOcupado(null);
  };

  const iphone = plataforma() === "ios-safari";
  let corpo: React.ReactNode;

  if (s.motivo === "ios-precisa-instalar") {
    corpo = (
      <>
        <Recado>No iPhone, os avisos só chegam com a Agenda na Tela de Início — é uma regra da Apple. Leva um minuto:</Recado>
        <Passos
          passos={[
            { icone: "compartilhar", texto: <>Aqui no Safari, toque em <b>Compartilhar</b> (o quadrado com a seta para cima, na barra de baixo).</> },
            { icone: "telaDeInicio", texto: <>Role e toque em <b>Adicionar à Tela de Início</b>, depois em <b>Adicionar</b>.</> },
            { icone: "celular", texto: <>Abra a <b>Agenda</b> pelo ícone novo, entre com seu e-mail e senha e volte a esta tela para ligar os avisos.</> },
          ]}
        />
      </>
    );
  } else if (s.motivo === "ios-precisa-safari") {
    corpo = <Recado>No iPhone, os avisos só funcionam pelo Safari. Abra agenda.livo.tec.br/painel no Safari e siga o passo a passo que aparece aqui.</Recado>;
  } else if (s.motivo === "ios-versao-antiga") {
    corpo = <Recado>Este iPhone precisa de atualização para receber avisos (iOS 16.4 ou mais novo): Ajustes › Geral › Atualização de Software.</Recado>;
  } else if (s.motivo === "sem-suporte") {
    corpo = <Recado>Este navegador não recebe avisos. No celular, use o Chrome (Android) ou o Safari (iPhone); no computador, Chrome, Edge, Firefox ou Safari.</Recado>;
  } else if (!s.chave) {
    corpo = <Recado>Os avisos ainda estão sendo preparados no servidor. Tente de novo daqui a alguns minutos.</Recado>;
  } else if (s.negado) {
    corpo = (
      <Recado>
        Os avisos estão bloqueados neste aparelho.{" "}
        {iphone
          ? "Para liberar: Ajustes do iPhone › Notificações › Agenda › Permitir Notificações. Depois volte aqui."
          : "Para liberar: toque no cadeado ao lado do endereço do site › Permissões › Notificações › Permitir. Depois volte aqui."}
      </Recado>
    );
  } else {
    corpo = (
      <>
        <div className="pn-opcao">
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            <span
              className="ini-atencao-icone"
              style={{ width: 36, height: 36, background: s.ligado ? "var(--c-marca-sutil)" : "var(--c-sutil)", color: s.ligado ? "var(--c-marca-tinta)" : "var(--c-texto-3)" }}
            >
              <Icone nome="sino" tamanho={18} />
            </span>
            <div>
              <strong>Receber avisos neste aparelho</strong>
              <small>{s.ligado ? "Ligado. Chega mesmo com o painel fechado." : "Desligado."}</small>
            </div>
          </div>
          <Interruptor ligado={s.ligado} desabilitado={ocupado !== null} onMudar={(v) => (v ? ligar() : desligar())} rotulo="Receber avisos neste aparelho" />
        </div>
        {s.ligado && (
          <div style={{ display: "grid", gap: 8, justifyItems: "start" }}>
            <Botao variante="secundario" icone="enviar" carregando={ocupado === "testar"} onClick={testar}>
              Mandar um aviso de teste
            </Botao>
            <Recado>Não chegou? Confira se o celular não está em modo Foco ou Não Perturbe.</Recado>
          </div>
        )}
      </>
    );
  }

  return (
    <>
      {corpo}
      {s.aparelhos > 0 && (
        <Recado>
          {s.aparelhos === 1 ? "1 aparelho da equipe recebe" : `${s.aparelhos} aparelhos da equipe recebem`} os avisos deste negócio.
        </Recado>
      )}
    </>
  );
}

const DISPENSADO = "livo-agenda:convite-avisos";

/** No Início: um lembrete enquanto este aparelho pode receber e ainda não recebe. */
export function ConviteAvisos() {
  const { s } = useSituacao();
  const [dispensado, setDispensado] = useState(true);
  useEffect(() => {
    try {
      setDispensado(localStorage.getItem(DISPENSADO) === "1");
    } catch {
      setDispensado(false);
    }
  }, []);

  const cabe = s && s.chave && !s.ligado && !s.negado && (s.motivo === "ok" || s.motivo === "ios-precisa-instalar");
  if (!cabe || dispensado) return null;

  return (
    <div className="av-convite">
      <Link href="/painel/configuracoes?s=avisos" className="ini-atencao">
        <span className="ini-atencao-icone" style={{ background: "var(--c-marca-sutil)", color: "var(--c-marca-tinta)" }}>
          <Icone nome="sino" tamanho={20} />
        </span>
        <div>
          <strong>Saiba na hora quando alguém agendar</strong>
          <small>Ligue os avisos neste {s.motivo === "ios-precisa-instalar" || /Android|iPhone/i.test(navigator.userAgent) ? "celular" : "aparelho"}.</small>
        </div>
        <Icone nome="direita" tamanho={16} />
      </Link>
      <BotaoIcone
        icone="fechar"
        rotulo="Agora não"
        onClick={() => {
          setDispensado(true);
          try {
            localStorage.setItem(DISPENSADO, "1");
          } catch {}
        }}
      />
    </div>
  );
}
