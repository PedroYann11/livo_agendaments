"use client";

// O começo do dia do dono: quem vem agora, o que precisa de atenção e
// como o mês está indo — sem precisar abrir relatório nenhum.

import Link from "next/link";
import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { useBanco, useLoja } from "@/lib/dados/loja";
import { usePainel } from "../PainelRaiz";
import { Cabecalho } from "../Cabecalho";
import { PrimeirosPassos } from "../PrimeirosPassos";
import { Icone, type NomeIcone } from "@/components/ui/Icone";
import { Avatar, Botao, EstadoVazio, Medidor, NumeroAnimado, Selo } from "@/components/ui/basicos";
import { STATUS, enviarWhats } from "../DetalheAgendamento";
import { Faisca } from "../graficos";
import { aniversariantes, clientesParaRetorno, resumo, serieDiaria } from "@/lib/metricas";
import { brl, brlCurto, duracao, pct, primeiroNome } from "@/lib/formato";
import { dataLonga, difMin, horaDe, inicioDaSemana, inicioDoMes, fimDoMes, somarDias, somarMin } from "@/lib/datas";
import { corDaPessoa } from "@/lib/paleta";
import { capitalizar } from "@/components/vitrine/util";

export function Inicio() {
  const b = useBanco();
  const { agora, mudar } = useLoja();
  const { abrir, novo, meuProfissionalId, sessao, pode } = usePainel();
  const momento = agora();
  const hoje = momento.slice(0, 10);
  const n = b.negocio;
  const [todos, setTodos] = useState(false);

  const doDia = useMemo(
    () =>
      b.agendamentos
        .filter((a) => a.inicio.slice(0, 10) === hoje && a.status !== "cancelado" && (!meuProfissionalId || a.profissionalId === meuProfissionalId))
        .sort((a, c) => (a.inicio < c.inicio ? -1 : 1)),
    [b.agendamentos, hoje, meuProfissionalId],
  );
  const proximo = doDia.find((a) => a.fim > momento && (a.status === "confirmado" || a.status === "pendente"));
  const emAndamento = proximo && proximo.inicio <= momento;
  const faltam = proximo ? difMin(momento, proximo.inicio) : 0;

  const mes = useMemo(() => resumo(b, inicioDoMes(hoje), fimDoMes(hoje)), [b, hoje]);
  const semana = useMemo(() => resumo(b, inicioDaSemana(hoje), somarDias(inicioDaSemana(hoje), 6)), [b, hoje]);
  const trinta = useMemo(() => resumo(b, somarDias(hoje, -30), hoje), [b, hoje]);
  const serie = useMemo(() => serieDiaria(b, somarDias(hoje, -13), hoje, hoje).map((p) => p.realizado), [b, hoje]);
  const realizadoMes = resumo(b, inicioDoMes(hoje), hoje).faturamento;
  const hojeTotal = doDia.reduce((s, a) => s + (a.status === "concluido" ? a.pagamento?.valor ?? a.total : a.total), 0);

  const amanha = somarDias(hoje, 1);
  const aConfirmar = b.agendamentos.filter((a) => a.status === "pendente" && a.inicio >= momento && a.inicio <= somarMin(momento, 48 * 60));
  const lembretes = b.agendamentos.filter((a) => a.inicio.slice(0, 10) === amanha && (a.status === "confirmado" || a.status === "pendente") && !a.lembreteEm);
  const sinais = b.agendamentos.filter((a) => a.sinal && !a.sinal.pago && a.inicio >= momento && a.status !== "cancelado");
  const avaliacoes = b.depoimentos.filter((d) => !d.visivel);
  const fichasAmanha = n.modulos.anamnese
    ? b.agendamentos.filter((a) => {
        if (a.inicio.slice(0, 10) > amanha || a.inicio < momento || a.status === "cancelado") return false;
        return a.itens.some((i) => {
          const s = b.servicos.find((x) => x.id === i.servicoId);
          return s?.fichaId && !b.fichas.some((f) => f.clienteId === a.clienteId && f.modeloId === s.fichaId);
        });
      })
    : [];
  const aniver = n.modulos.aniversarios ? aniversariantes(b, hoje, somarDias(hoje, 6)) : [];
  const retorno = n.modulos.retorno ? clientesParaRetorno(b, hoje) : [];

  const nome = primeiroNome(sessao.nome);
  const hora = Number(momento.slice(11, 13));
  const saudacao = hora < 12 ? "Bom dia" : hora < 18 ? "Boa tarde" : "Boa noite";

  const atencao: { icone: NomeIcone; titulo: string; texto: string; qtd: number; href: string; cor: string }[] = [];
  if (aConfirmar.length) atencao.push({ icone: "ampulheta", titulo: "A confirmar", texto: "Nas próximas 48 horas", qtd: aConfirmar.length, href: "/painel/agenda?filtro=pendente", cor: "var(--atencao)" });
  if (lembretes.length && pode("mensagens")) atencao.push({ icone: "sino", titulo: "Lembretes de amanhã", texto: "Ainda não enviados", qtd: lembretes.length, href: "/painel/mensagens", cor: "var(--info)" });
  if (sinais.length) atencao.push({ icone: "pix", titulo: "Sinais em aberto", texto: brl(sinais.reduce((s, a) => s + a.sinal!.valor, 0)), qtd: sinais.length, href: "/painel/agenda", cor: "var(--atencao)" });
  if (fichasAmanha.length) atencao.push({ icone: "ficha", titulo: "Fichas pendentes", texto: "Clientes de hoje e amanhã", qtd: fichasAmanha.length, href: "/painel/anamnese", cor: "var(--critico)" });
  if (avaliacoes.length && pode("configuracoes")) atencao.push({ icone: "estrela", titulo: "Avaliações novas", texto: "Aprove para aparecer na página", qtd: avaliacoes.length, href: "/painel/configuracoes?s=avaliacoes", cor: "#b8860b" });

  const meta = n.metaMensal;
  const progresso = meta ? realizadoMes / meta : 0;

  return (
    <div className="pn-pagina">
      <Cabecalho
        titulo={
          <span className="ini-saudacao">
            {saudacao}
            {nome ? `, ${nome}` : ""}
          </span>
        }
        texto={capitalizar(dataLonga(hoje))}
        acoes={
          <Botao variante="principal" icone="agendaMais" onClick={() => novo({ data: hoje })}>
            Agendar
          </Botao>
        }
      />

      {pode("servicos") && <PrimeirosPassos b={b} />}

      <div className="pn-grade g-21">
        <div style={{ display: "grid", gap: 14, alignContent: "start" }}>
          {proximo ? (
            <motion.div className="ini-proximo" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}>
              <small>{emAndamento ? "Em atendimento agora" : faltam <= 60 ? `Próximo · em ${faltam} min` : "Próximo atendimento"}</small>
              <div className="ini-proximo-linha">
                <span className="ini-proximo-hora">{horaDe(proximo.inicio)}</span>
                <div style={{ minWidth: 0 }}>
                  <strong>{b.clientes.find((c) => c.id === proximo.clienteId)?.nome}</strong>
                  <span>
                    {proximo.itens.map((i) => i.nome).join(" + ")} · {primeiroNome(b.profissionais.find((p) => p.id === proximo.profissionalId)?.nome ?? "")}
                  </span>
                </div>
              </div>
              <div className="ini-proximo-acoes">
                <Botao tamanho="p" icone="ver" onClick={() => abrir(proximo.id)}>
                  Abrir
                </Botao>
                <Botao tamanho="p" icone="whatsapp" onClick={() => enviarWhats(b, "lembrete", proximo, mudar, momento)}>
                  WhatsApp
                </Botao>
              </div>
            </motion.div>
          ) : (
            <div className="ini-proximo">
              <small>Hoje</small>
              <div className="ini-proximo-linha">
                <div>
                  <strong>{doDia.length ? "Todos os atendimentos de hoje já passaram." : "Nenhum atendimento hoje."}</strong>
                  <span>Que tal divulgar seu link? {typeof window !== "undefined" ? `${window.location.host}/${n.slug}` : ""}</span>
                </div>
              </div>
            </div>
          )}

          <div className="pn-cartao">
            <div className="pn-cartao-cabeca">
              <h2>
                <Icone nome="agenda" tamanho={18} /> Hoje
                <Selo>{doDia.length}</Selo>
              </h2>
              <Link href="/painel/agenda">
                Abrir agenda <Icone nome="direita" tamanho={14} />
              </Link>
            </div>
            <p className="pn-cartao-sub" style={{ padding: "0 18px" }}>
              {brl(hojeTotal)} entre concluídos e previstos
            </p>
            <div className="pn-lista" style={{ marginTop: 8 }}>
              {doDia.length === 0 && <EstadoVazio icone="agenda" titulo="Dia livre" texto="Nenhum horário marcado para hoje." />}
              {(todos ? doDia : doDia.filter((a) => a.fim > somarMin(momento, -45) || a.status === "pendente")).map((a) => {
                const c = b.clientes.find((x) => x.id === a.clienteId);
                const p = b.profissionais.find((x) => x.id === a.profissionalId);
                const passou = a.fim <= momento;
                return (
                  <button key={a.id} type="button" className="pn-linha" onClick={() => abrir(a.id)} style={passou && a.status !== "concluido" ? undefined : passou ? { opacity: 0.6 } : undefined}>
                    <span className="pn-hora">{horaDe(a.inicio)}</span>
                    <span className="pn-barra-cor" style={{ background: corDaPessoa(p?.cor ?? 0) }} />
                    <span className="pn-linha-info">
                      <strong>{c?.nome}</strong>
                      <small>
                        {a.itens.map((i) => i.nome).join(" + ")} · {primeiroNome(p?.nome ?? "")}
                      </small>
                    </span>
                    <Selo tom={STATUS[a.status].tom}>{STATUS[a.status].rotulo}</Selo>
                  </button>
                );
              })}
            </div>
            {!todos && doDia.some((a) => !(a.fim > somarMin(momento, -45) || a.status === "pendente")) && (
              <div style={{ padding: "4px 18px 14px" }}>
                <button type="button" className="pn-link" onClick={() => setTodos(true)}>
                  Mostrar os que já passaram ({doDia.filter((a) => !(a.fim > somarMin(momento, -45) || a.status === "pendente")).length})
                </button>
              </div>
            )}
          </div>
        </div>

        <div style={{ display: "grid", gap: 14, alignContent: "start" }}>
          {atencao.length > 0 && (
            <div style={{ display: "grid", gap: 8 }}>
              <h2 style={{ fontSize: 13, fontWeight: 650, color: "var(--c-texto-2)", textTransform: "uppercase", letterSpacing: ".06em" }}>Precisa de atenção</h2>
              {atencao.map((x, i) => (
                <motion.div key={x.titulo} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 + i * 0.05, duration: 0.4, ease: [0.23, 1, 0.32, 1] }}>
                  <Link href={x.href} className="ini-atencao">
                    <span className="ini-atencao-icone" style={{ background: `color-mix(in srgb, ${x.cor} 13%, transparent)`, color: x.cor }}>
                      <Icone nome={x.icone} tamanho={20} />
                    </span>
                    <div>
                      <strong>{x.titulo}</strong>
                      <small>{x.texto}</small>
                    </div>
                    <b>{x.qtd}</b>
                  </Link>
                </motion.div>
              ))}
            </div>
          )}

          {pode("financeiro") || pode("relatorios") ? (
            <div className="pn-cartao pn-kpi">
              <span className="pn-kpi-rotulo">
                <Icone nome="financeiro" tamanho={16} /> Faturamento do mês
              </span>
              <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 10 }}>
                <span className="pn-kpi-valor">
                  <NumeroAnimado valor={realizadoMes} formatar={brlCurto} />
                </span>
                <Faisca valores={serie} cor="var(--c-marca)" />
              </div>
              {meta > 0 && (
                <>
                  <Medidor valor={progresso} tom={progresso >= 1 ? "bom" : "marca"} rotulo="Progresso da meta" />
                  <span className="pn-kpi-rodape">
                    {pct(progresso)} da meta de {brlCurto(meta)} · mais {brlCurto(mes.previsto)} agendados
                  </span>
                </>
              )}
            </div>
          ) : null}

          <div className="pn-kpis" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <div className="pn-cartao pn-kpi">
              <span className="pn-kpi-rotulo">Ocupação da semana</span>
              <span className="pn-kpi-valor">
                <NumeroAnimado valor={semana.ocupacao * 100} formatar={(v) => `${Math.round(v)}%`} />
              </span>
              <Medidor valor={semana.ocupacao} tom={semana.ocupacao > 0.85 ? "atencao" : "marca"} rotulo="Ocupação" />
            </div>
            <div className="pn-cartao pn-kpi">
              <span className="pn-kpi-rotulo">Faltas · 30 dias</span>
              <span className="pn-kpi-valor">{pct(trinta.taxaFaltas, 1)}</span>
              <span className="pn-kpi-rodape">
                {trinta.faltas} de {trinta.atendimentos + trinta.faltas}
              </span>
            </div>
          </div>

          {aniver.length > 0 && (
            <div className="pn-cartao">
              <div className="pn-cartao-cabeca">
                <h2>
                  <Icone nome="bolo" tamanho={18} /> Aniversariantes da semana
                </h2>
              </div>
              <div className="pn-lista" style={{ marginTop: 8 }}>
                {aniver.slice(0, 4).map((c) => (
                  <Link key={c.id} href={`/painel/clientes/${c.id}`} className="pn-linha">
                    <Avatar nome={c.nome} tamanho={32} />
                    <span className="pn-linha-info">
                      <strong>{c.nome}</strong>
                      <small>
                        {c.nascimento!.slice(8)}/{c.nascimento!.slice(5, 7)}
                      </small>
                    </span>
                    <Icone nome="presente" tamanho={18} />
                  </Link>
                ))}
              </div>
              {aniver.length > 4 && (
                <div style={{ padding: "0 18px 14px" }}>
                  <Link className="pn-link" href="/painel/mensagens">
                    Ver todos ({aniver.length})
                  </Link>
                </div>
              )}
            </div>
          )}

          {retorno.length > 0 && (
            <Link href="/painel/mensagens?aba=retorno" className="ini-atencao">
              <span className="ini-atencao-icone" style={{ background: "var(--c-marca-sutil)", color: "var(--c-marca-tinta)" }}>
                <Icone nome="retorno" tamanho={20} />
              </span>
              <div>
                <strong>Hora de voltar</strong>
                <small>Passaram do tempo de retorno e não marcaram</small>
              </div>
              <b>{retorno.length}</b>
            </Link>
          )}

          <div className="pn-cartao pn-kpi">
            <span className="pn-kpi-rotulo">
              <Icone nome="navegador" tamanho={16} /> Agendados pelo link · 30 dias
            </span>
            <span className="pn-kpi-valor">{pct(trinta.online / Math.max(1, trinta.totalAgendamentos))}</span>
            <span className="pn-kpi-rodape">
              {trinta.online} horários marcados sem você precisar responder mensagem · {duracao(trinta.online * 4)} economizados
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
