"use client";

// =====================================================================
// /<negocio>/a/<token> — o link que o cliente recebe.
//
// Ver, confirmar presença, adicionar à agenda, remarcar, cancelar dentro
// do prazo e, depois do atendimento, avaliar. No backend, cada ação é uma
// RPC por token (padrão da migration 036 do livo): o token só abre o
// agendamento DELE, e só no domínio do negócio certo.
// =====================================================================

import Link from "next/link";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useLoja } from "@/lib/dados/loja";
import type { Agendamento } from "@/lib/tipos";
import { Icone } from "@/components/ui/Icone";
import { Botao, Campo, Esqueleto, EstadoVazio, Selo, Texto } from "@/components/ui/basicos";
import { useAvisos, useConfirmar } from "@/components/ui/Avisos";
import type { Escolha } from "./SeletorHorario";
import { DiaHora } from "./DiaHora";
import { SeloAnimado, dadosIcs } from "./Confirmado";
import { brl, duracao, primeiroNome } from "@/lib/formato";
import { dataDe, dataLonga, difMin, horaDe } from "@/lib/datas";
import { baixarIcs, gerarIcs } from "@/lib/ics";
import { linkWhatsApp } from "@/lib/whatsapp";
import { capitalizar } from "@/components/vitrine/util";

const ROTULO: Record<Agendamento["status"], { texto: string; tom: "bom" | "atencao" | "critico" | "neutro" | "info" }> = {
  pendente: { texto: "Aguardando confirmação", tom: "atencao" },
  confirmado: { texto: "Confirmado", tom: "bom" },
  concluido: { texto: "Concluído", tom: "info" },
  cancelado: { texto: "Cancelado", tom: "critico" },
  faltou: { texto: "Não compareceu", tom: "neutro" },
};

export function Gerenciar({ token }: { token: string }) {
  const { banco, portas, agora, slug } = useLoja();
  const avisar = useAvisos();
  const confirmar = useConfirmar();
  const [modo, setModo] = useState<"ver" | "remarcar" | "avaliar">("ver");
  const [data, setData] = useState<string | null>(null);
  const [escolha, setEscolha] = useState<Escolha | null>(null);
  const [nota, setNota] = useState(5);
  const [texto, setTexto] = useState("");
  const [avaliado, setAvaliado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  // o link traz o horário do banco (na página pública não há agenda nenhuma carregada)
  const [aberto, setAberto] = useState<boolean | null>(null);
  useEffect(() => {
    if (!banco) return;
    let vivo = true;
    portas.abrirLink(token).then((ok) => vivo && setAberto(ok));
    return () => {
      vivo = false;
    };
  }, [!!banco, portas, token]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!banco || aberto === null) {
    return (
      <div className="gs" style={{ display: "grid", gap: 12 }}>
        <Esqueleto altura={28} largura={140} />
        <Esqueleto altura={44} largura="80%" />
        <Esqueleto altura={180} raio={20} />
      </div>
    );
  }
  const b = banco;
  const n = b.negocio;
  const ag = b.agendamentos.find((a) => a.token === token);
  if (!ag) {
    return (
      <div className="gs">
        <EstadoVazio
          icone="agendaX"
          titulo="Link não encontrado"
          texto="Este link não corresponde a nenhum horário. Confira a mensagem que você recebeu."
          acao={
            <Link href={`/${slug}`} className="ui-botao ui-botao-principal ui-botao-m">
              Ver {n.nome}
            </Link>
          }
        />
      </div>
    );
  }

  const momento = agora();
  const cliente = b.clientes.find((c) => c.id === ag.clienteId);
  const pro = b.profissionais.find((p) => p.id === ag.profissionalId);
  const ativo = ag.status === "pendente" || ag.status === "confirmado";
  const futuro = ag.inicio > momento;
  const horasAte = difMin(momento, ag.inicio) / 60;
  const dentroDoPrazo = horasAte >= n.regras.cancelamentoAteHoras;
  const rotulo = ROTULO[ag.status];

  const fazerCancelamento = async () => {
    const ok = await confirmar({
      titulo: "Cancelar este horário?",
      texto: "O horário fica livre para outra pessoa. Você pode marcar de novo quando quiser.",
      confirmar: "Cancelar horário",
      perigo: true,
    });
    if (!ok) return;
    const r = await portas.cancelar(ag);
    if (r.ok) avisar("Horário cancelado.");
    else avisar(r.motivo, "erro");
  };

  const fazerRemarcacao = async () => {
    if (!escolha || enviando) return;
    setEnviando(true);
    const r = await portas.remarcar(ag, escolha.data, escolha.hora, momento);
    setEnviando(false);
    if (!r.ok) {
      avisar(r.motivo, "erro");
      setEscolha(null);
      return;
    }
    setModo("ver");
    avisar("Pronto! Horário remarcado.");
  };

  return (
    <div className="gs">
      <Link href={`/${slug}`} className="vt-link" style={{ marginLeft: -14, marginBottom: 8 }}>
        <Icone nome="voltar" tamanho={18} /> {n.nome}
      </Link>

      <AnimatePresence mode="wait" initial={false}>
        {modo === "remarcar" ? (
          <motion.div key="remarcar" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} transition={{ duration: 0.25 }}>
            <h1 className="vt-titulo" style={{ marginBottom: 8 }}>
              Escolha o novo horário
            </h1>
            <p className="ag-passo-texto">
              {ag.itens.map((i) => i.nome).join(" + ")} com {primeiroNome(pro?.nome ?? "")}.
            </p>
            <DiaHora
              banco={b}
              servicosIds={ag.itens.map((i) => i.servicoId)}
              profissionalId={ag.profissionalId}
              agora={momento}
              data={data}
              hora={escolha && escolha.data === data ? escolha.hora : null}
              onData={setData}
              onHora={setEscolha}
              remarcando={{ id: ag.id, token: ag.token }}
            />
            <div className="gs-acoes">
              <Botao variante="principal" tamanho="g" disabled={!escolha} carregando={enviando} onClick={fazerRemarcacao}>
                {escolha ? `Remarcar para ${escolha.hora}` : "Escolha um horário"}
              </Botao>
              <Botao variante="fantasma" onClick={() => setModo("ver")}>
                Voltar
              </Botao>
            </div>
          </motion.div>
        ) : (
          <motion.div key="ver" initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 30 }} transition={{ duration: 0.25 }}>
            <span className="gs-estado">
              <Selo tom={rotulo.tom} icone={ag.status === "confirmado" ? "ok" : ag.status === "cancelado" ? "fechar" : undefined}>
                {rotulo.texto}
              </Selo>
            </span>
            <h1 className="vt-titulo">
              {cliente ? `${primeiroNome(cliente.nome)}, ` : ""}
              {ag.status === "concluido" ? "obrigado pela visita" : ag.status === "cancelado" ? "este horário foi cancelado" : "seu horário"}
            </h1>

            <div className="ok-bilhete" style={{ marginTop: 20 }}>
              <div className="ok-bilhete-topo">
                <small>{n.nome}</small>
                <div className="ok-bilhete-data">
                  {capitalizar(dataLonga(dataDe(ag.inicio)))}
                  <br />
                  <span>às {horaDe(ag.inicio)}</span>
                </div>
              </div>
              <div className="ok-bilhete-corte" />
              <div className="ok-bilhete-corpo">
                <div className="ag-resumo-linha">
                  <Icone nome="servicos" />
                  <div>
                    <strong>{ag.itens.map((i) => i.nome).join(" + ")}</strong>
                    <small>
                      {duracao(ag.itens.reduce((s, i) => s + i.duracaoMin, 0))}
                      {ag.total > 0 ? ` · ${brl(ag.total)}` : ""}
                    </small>
                  </div>
                </div>
                {pro && (
                  <div className="ag-resumo-linha">
                    <Icone nome="cliente" />
                    <div>
                      <strong>{pro.nome}</strong>
                      <small>{pro.cargo}</small>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {ativo && futuro && (
              <div className="gs-acoes">
                {ag.status === "pendente" && n.regras.confirmacao === "automatica" && (
                  <Botao
                    variante="principal"
                    tamanho="g"
                    icone="okCirculo"
                    onClick={async () => {
                      const r = await portas.confirmar(ag, momento);
                      if (r.ok) avisar("Presença confirmada. Até lá!");
                      else avisar(r.motivo, "erro");
                    }}
                  >
                    Confirmar presença
                  </Botao>
                )}
                <Botao variante={ag.status === "pendente" ? "secundario" : "principal"} tamanho="g" icone="agendaMais" onClick={() => baixarIcs(`${n.slug}.ics`, gerarIcs(dadosIcs(b, ag)))}>
                  Adicionar à minha agenda
                </Botao>
                {dentroDoPrazo ? (
                  <>
                    <Botao variante="secundario" icone="calendario" onClick={() => setModo("remarcar")}>
                      Remarcar
                    </Botao>
                    <Botao variante="fantasma" icone="agendaX" onClick={fazerCancelamento}>
                      Cancelar horário
                    </Botao>
                  </>
                ) : (
                  <p className="ag-politica">
                    Faltam menos de {n.regras.cancelamentoAteHoras}h para o horário. Para remarcar ou cancelar, fale direto com {n.nome}.
                  </p>
                )}
                {n.contato.whatsapp && (
                  <a className="ui-botao ui-botao-secundario ui-botao-m" href={linkWhatsApp(n.contato.whatsapp, `Olá! Sobre meu horário de ${dataLonga(dataDe(ag.inicio))} às ${horaDe(ag.inicio)}...`)} target="_blank" rel="noopener noreferrer">
                    <Icone nome="whatsapp" tamanho={18} /> Falar com {n.nome}
                  </a>
                )}
              </div>
            )}

            {(ag.status === "cancelado" || (!futuro && ag.status !== "concluido")) && (
              <div className="gs-acoes">
                <Link href={`/${slug}/agendar?servico=${ag.itens[0]?.servicoId ?? ""}`} className="ui-botao ui-botao-principal ui-botao-g">
                  Agendar novamente
                </Link>
              </div>
            )}

            {ag.status === "concluido" && n.modulos.avaliacoes && (
              <div className="ok-bloco">
                {avaliado ? (
                  <div style={{ textAlign: "center", display: "grid", justifyItems: "center", gap: 10 }}>
                    <SeloAnimado />
                    <strong>Obrigado pela avaliação!</strong>
                  </div>
                ) : (
                  <>
                    <h2>
                      <Icone nome="estrela" /> Como foi?
                    </h2>
                    <div className="ag-estrelas-escolha" role="radiogroup" aria-label="Nota">
                      {[1, 2, 3, 4, 5].map((i) => (
                        <motion.button key={i} type="button" role="radio" aria-checked={nota === i} aria-label={`${i} estrelas`} onClick={() => setNota(i)} whileTap={{ scale: 0.8 }}>
                          <Icone nome="estrela" tamanho={32} peso={i <= nota ? "fill" : "regular"} />
                        </motion.button>
                      ))}
                    </div>
                    <Campo rotulo="Conte em uma frase" opcional>
                      <Texto rows={3} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="O que você mais gostou?" />
                    </Campo>
                    <Botao
                      variante="principal"
                      carregando={enviando}
                      onClick={async () => {
                        const nome = cliente ? `${primeiroNome(cliente.nome)} ${cliente.nome.split(" ").at(-1)?.charAt(0) ?? ""}.` : "Cliente";
                        setEnviando(true);
                        const r = await portas.avaliar(ag, nota, texto, nome, momento.slice(0, 10));
                        setEnviando(false);
                        if (r.ok) setAvaliado(true);
                        else avisar(r.motivo, "erro");
                      }}
                    >
                      Enviar avaliação
                    </Botao>
                  </>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
