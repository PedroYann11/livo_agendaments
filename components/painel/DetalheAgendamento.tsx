"use client";

// =====================================================================
// O detalhe de um agendamento — onde a operação do dia acontece.
// Cada estado mostra só as ações que fazem sentido nele.
// =====================================================================

import Link from "next/link";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useLoja } from "@/lib/dados/loja";
import type { Agendamento, Banco, FormaPagamento } from "@/lib/tipos";
import { Folha } from "@/components/ui/Folha";
import { Icone, type NomeIcone } from "@/components/ui/Icone";
import { Avatar, Botao, Campo, Entrada, Selo } from "@/components/ui/basicos";
import { useAvisos, useConfirmar } from "@/components/ui/Avisos";
import { SeletorHorario, type Escolha } from "@/components/agendar/SeletorHorario";
import { cancelar, concluir, marcarSinalPago, mudarStatus, registrarMensagem, remarcar } from "@/lib/dados/acoes";
import { estatisticaCliente } from "@/lib/metricas";
import { brl, duracao, primeiroNome } from "@/lib/formato";
import { aniversarioEntre, dataCurta, dataDe, dataLonga, haQuanto, horaDe, somarDias } from "@/lib/datas";
import { centavosParaReais, formatarValorCampo, mascaraTelefone } from "@/lib/masks";
import { linkWhatsApp, mensagemPara } from "@/lib/whatsapp";
import { corDaPessoa } from "@/lib/paleta";
import type { TipoMensagem } from "@/lib/tipos";

export const STATUS: Record<Agendamento["status"], { rotulo: string; tom: "bom" | "atencao" | "critico" | "neutro" | "info"; icone: NomeIcone }> = {
  pendente: { rotulo: "A confirmar", tom: "atencao", icone: "ampulheta" },
  confirmado: { rotulo: "Confirmado", tom: "bom", icone: "ok" },
  concluido: { rotulo: "Concluído", tom: "info", icone: "okCirculo" },
  cancelado: { rotulo: "Cancelado", tom: "neutro", icone: "fechar" },
  faltou: { rotulo: "Faltou", tom: "critico", icone: "proibido" },
};

export const CANAL: Record<Agendamento["canal"], string> = { online: "Pelo link", painel: "Pelo painel", whatsapp: "Pelo WhatsApp" };

export const FORMAS: { id: FormaPagamento; rotulo: string; icone: NomeIcone }[] = [
  { id: "pix", rotulo: "Pix", icone: "pix" },
  { id: "dinheiro", rotulo: "Dinheiro", icone: "dinheiro" },
  { id: "debito", rotulo: "Débito", icone: "cartao" },
  { id: "credito", rotulo: "Crédito", icone: "cartao" },
  { id: "pacote", rotulo: "Pacote", icone: "pacote" },
];

export function enviarWhats(b: Banco, tipo: TipoMensagem, ag: Agendamento, mudar: (fn: (b: Banco) => Banco) => void, agora: string) {
  const c = b.clientes.find((x) => x.id === ag.clienteId);
  if (!c) return;
  window.open(linkWhatsApp(c.telefone, mensagemPara(b, tipo, c, ag, window.location.origin)), "_blank", "noopener");
  mudar((x) => registrarMensagem(x, tipo, c.id, ag.id, agora));
}

export function DetalheAgendamento({ id, onFechar }: { id: string | null; onFechar: () => void }) {
  const { banco } = useLoja();
  const ag = id && banco ? banco.agendamentos.find((a) => a.id === id) : null;
  return (
    <Folha
      aberta={!!ag}
      onFechar={onFechar}
      largura={480}
      titulo={ag ? `${horaDe(ag.inicio)} · ${dataCurta(dataDe(ag.inicio))}` : ""}
      subtitulo={ag ? <Selo tom={STATUS[ag.status].tom} icone={STATUS[ag.status].icone}>{STATUS[ag.status].rotulo}</Selo> : undefined}
    >
      {ag && banco && <Conteudo b={banco} ag={ag} onFechar={onFechar} />}
    </Folha>
  );
}

function Conteudo({ b, ag, onFechar }: { b: Banco; ag: Agendamento; onFechar: () => void }) {
  const { mudar, agora } = useLoja();
  const avisar = useAvisos();
  const confirmarDialogo = useConfirmar();
  const [modo, setModo] = useState<"ver" | "concluir" | "remarcar">("ver");
  const [forma, setForma] = useState<FormaPagamento>(ag.pacoteClienteId ? "pacote" : "pix");
  const [valor, setValor] = useState(ag.pacoteClienteId ? 0 : ag.total - (ag.sinal?.pago ? ag.sinal.valor : 0));
  const [data, setData] = useState<string | null>(null);
  const [escolha, setEscolha] = useState<Escolha | null>(null);
  const [proRemarcar, setProRemarcar] = useState<string | null>(ag.profissionalId);

  useEffect(() => setModo("ver"), [ag.id]);

  const momento = agora();
  const hoje = momento.slice(0, 10);
  const c = b.clientes.find((x) => x.id === ag.clienteId);
  const pro = b.profissionais.find((p) => p.id === ag.profissionalId);
  const est = c ? estatisticaCliente(b, c.id, momento) : null;
  const n = b.negocio;
  const comecou = ag.inicio <= momento;
  const ativo = ag.status === "pendente" || ag.status === "confirmado";

  // alertas de quem vai atender
  const alertas: { texto: string; critico?: boolean; acao?: { rotulo: string; fazer: () => void } }[] = [];
  if (n.modulos.anamnese) {
    for (const item of ag.itens) {
      const s = b.servicos.find((x) => x.id === item.servicoId);
      if (!s?.fichaId) continue;
      const modelo = b.modelosFicha.find((m) => m.id === s.fichaId);
      const ficha = b.fichas.filter((f) => f.clienteId === ag.clienteId && f.modeloId === s.fichaId).at(-1);
      if (!ficha && modelo) {
        alertas.push({
          texto: `Sem ${modelo.nome.toLowerCase()}.`,
          acao: c
            ? {
                rotulo: "Enviar link",
                fazer: () =>
                  window.open(
                    linkWhatsApp(c.telefone, `Oi, ${primeiroNome(c.nome)}! Antes do seu horário, preencha sua ficha (leva 2 minutos): ${window.location.origin}/${n.slug}/ficha/${ag.token}`),
                    "_blank",
                    "noopener",
                  ),
              }
            : undefined,
        });
      } else if (ficha && modelo) {
        const marcados = modelo.campos.filter((campo) => {
          const r = ficha.respostas[campo.id];
          return campo.alerta && (Array.isArray(r) ? r.includes(campo.alerta) : r === campo.alerta);
        });
        if (marcados.length) alertas.push({ texto: `Atenção na ficha: ${marcados.map((m) => m.rotulo.replace(/\?$/, "")).join("; ")}.`, critico: true });
      }
    }
  }
  if (est && est.faltas >= 2) alertas.push({ texto: `${primeiroNome(c!.nome)} já faltou ${est.faltas} vezes.`, critico: est.faltas >= 3 });
  if (c?.nascimento && aniversarioEntre(c.nascimento, hoje, somarDias(hoje, 6))) alertas.push({ texto: `Aniversário em ${dataCurta(hoje.slice(0, 4) + c.nascimento.slice(4))}.` });
  if (ag.sinal && !ag.sinal.pago && ativo) {
    alertas.push({
      texto: `Sinal de ${brl(ag.sinal.valor)} ainda não pago.`,
      acao: {
        rotulo: "Marcar pago",
        fazer: () => {
          mudar((x) => marcarSinalPago(x, ag.id));
          avisar("Sinal registrado.");
        },
      },
    });
  }
  const pacote = ag.pacoteClienteId ? b.pacotesClientes.find((p) => p.id === ag.pacoteClienteId) : null;
  const pacoteDef = pacote ? b.pacotes.find((p) => p.id === pacote.pacoteId) : null;

  const fazerCancelar = async () => {
    const ok = await confirmarDialogo({ titulo: "Cancelar este horário?", texto: "O horário volta a ficar livre na agenda e no site.", confirmar: "Cancelar horário", perigo: true });
    if (!ok) return;
    mudar((x) => cancelar(x, ag.id, "negocio", ""));
    avisar("Horário cancelado.", "ok", c ? { rotulo: "Avisar cliente", fazer: () => enviarWhats(b, "cancelamento", ag, mudar, momento) } : undefined);
  };

  const fazerConcluir = () => {
    mudar((x) => concluir(x, ag.id, { forma, valor }, momento));
    setModo("ver");
    avisar(`Atendimento concluído · ${brl(valor)}`, "ok", c ? { rotulo: "Agradecer", fazer: () => enviarWhats(b, "pos_atendimento", ag, mudar, momento) } : undefined);
  };

  const fazerRemarcar = () => {
    if (!escolha) return;
    const r = remarcar(b, ag.id, { data: escolha.data, hora: escolha.hora, profissionalId: proRemarcar, agora: momento, encaixe: true });
    if (!r.ok) return avisar(r.motivo, "erro");
    mudar(() => r.banco);
    setModo("ver");
    avisar(`Remarcado para ${dataCurta(escolha.data)}, ${escolha.hora}.`, "ok", c ? { rotulo: "Avisar cliente", fazer: () => enviarWhats(r.banco, "confirmacao", r.valor, mudar, momento) } : undefined);
  };

  return (
    <AnimatePresence mode="wait" initial={false}>
      {modo === "concluir" ? (
        <motion.div key="concluir" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.22 }} style={{ display: "grid", gap: 18 }}>
          <div>
            <h3 style={{ fontSize: 17, fontWeight: 650 }}>Concluir e receber</h3>
            <p style={{ color: "var(--c-texto-2)", fontSize: 14 }}>{ag.itens.map((i) => i.nome).join(" + ")}</p>
          </div>
          <div className="dt-formas">
            {FORMAS.filter((f) => f.id !== "pacote" || ag.pacoteClienteId).map((f) => (
              <button
                key={f.id}
                type="button"
                className="dt-forma"
                aria-pressed={forma === f.id}
                onClick={() => {
                  setForma(f.id);
                  if (f.id === "pacote") setValor(0);
                  else if (valor === 0) setValor(ag.total - (ag.sinal?.pago ? ag.sinal.valor : 0));
                }}
              >
                <Icone nome={f.icone} tamanho={20} />
                {f.rotulo}
              </button>
            ))}
          </div>
          {forma === "pacote" && pacoteDef && pacote ? (
            <div className="dt-alerta" style={{ background: "var(--info-sutil)", color: "var(--info)" }}>
              <Icone nome="pacote" tamanho={18} />
              <span>
                Usa 1 sessão do {pacoteDef.nome}: fica {pacote.sessoesUsadas + 1} de {pacoteDef.sessoes}.
              </span>
            </div>
          ) : (
            <Campo rotulo="Valor recebido" ajuda={ag.sinal?.pago ? `Sinal de ${brl(ag.sinal.valor)} já pago antes.` : undefined}>
              <Entrada inputMode="numeric" value={formatarValorCampo(valor)} onChange={(e) => setValor(centavosParaReais(e.target.value))} icone="dinheiro" />
            </Campo>
          )}
          <div style={{ display: "grid", gap: 8 }}>
            <Botao variante="principal" tamanho="g" icone="okCirculo" onClick={fazerConcluir}>
              Concluir · {brl(valor)}
            </Botao>
            <Botao variante="fantasma" onClick={() => setModo("ver")}>
              Voltar
            </Botao>
          </div>
        </motion.div>
      ) : modo === "remarcar" ? (
        <motion.div key="remarcar" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.22 }} style={{ display: "grid", gap: 16 }}>
          <h3 style={{ fontSize: 17, fontWeight: 650 }}>Remarcar</h3>
          <div className="na-servicos">
            {b.profissionais
              .filter((p) => p.ativo && ag.itens.every((i) => p.servicosIds.includes(i.servicoId)))
              .map((p) => (
                <button key={p.id} type="button" className="na-servico" aria-pressed={proRemarcar === p.id} onClick={() => { setProRemarcar(p.id); setEscolha(null); }}>
                  <span className="ag-ponto-pro" style={{ background: corDaPessoa(p.cor) }} /> {primeiroNome(p.nome)}
                </button>
              ))}
          </div>
          <SeletorHorario
            banco={b}
            servicosIds={ag.itens.map((i) => i.servicoId)}
            profissionalId={proRemarcar}
            agora={momento}
            data={data}
            hora={escolha && escolha.data === data ? escolha.hora : null}
            onData={setData}
            onHora={setEscolha}
            ignorarAgendamentoId={ag.id}
            encaixe
            dias={60}
          />
          <div style={{ display: "grid", gap: 8 }}>
            <Botao variante="principal" tamanho="g" disabled={!escolha} onClick={fazerRemarcar}>
              {escolha ? `Remarcar para ${dataCurta(escolha.data)}, ${escolha.hora}` : "Escolha o novo horário"}
            </Botao>
            <Botao variante="fantasma" onClick={() => setModo("ver")}>
              Voltar
            </Botao>
          </div>
        </motion.div>
      ) : (
        <motion.div key="ver" initial={{ opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 24 }} transition={{ duration: 0.22 }}>
          {c && (
            <>
              <div className="dt-cliente">
                <Avatar nome={c.nome} tamanho={48} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <strong>{c.nome}</strong>
                  <small>{mascaraTelefone(c.telefone)}</small>
                </div>
                <Link href={`/painel/clientes/${c.id}`} className="ui-botao ui-botao-secundario ui-botao-p" onClick={onFechar}>
                  Ficha
                </Link>
              </div>
              {est && (
                <div className="dt-numeros">
                  <div>
                    <small>Visitas</small>
                    <b>{est.visitas}</b>
                  </div>
                  <div>
                    <small>Gasto total</small>
                    <b>{brl(est.gasto).replace(",00", "")}</b>
                  </div>
                  <div>
                    <small>Última vez</small>
                    <b style={{ fontSize: 14 }}>{est.ultima && est.ultima.id !== ag.id ? haQuanto(dataDe(est.ultima.inicio), hoje) : "primeira"}</b>
                  </div>
                </div>
              )}
            </>
          )}

          {alertas.length > 0 && (
            <div className="dt-bloco">
              {alertas.map((a, i) => (
                <div key={i} className={`dt-alerta${a.critico ? " critico" : ""}`}>
                  <Icone nome={a.critico ? "alerta" : "info"} tamanho={18} />
                  <span style={{ flex: 1 }}>{a.texto}</span>
                  {a.acao && (
                    <button type="button" onClick={a.acao.fazer} style={{ fontWeight: 650, textDecoration: "underline", textUnderlineOffset: 2 }}>
                      {a.acao.rotulo}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="dt-bloco">
            <h3>Atendimento</h3>
            <div className="pn-cartao" style={{ boxShadow: "none" }}>
              <div className="pn-lista">
                {ag.itens.map((i) => (
                  <div key={i.servicoId} className="pn-linha" style={{ padding: "10px 14px" }}>
                    <span className="pn-linha-info">
                      <strong>{i.nome}</strong>
                      <small>{duracao(i.duracaoMin)}</small>
                    </span>
                    <span className="pn-linha-lado">
                      <b>{brl(i.preco)}</b>
                    </span>
                  </div>
                ))}
                {/* cada desconto com o seu nome; agendamento antigo (antes da 010) só tem o total */}
                {(ag.descontos?.length
                  ? ag.descontos.map((d) => ({ chave: d.tipo, nome: d.percentual !== null ? `${d.nome} · ${d.percentual}%` : d.nome, valor: d.valor }))
                  : ag.desconto > 0
                    ? [{ chave: "desconto", nome: `Desconto${ag.cupom ? ` (${ag.cupom})` : ""}`, valor: ag.desconto }]
                    : []
                ).map((d) => (
                  <div key={d.chave} className="pn-linha" style={{ padding: "10px 14px" }}>
                    <span className="pn-linha-info">
                      <strong>{d.nome}</strong>
                    </span>
                    <span className="pn-linha-lado">
                      <b>−{brl(d.valor)}</b>
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ display: "grid", gap: 8, fontSize: 14 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className="ag-ponto-pro" style={{ background: corDaPessoa(pro?.cor ?? 0) }} />
                {pro?.nome}
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--c-texto-2)" }}>
                <Icone nome="relogio" tamanho={16} />
                {dataLonga(dataDe(ag.inicio))}, {horaDe(ag.inicio)}–{horaDe(ag.fim)}
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--c-texto-2)" }}>
                <Icone nome="navegador" tamanho={16} />
                {CANAL[ag.canal]} · criado {haQuanto(dataDe(ag.criadoEm), hoje)}
                {ag.lembreteEm && " · lembrete enviado"}
              </span>
              {pacote && pacoteDef && (
                <span style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--c-texto-2)" }}>
                  <Icone nome="pacote" tamanho={16} />
                  {pacoteDef.nome}: {pacote.sessoesUsadas}/{pacoteDef.sessoes} sessões usadas
                </span>
              )}
              {ag.pagamento && (
                <span style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--bom)", fontWeight: 560 }}>
                  <Icone nome="okCirculo" tamanho={16} />
                  Recebido {brl(ag.pagamento.valor)} · {FORMAS.find((f) => f.id === ag.pagamento!.forma)?.rotulo}
                </span>
              )}
              {ag.observacao && (
                <span style={{ display: "flex", gap: 8, padding: "10px 12px", borderRadius: 10, background: "var(--c-sutil)" }}>
                  <Icone nome="nota" tamanho={16} />
                  {ag.observacao}
                </span>
              )}
            </div>
          </div>

          <div className="dt-bloco">
            <h3>Ações</h3>
            <div className="dt-acoes">
              {ag.status === "pendente" && (
                <Botao
                  className="largo"
                  variante="principal"
                  icone="ok"
                  onClick={() => {
                    mudar((x) => mudarStatus(x, ag.id, "confirmado", momento));
                    avisar("Confirmado.", "ok", { rotulo: "Avisar cliente", fazer: () => enviarWhats(b, "confirmacao", ag, mudar, momento) });
                  }}
                >
                  Confirmar horário
                </Botao>
              )}
              {ativo && (comecou || dataDe(ag.inicio) === hoje) && (
                <Botao className="largo" variante={ag.status === "pendente" ? "secundario" : "principal"} icone="dinheiro" onClick={() => setModo("concluir")}>
                  Concluir e receber
                </Botao>
              )}
              {ativo && (
                <>
                  <Botao variante="secundario" icone="whatsapp" onClick={() => enviarWhats(b, ag.status === "pendente" || dataDe(ag.inicio) > hoje ? "lembrete" : "confirmacao", ag, mudar, momento)}>
                    {dataDe(ag.inicio) > hoje ? "Lembrete" : "WhatsApp"}
                  </Botao>
                  <Botao variante="secundario" icone="calendario" onClick={() => setModo("remarcar")}>
                    Remarcar
                  </Botao>
                  {comecou && (
                    <Botao
                      variante="secundario"
                      icone="proibido"
                      onClick={() => {
                        mudar((x) => mudarStatus(x, ag.id, "faltou", momento));
                        avisar("Marcado como falta.");
                      }}
                    >
                      Faltou
                    </Botao>
                  )}
                  <Botao variante="fantasma" icone="agendaX" onClick={fazerCancelar}>
                    Cancelar
                  </Botao>
                </>
              )}
              {!ativo && (
                <>
                  <Botao
                    variante="secundario"
                    icone="desfazer"
                    onClick={() => {
                      mudar((x) => ({
                        ...mudarStatus(x, ag.id, "confirmado", momento),
                        agendamentos: mudarStatus(x, ag.id, "confirmado", momento).agendamentos.map((a) => (a.id === ag.id ? { ...a, pagamento: null, canceladoPor: null } : a)),
                      }));
                      avisar("Reaberto.");
                    }}
                  >
                    Reabrir
                  </Botao>
                  {c && (
                    <Botao variante="secundario" icone="whatsapp" onClick={() => enviarWhats(b, ag.status === "concluido" ? "pos_atendimento" : "retorno", ag, mudar, momento)}>
                      {ag.status === "concluido" ? "Agradecer" : "Chamar de volta"}
                    </Botao>
                  )}
                </>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
