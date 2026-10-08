"use client";

// =====================================================================
// Mensagens — o WhatsApp ASSISTIDO (fase 1, custo zero).
//
// O painel monta a lista do dia (lembretes de amanhã, quem falta
// confirmar, aniversariantes, quem passou do tempo de voltar) e cada
// mensagem sai pronta com um toque. O envio automático pela API oficial
// é a fase 7 (docs/PLANEJAMENTO.md, seção 7).
// =====================================================================

import { useSearchParams } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useBanco, useLoja } from "@/lib/dados/loja";
import { Cabecalho } from "../Cabecalho";
import { Icone } from "@/components/ui/Icone";
import { Avatar, Botao, EstadoVazio, Interruptor, Segmentado, Selo, Texto } from "@/components/ui/basicos";
import { useAvisos } from "@/components/ui/Avisos";
import type { Agendamento, Banco, Cliente, ModeloMensagem, TipoMensagem } from "@/lib/tipos";
import { registrarMensagem, salvarMensagem } from "@/lib/dados/acoes";
import { aniversariantes, clientesParaRetorno } from "@/lib/metricas";
import { TITULOS, VARIAVEIS, linkWhatsApp, mensagemPara, preencher } from "@/lib/whatsapp";
import { dataCurta, dataLonga, haQuanto, somarDias, somarMin } from "@/lib/datas";
import { primeiroNome } from "@/lib/formato";

type Aba = "hoje" | "aniversarios" | "retorno" | "modelos";

export function Mensagens() {
  const b = useBanco();
  const params = useSearchParams();
  const [aba, setAba] = useState<Aba>((params.get("aba") as Aba) ?? "hoje");
  const n = b.negocio;
  return (
    <div className="pn-pagina">
      <Cabecalho titulo="Mensagens" texto="Lembretes e recados prontos — um toque e abre o WhatsApp." />
      <div style={{ marginBottom: 14 }}>
        <Segmentado
          rotulo="Seção"
          valor={aba}
          onMudar={setAba}
          opcoes={[
            { id: "hoje", rotulo: "Para enviar", icone: "enviar" },
            ...(n.modulos.aniversarios ? [{ id: "aniversarios" as const, rotulo: "Aniversários", icone: "bolo" as const }] : []),
            ...(n.modulos.retorno ? [{ id: "retorno" as const, rotulo: "Hora de voltar", icone: "retorno" as const }] : []),
            { id: "modelos", rotulo: "Modelos", icone: "editar" },
          ]}
        />
      </div>
      {aba === "hoje" && <ParaEnviar b={b} />}
      {aba === "aniversarios" && <Aniversarios b={b} />}
      {aba === "retorno" && <Retorno b={b} />}
      {aba === "modelos" && <Modelos b={b} />}
    </div>
  );
}

function useEnviar() {
  const { mudar, agora } = useLoja();
  const avisar = useAvisos();
  return (b: Banco, tipo: TipoMensagem, cliente: Cliente, ag: Agendamento | null) => {
    if (!cliente.consentimentoWhats) {
      avisar(`${primeiroNome(cliente.nome)} pediu para não receber mensagens.`, "erro");
      return;
    }
    window.open(linkWhatsApp(cliente.telefone, mensagemPara(b, tipo, cliente, ag, window.location.origin)), "_blank", "noopener");
    mudar((x) => registrarMensagem(x, tipo, cliente.id, ag?.id ?? null, agora()));
  };
}

function enviadaHoje(b: Banco, tipo: TipoMensagem, clienteId: string, agId: string | null, hoje: string) {
  return b.registrosMensagem.some((r) => r.tipo === tipo && r.clienteId === clienteId && (agId ? r.agendamentoId === agId : true) && r.enviadaEm.slice(0, 10) === hoje);
}

function Linha({
  cliente,
  titulo,
  texto,
  enviada,
  rotulo,
  onEnviar,
}: {
  cliente: Cliente;
  titulo?: string;
  texto: string;
  enviada: boolean;
  rotulo: string;
  onEnviar: () => void;
}) {
  return (
    <div className="pn-linha">
      <Avatar nome={cliente.nome} tamanho={36} />
      <span className="pn-linha-info">
        <strong>{titulo ?? cliente.nome}</strong>
        <small>{texto}</small>
      </span>
      <AnimatePresence mode="wait" initial={false}>
        {enviada ? (
          <motion.span key="ok" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 500, damping: 28 }}>
            <Selo tom="bom" icone="ok">
              Enviada
            </Selo>
          </motion.span>
        ) : (
          <motion.span key="botao" exit={{ scale: 0.8, opacity: 0 }}>
            <Botao variante="suave" tamanho="p" icone="whatsapp" onClick={onEnviar}>
              {rotulo}
            </Botao>
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}

function Grupo({ icone, titulo, texto, children, vazio }: { icone: Parameters<typeof Icone>[0]["nome"]; titulo: string; texto: string; children: React.ReactNode; vazio: boolean }) {
  return (
    <div className="pn-cartao">
      <div className="pn-cartao-cabeca">
        <h2>
          <Icone nome={icone} tamanho={18} /> {titulo}
        </h2>
      </div>
      <p className="pn-cartao-sub" style={{ padding: "0 18px" }}>
        {texto}
      </p>
      <div className="pn-lista" style={{ marginTop: 8 }}>
        {vazio ? <p style={{ padding: "8px 18px 16px", fontSize: 14, color: "var(--c-texto-3)" }}>Nada pendente aqui.</p> : children}
      </div>
    </div>
  );
}

function ParaEnviar({ b }: { b: Banco }) {
  const { agora } = useLoja();
  const enviar = useEnviar();
  const momento = agora();
  const hoje = momento.slice(0, 10);
  const amanha = somarDias(hoje, 1);
  const cli = (id: string) => b.clientes.find((c) => c.id === id)!;

  const lembretes = b.agendamentos
    .filter((a) => a.inicio.slice(0, 10) === amanha && (a.status === "confirmado" || a.status === "pendente"))
    .filter((a) => !a.lembreteEm || a.lembreteEm.slice(0, 10) === hoje)
    .sort((a, c) => (a.inicio < c.inicio ? -1 : 1));
  const confirmar = b.agendamentos
    .filter((a) => a.status === "pendente" && a.inicio >= momento && a.inicio <= somarMin(momento, 48 * 60) && a.inicio.slice(0, 10) !== amanha)
    .sort((a, c) => (a.inicio < c.inicio ? -1 : 1));
  const pos = b.agendamentos.filter((a) => a.status === "concluido" && a.inicio.slice(0, 10) === hoje);
  const faltam = lembretes.filter((a) => !a.lembreteEm).length;

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div className="pn-cartao pn-cartao-corpo" style={{ display: "flex", gap: 14, alignItems: "center", background: "var(--c-marca-sutil)", borderColor: "transparent" }}>
        <Icone nome="raio" tamanho={22} />
        <div style={{ flex: 1, fontSize: 14 }}>
          <strong style={{ display: "block" }}>
            {faltam ? `${faltam} lembretes de amanhã para enviar` : "Lembretes de amanhã: tudo enviado"}
          </strong>
          <span style={{ color: "var(--c-texto-2)" }}>Lembrete na véspera reduz as faltas pela metade. O envio automático chega com o WhatsApp oficial.</span>
        </div>
      </div>
      <div className="pn-grade g2">
        <Grupo icone="sino" titulo={`Lembretes · ${dataCurta(amanha)}`} texto="Quem tem horário amanhã." vazio={!lembretes.length}>
          {lembretes.map((a) => (
            <Linha
              key={a.id}
              cliente={cli(a.clienteId)}
              texto={`${a.inicio.slice(11)} · ${a.itens.map((i) => i.nome).join(" + ")}`}
              enviada={!!a.lembreteEm}
              rotulo="Lembrar"
              onEnviar={() => enviar(b, "lembrete", cli(a.clienteId), a)}
            />
          ))}
        </Grupo>
        <div style={{ display: "grid", gap: 14, alignContent: "start" }}>
          <Grupo icone="ampulheta" titulo="Pedir confirmação" texto="Horários a confirmar nos próximos 2 dias." vazio={!confirmar.length}>
            {confirmar.map((a) => (
              <Linha
                key={a.id}
                cliente={cli(a.clienteId)}
                texto={`${dataCurta(a.inicio.slice(0, 10))}, ${a.inicio.slice(11)} · ${a.itens[0].nome}`}
                enviada={enviadaHoje(b, "lembrete", a.clienteId, a.id, hoje)}
                rotulo="Pedir"
                onEnviar={() => enviar(b, "lembrete", cli(a.clienteId), a)}
              />
            ))}
          </Grupo>
          <Grupo icone="coracao" titulo="Agradecer" texto="Atendidos hoje — e pedir uma avaliação." vazio={!pos.length}>
            {pos.map((a) => (
              <Linha
                key={a.id}
                cliente={cli(a.clienteId)}
                texto={`${a.inicio.slice(11)} · ${a.itens[0].nome}`}
                enviada={enviadaHoje(b, "pos_atendimento", a.clienteId, a.id, hoje)}
                rotulo="Agradecer"
                onEnviar={() => enviar(b, "pos_atendimento", cli(a.clienteId), a)}
              />
            ))}
          </Grupo>
        </div>
      </div>
    </div>
  );
}

function Aniversarios({ b }: { b: Banco }) {
  const { agora } = useLoja();
  const enviar = useEnviar();
  const hoje = agora().slice(0, 10);
  const lista = aniversariantes(b, hoje, somarDias(hoje, 30));
  return (
    <div className="pn-cartao">
      {lista.length === 0 ? (
        <EstadoVazio icone="bolo" titulo="Nenhum aniversário nos próximos 30 dias" texto="Peça a data de nascimento no cadastro — o agendamento online já pergunta." />
      ) : (
        <div className="pn-lista">
          {lista.map((c) => {
            const dia = `${hoje.slice(0, 4)}-${c.nascimento!.slice(5)}`;
            const ehHoje = c.nascimento!.slice(5) === hoje.slice(5);
            return (
              <Linha
                key={c.id}
                cliente={c}
                texto={ehHoje ? "Hoje!" : dataLonga(dia < hoje ? `${Number(hoje.slice(0, 4)) + 1}-${c.nascimento!.slice(5)}` : dia)}
                enviada={b.registrosMensagem.some((r) => r.tipo === "aniversario" && r.clienteId === c.id && r.enviadaEm.slice(0, 4) === hoje.slice(0, 4))}
                rotulo={ehHoje ? "Parabenizar" : "Agendar parabéns"}
                onEnviar={() => enviar(b, "aniversario", c, null)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function Retorno({ b }: { b: Banco }) {
  const { agora } = useLoja();
  const enviar = useEnviar();
  const hoje = agora().slice(0, 10);
  const lista = useMemo(() => clientesParaRetorno(b, hoje), [b, hoje]);
  return (
    <div className="pn-cartao">
      <p className="pn-cartao-sub" style={{ padding: "14px 18px 0" }}>
        Clientes que passaram do prazo de retorno do último serviço (configurado em cada serviço) e não têm nada marcado.
      </p>
      {lista.length === 0 ? (
        <EstadoVazio icone="retorno" titulo="Todo mundo em dia" />
      ) : (
        <div className="pn-lista" style={{ marginTop: 8 }}>
          {lista.map((x) => (
            <Linha
              key={x.cliente.id}
              cliente={x.cliente}
              texto={`${x.servico} ${haQuanto(x.ultima.inicio.slice(0, 10), hoje)} · ${x.diasAtraso ? `${x.diasAtraso} dias além do prazo` : "vence hoje"}`}
              enviada={enviadaHoje(b, "retorno", x.cliente.id, null, hoje)}
              rotulo="Chamar"
              onEnviar={() => enviar(b, "retorno", x.cliente, x.ultima)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Modelos({ b }: { b: Banco }) {
  const { mudar } = useLoja();
  const avisar = useAvisos();
  const [tipo, setTipo] = useState<TipoMensagem>("confirmacao");
  const atual = b.mensagens.find((m) => m.tipo === tipo)!;
  const [rascunho, setRascunho] = useState<ModeloMensagem>(atual);
  const [ultimo, setUltimo] = useState(tipo);
  if (ultimo !== tipo) {
    setUltimo(tipo);
    setRascunho(atual);
  }
  const area = useRef<HTMLTextAreaElement>(null);
  const exemplo = preencher(rascunho.texto, {
    nome: "Mariana",
    servico: b.servicos.find((s) => s.destaque)?.nome ?? "Corte",
    data: "sexta-feira, 10 de outubro",
    hora: "14:30",
    profissional: primeiroNome(b.profissionais[0]?.nome ?? ""),
    negocio: b.negocio.nome,
    endereco: `${b.negocio.endereco.rua}, ${b.negocio.endereco.numero}`,
    link: `agenda.livo.tec.br/${b.negocio.slug}/a/…`,
  });

  const inserir = (v: string) => {
    const el = area.current;
    const ini = el?.selectionStart ?? rascunho.texto.length;
    const fim = el?.selectionEnd ?? ini;
    const texto = rascunho.texto.slice(0, ini) + v + rascunho.texto.slice(fim);
    setRascunho({ ...rascunho, texto });
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(ini + v.length, ini + v.length);
    });
  };

  return (
    <div className="pn-grade g-21">
      <div className="pn-cartao">
        <div className="pn-cartao-cabeca" style={{ flexWrap: "wrap" }}>
          <div className="pn-fichas">
            {b.mensagens.map((m) => (
              <button key={m.tipo} type="button" className="pn-ficha" aria-pressed={tipo === m.tipo} onClick={() => setTipo(m.tipo)}>
                {TITULOS[m.tipo]}
              </button>
            ))}
          </div>
        </div>
        <div className="pn-cartao-corpo" style={{ display: "grid", gap: 12 }}>
          <Texto ref={area} rows={8} value={rascunho.texto} onChange={(e) => setRascunho({ ...rascunho, texto: e.target.value })} />
          <div>
            <small style={{ color: "var(--c-texto-2)", display: "block", marginBottom: 6 }}>Toque para inserir no texto:</small>
            <div className="ms-variaveis">
              {VARIAVEIS.map((v) => (
                <button key={v.chave} type="button" title={v.rotulo} onClick={() => inserir(v.chave)}>
                  {v.chave}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <Interruptor ligado={rascunho.ativo} onMudar={(v) => setRascunho({ ...rascunho, ativo: v })} rotulo="Usar esta mensagem" mostrarRotulo />
            <div style={{ display: "flex", gap: 8 }}>
              <Botao variante="fantasma" onClick={() => setRascunho(atual)} disabled={rascunho === atual}>
                Desfazer
              </Botao>
              <Botao
                variante="principal"
                onClick={() => {
                  mudar((x) => salvarMensagem(x, rascunho));
                  avisar("Modelo salvo.");
                }}
              >
                Salvar modelo
              </Botao>
            </div>
          </div>
          <small style={{ color: "var(--c-texto-3)" }}>Sem emoji: alguns celulares mostram “?” no lugar. Texto simples chega igual para todo mundo.</small>
        </div>
      </div>
      <div>
        <div className="ms-celular">
          <small style={{ textAlign: "center", color: "#667781", fontSize: 12, marginBottom: 4 }}>Prévia · como o cliente recebe</small>
          <AnimatePresence mode="popLayout">
            <motion.div key={tipo} className="ms-bolha" initial={{ opacity: 0, y: 12, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0 }} transition={{ type: "spring", stiffness: 420, damping: 30 }}>
              {exemplo}
              <small>14:02 ✓✓</small>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
