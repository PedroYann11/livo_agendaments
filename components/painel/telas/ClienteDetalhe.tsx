"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useBanco, useLoja } from "@/lib/dados/loja";
import { usePainel } from "../PainelRaiz";
import { STATUS, FORMAS } from "../DetalheAgendamento";
import { FormCliente } from "./Clientes";
import { Icone } from "@/components/ui/Icone";
import { Avatar, Botao, EstadoVazio, Medidor, Segmentado, Selo } from "@/components/ui/basicos";
import { Folha } from "@/components/ui/Folha";
import { useAvisos, useConfirmar } from "@/components/ui/Avisos";
import type { FormaPagamento } from "@/lib/tipos";
import { estatisticaCliente, realizado } from "@/lib/metricas";
import { brl, primeiroNome } from "@/lib/formato";
import { dataBr, dataCurta, dataExtenso, haQuanto, idade } from "@/lib/datas";
import { mascaraTelefone } from "@/lib/masks";
import { linkWhatsApp } from "@/lib/whatsapp";
import { corDaPessoa } from "@/lib/paleta";
import { venderPacote } from "@/lib/dados/acoes";

export function ClienteDetalhe({ id }: { id: string }) {
  const b = useBanco();
  const { agora, mudar } = useLoja();
  const { novo, abrir } = usePainel();
  const router = useRouter();
  const avisar = useAvisos();
  const confirmar = useConfirmar();
  const [aba, setAba] = useState<"historico" | "fichas" | "pacotes">("historico");
  const [editar, setEditar] = useState(false);
  const [vender, setVender] = useState(false);
  const [fichaAberta, setFichaAberta] = useState<string | null>(null);
  const momento = agora();
  const hoje = momento.slice(0, 10);
  const c = b.clientes.find((x) => x.id === id);

  if (!c) {
    return (
      <div className="pn-pagina">
        <EstadoVazio icone="cliente" titulo="Cliente não encontrado" acao={<Link href="/painel/clientes" className="ui-botao ui-botao-secundario ui-botao-m">Voltar</Link>} />
      </div>
    );
  }

  const n = b.negocio;
  const est = estatisticaCliente(b, c.id, momento);
  const historico = b.agendamentos.filter((a) => a.clienteId === c.id).sort((a, x) => (a.inicio > x.inicio ? -1 : 1));
  const fichas = b.fichas.filter((f) => f.clienteId === c.id).sort((a, x) => (a.preenchidaEm > x.preenchidaEm ? -1 : 1));
  const pacotes = b.pacotesClientes.filter((p) => p.clienteId === c.id);
  const abas = [
    { id: "historico" as const, rotulo: "Histórico", contagem: historico.length },
    ...(n.modulos.anamnese ? [{ id: "fichas" as const, rotulo: "Fichas", contagem: fichas.length }] : []),
    ...(n.modulos.pacotes ? [{ id: "pacotes" as const, rotulo: "Pacotes", contagem: pacotes.length }] : []),
  ];
  const ficha = fichaAberta ? b.fichas.find((f) => f.id === fichaAberta) : null;
  const modeloFicha = ficha ? b.modelosFicha.find((m) => m.id === ficha.modeloId) : null;

  return (
    <div className="pn-pagina">
      <div style={{ paddingTop: 16 }}>
        <Link href="/painel/clientes" className="pn-link">
          <Icone nome="voltar" tamanho={16} /> Clientes
        </Link>
      </div>

      <div className="pn-cabeca" style={{ alignItems: "center" }}>
        <div style={{ display: "flex", gap: 16, alignItems: "center", minWidth: 0 }}>
          <Avatar nome={c.nome} tamanho={64} />
          <div style={{ minWidth: 0 }}>
            <h1>{c.nome}</h1>
            <p style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              {mascaraTelefone(c.telefone)}
              {c.nascimento && <span>· {idade(c.nascimento, hoje)} anos</span>}
              {c.tags.map((t) => (
                <Selo key={t} tom="marca">
                  {t}
                </Selo>
              ))}
            </p>
          </div>
        </div>
        <div className="pn-cabeca-acoes">
          <a className="ui-botao ui-botao-secundario ui-botao-m" href={linkWhatsApp(c.telefone, `Oi, ${primeiroNome(c.nome)}! `)} target="_blank" rel="noopener noreferrer">
            <Icone nome="whatsapp" tamanho={18} /> WhatsApp
          </a>
          <Botao variante="secundario" icone="editar" onClick={() => setEditar(true)}>
            Editar
          </Botao>
          <Botao variante="principal" icone="agendaMais" onClick={() => novo({ clienteId: c.id, servicoId: est.ultima?.itens[0]?.servicoId })}>
            Agendar
          </Botao>
        </div>
      </div>

      <div className="pn-kpis" style={{ marginBottom: 14 }}>
        <div className="pn-cartao pn-kpi">
          <span className="pn-kpi-rotulo">Visitas</span>
          <span className="pn-kpi-valor">{est.visitas}</span>
          <span className="pn-kpi-rodape">{est.ultima ? `última ${haQuanto(est.ultima.inicio.slice(0, 10), hoje)}` : "ainda não veio"}</span>
        </div>
        <div className="pn-cartao pn-kpi">
          <span className="pn-kpi-rotulo">Gasto total</span>
          <span className="pn-kpi-valor">{brl(est.gasto)}</span>
          <span className="pn-kpi-rodape">ticket médio {brl(est.ticket)}</span>
        </div>
        <div className="pn-cartao pn-kpi">
          <span className="pn-kpi-rotulo">Faltas</span>
          <span className="pn-kpi-valor" style={{ color: est.faltas >= 2 ? "var(--critico)" : undefined }}>
            {est.faltas}
          </span>
          <span className="pn-kpi-rodape">{est.cancelamentos} cancelamentos</span>
        </div>
        <div className="pn-cartao pn-kpi">
          <span className="pn-kpi-rotulo">Preferido</span>
          <span className="pn-kpi-valor" style={{ fontSize: 17, whiteSpace: "normal" }}>
            {est.favorito ?? "—"}
          </span>
          <span className="pn-kpi-rodape">cliente desde {dataBr(c.criadoEm.slice(0, 10))}</span>
        </div>
      </div>

      <div className="pn-grade g-21">
        <div className="pn-cartao" style={{ alignSelf: "start" }}>
          <div className="pn-cartao-cabeca" style={{ paddingBottom: 12 }}>
            <Segmentado rotulo="Seções" tamanho="p" valor={aba} onMudar={setAba} opcoes={abas} />
            {aba === "pacotes" && (
              <Botao variante="suave" tamanho="p" icone="pacote" onClick={() => setVender(true)}>
                Vender pacote
              </Botao>
            )}
          </div>
          {aba === "historico" && (
            <div className="pn-lista">
              {historico.length === 0 && <EstadoVazio icone="agenda" titulo="Nenhum atendimento ainda" />}
              {historico.map((a) => {
                const p = b.profissionais.find((x) => x.id === a.profissionalId);
                return (
                  <button key={a.id} type="button" className="pn-linha" onClick={() => abrir(a.id)}>
                    <span className="pn-barra-cor" style={{ background: corDaPessoa(p?.cor ?? 0) }} />
                    <span className="pn-linha-info">
                      <strong>{a.itens.map((i) => i.nome).join(" + ")}</strong>
                      <small>
                        {dataCurta(a.inicio.slice(0, 10))} {a.inicio.slice(0, 4)}, {a.inicio.slice(11)} · {primeiroNome(p?.nome ?? "")}
                        {a.pagamento ? ` · ${FORMAS.find((f) => f.id === a.pagamento!.forma)?.rotulo}` : ""}
                      </small>
                    </span>
                    <span className="pn-linha-lado">
                      <b>{a.status === "concluido" ? brl(realizado(a)) : brl(a.total)}</b>
                      <Selo tom={STATUS[a.status].tom}>{STATUS[a.status].rotulo}</Selo>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          {aba === "fichas" && (
            <div className="pn-lista">
              {fichas.length === 0 && <EstadoVazio icone="ficha" titulo="Nenhuma ficha preenchida" texto="A ficha é pedida automaticamente quando o cliente marca um serviço que exige anamnese." />}
              {fichas.map((f) => {
                const m = b.modelosFicha.find((x) => x.id === f.modeloId);
                const alertas = m?.campos.filter((campo) => {
                  const r = f.respostas[campo.id];
                  return campo.alerta && (Array.isArray(r) ? r.includes(campo.alerta) : r === campo.alerta);
                }) ?? [];
                return (
                  <button key={f.id} type="button" className="pn-linha" onClick={() => setFichaAberta(f.id)}>
                    <Icone nome="ficha" />
                    <span className="pn-linha-info">
                      <strong>{m?.nome}</strong>
                      <small>
                        Preenchida em {dataBr(f.preenchidaEm.slice(0, 10))} · assinada por {f.assinatura}
                      </small>
                    </span>
                    {alertas.length > 0 ? <Selo tom="critico" icone="alerta">{alertas.length} atenção</Selo> : <Selo tom="bom">OK</Selo>}
                  </button>
                );
              })}
            </div>
          )}
          {aba === "pacotes" && (
            <div className="pn-lista">
              {pacotes.length === 0 && <EstadoVazio icone="pacote" titulo="Nenhum pacote" texto="Venda um pacote de sessões e o sistema desconta a cada atendimento." />}
              {pacotes.map((pc) => {
                const p = b.pacotes.find((x) => x.id === pc.pacoteId);
                if (!p) return null;
                const restam = p.sessoes - pc.sessoesUsadas;
                return (
                  <div key={pc.id} className="pn-linha" style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
                    <span style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                      <strong style={{ fontSize: 14.5 }}>{p.nome}</strong>
                      <Selo tom={restam === 0 ? "neutro" : pc.validoAte < hoje ? "critico" : "bom"}>{restam === 0 ? "Concluído" : pc.validoAte < hoje ? "Vencido" : `${restam} restantes`}</Selo>
                    </span>
                    <Medidor valor={pc.sessoesUsadas / p.sessoes} rotulo="Sessões usadas" />
                    <small style={{ color: "var(--c-texto-2)" }}>
                      {pc.sessoesUsadas} de {p.sessoes} sessões · comprado em {dataBr(pc.compradoEm)} · válido até {dataBr(pc.validoAte)}
                    </small>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div style={{ display: "grid", gap: 14, alignContent: "start" }}>
          {est.proxima && (
            <button type="button" className="ini-proximo" style={{ textAlign: "left" }} onClick={() => abrir(est.proxima!.id)}>
              <small>Próximo horário</small>
              <div className="ini-proximo-linha">
                <span className="ini-proximo-hora">{est.proxima.inicio.slice(11)}</span>
                <div>
                  <strong>{dataCurta(est.proxima.inicio.slice(0, 10))}</strong>
                  <span>{est.proxima.itens.map((i) => i.nome).join(" + ")}</span>
                </div>
              </div>
            </button>
          )}
          <div className="pn-cartao">
            <div className="pn-cartao-cabeca">
              <h2>
                <Icone nome="nota" tamanho={18} /> Anotações
              </h2>
            </div>
            <div className="pn-cartao-corpo" style={{ fontSize: 14, color: c.observacoes ? "var(--c-texto)" : "var(--c-texto-3)", whiteSpace: "pre-wrap" }}>
              {c.observacoes || "Nada anotado. Toque em Editar para registrar preferências."}
            </div>
          </div>
          <div className="pn-cartao pn-cartao-corpo" style={{ display: "grid", gap: 10, fontSize: 14 }}>
            <span style={{ display: "flex", gap: 8, alignItems: "center", color: "var(--c-texto-2)" }}>
              <Icone nome="bolo" tamanho={16} /> {c.nascimento ? dataExtenso(c.nascimento) : "Aniversário não informado"}
            </span>
            {c.email && (
              <span style={{ display: "flex", gap: 8, alignItems: "center", color: "var(--c-texto-2)" }}>
                <Icone nome="enviar" tamanho={16} /> {c.email}
              </span>
            )}
            <span style={{ display: "flex", gap: 8, alignItems: "center", color: "var(--c-texto-2)" }}>
              <Icone nome="whatsapp" tamanho={16} /> {c.consentimentoWhats ? "Aceita mensagens no WhatsApp" : "Não quer receber mensagens"}
            </span>
            <span style={{ display: "flex", gap: 8, alignItems: "center", color: "var(--c-texto-2)" }}>
              <Icone nome="info" tamanho={16} /> Chegou {c.origem === "online" ? "pelo link de agendamento" : c.origem === "importado" ? "por importação" : "pelo painel"}
            </span>
            <button
              type="button"
              className="pn-link"
              style={{ color: "var(--critico)", justifySelf: "start", marginTop: 6 }}
              onClick={async () => {
                const ok = await confirmar({
                  titulo: `Apagar os dados de ${primeiroNome(c.nome)}?`,
                  texto: "Pedido de exclusão (LGPD): nome, telefone e fichas são apagados. Os atendimentos ficam no histórico financeiro sem identificação.",
                  confirmar: "Apagar dados",
                  perigo: true,
                });
                if (!ok) return;
                mudar((x) => ({
                  ...x,
                  clientes: x.clientes.map((y) => (y.id === c.id ? { ...y, nome: "Cliente removido", telefone: "", email: "", nascimento: null, observacoes: "", tags: [] } : y)),
                  fichas: x.fichas.filter((f) => f.clienteId !== c.id),
                }));
                avisar("Dados apagados.");
                router.push("/painel/clientes");
              }}
            >
              Apagar dados do cliente (LGPD)
            </button>
          </div>
        </div>
      </div>

      {editar && <FormCliente cliente={c} onFechar={() => setEditar(false)} />}

      <Folha aberta={!!ficha} onFechar={() => setFichaAberta(null)} titulo={modeloFicha?.nome ?? "Ficha"} subtitulo={ficha ? `Preenchida em ${dataBr(ficha.preenchidaEm.slice(0, 10))}` : undefined}>
        {ficha && modeloFicha && (
          <div style={{ display: "grid", gap: 12 }}>
            {modeloFicha.campos.map((campo) => {
              const r = ficha.respostas[campo.id];
              const texto = Array.isArray(r) ? r.join(", ") : r;
              const alerta = campo.alerta && (Array.isArray(r) ? r.includes(campo.alerta) : r === campo.alerta);
              return (
                <div key={campo.id} className={alerta ? "dt-alerta critico" : undefined} style={alerta ? { flexDirection: "column", gap: 2 } : { display: "grid", gap: 2, paddingBottom: 10, borderBottom: "1px solid var(--c-linha)" }}>
                  <small style={{ color: alerta ? "inherit" : "var(--c-texto-2)", fontSize: 12.5 }}>{campo.rotulo}</small>
                  <strong style={{ fontSize: 14.5 }}>{texto || "—"}</strong>
                </div>
              );
            })}
            <p style={{ fontSize: 12.5, color: "var(--c-texto-3)" }}>
              Assinada eletronicamente por {ficha.assinatura}. Dado sensível (LGPD, art. 11) — visível só para a equipe que atende.
            </p>
          </div>
        )}
      </Folha>

      <VenderPacote aberta={vender} onFechar={() => setVender(false)} onVender={(pid, forma) => mudar((x) => venderPacote(x, pid, c.id, hoje, forma))} />
    </div>
  );
}

function VenderPacote({ aberta, onFechar, onVender }: { aberta: boolean; onFechar: () => void; onVender: (pacoteId: string, forma: FormaPagamento) => void }) {
  const b = useBanco();
  const avisar = useAvisos();
  const [pid, setPid] = useState<string | null>(null);
  const [forma, setForma] = useState<FormaPagamento>("pix");
  return (
    <Folha
      aberta={aberta}
      onFechar={onFechar}
      titulo="Vender pacote"
      rodape={
        <Botao
          variante="principal"
          disabled={!pid}
          onClick={() => {
            onVender(pid!, forma);
            avisar("Pacote vendido. As sessões já aparecem no próximo atendimento.");
            onFechar();
          }}
        >
          Registrar venda
        </Botao>
      }
    >
      <div style={{ display: "grid", gap: 16 }}>
        <div className="pn-checks">
          {b.pacotes
            .filter((p) => p.ativo)
            .map((p) => (
              <label key={p.id} className="pn-check">
                <input type="radio" name="pacote" checked={pid === p.id} onChange={() => setPid(p.id)} />
                <span>
                  {p.nome}
                  <br />
                  <small>
                    {p.sessoes} sessões · válido por {Math.round(p.validadeDias / 30)} meses
                  </small>
                </span>
                <strong>{brl(p.preco)}</strong>
              </label>
            ))}
        </div>
        <div className="dt-formas">
          {FORMAS.filter((f) => f.id !== "pacote").map((f) => (
            <button key={f.id} type="button" className="dt-forma" aria-pressed={forma === f.id} onClick={() => setForma(f.id)}>
              <Icone nome={f.icone} tamanho={20} />
              {f.rotulo}
            </button>
          ))}
        </div>
      </div>
    </Folha>
  );
}
