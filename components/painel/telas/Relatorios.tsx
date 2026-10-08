"use client";

// =====================================================================
// Relatórios. Cada bloco responde UMA pergunta do dono, escrita no título:
//   quanto entrou? · a agenda está cheia? · quem falta? · o que dá mais
//   dinheiro POR HORA? · quando estou vazio? · de onde vêm os clientes?
// =====================================================================

import { useMemo, useState } from "react";
import { useBanco, useLoja } from "@/lib/dados/loja";
import { Cabecalho } from "../Cabecalho";
import { BarrasH, Colunas, MapaCalor, Pilha } from "../graficos";
import { Icone } from "@/components/ui/Icone";
import { Avatar, Medidor, NumeroAnimado, Segmentado } from "@/components/ui/basicos";
import { mapaCalor, porProfissional, porServico, resumo, serieDiaria } from "@/lib/metricas";
import { brl, brlCurto, numero, pct } from "@/lib/formato";
import { dataCurta, difDias, inicioDoMes, somarDias } from "@/lib/datas";
import { PALETA, corDaPessoa } from "@/lib/paleta";

type Periodo = "7" | "30" | "90" | "mes";

export function Relatorios() {
  const b = useBanco();
  const { agora } = useLoja();
  const hoje = agora().slice(0, 10);
  const [periodo, setPeriodo] = useState<Periodo>("30");

  const [de, ate] = periodo === "mes" ? [inicioDoMes(hoje), hoje] : [somarDias(hoje, -(Number(periodo) - 1)), hoje];
  const dias = difDias(de, ate) + 1;
  const anterior: [string, string] = [somarDias(de, -dias), somarDias(de, -1)];

  const r = useMemo(() => resumo(b, de, ate), [b, de, ate]);
  const ra = useMemo(() => resumo(b, ...anterior), [b, anterior[0], anterior[1]]); // eslint-disable-line react-hooks/exhaustive-deps
  const serie = useMemo(() => serieDiaria(b, de, somarDias(ate, periodo === "7" ? 7 : 0), hoje), [b, de, ate, hoje, periodo]);
  const servicos = useMemo(() => porServico(b, de, ate), [b, de, ate]);
  const pros = useMemo(() => porProfissional(b, de, ate), [b, de, ate]);
  const calor = useMemo(() => mapaCalor(b, de, ate), [b, de, ate]);
  const canais = useMemo(() => {
    const c = { online: 0, painel: 0, whatsapp: 0 };
    for (const a of b.agendamentos) if (a.inicio.slice(0, 10) >= de && a.inicio.slice(0, 10) <= ate && a.status !== "cancelado") c[a.canal]++;
    return c;
  }, [b, de, ate]);

  const porSemana = dias > 45;
  const colunas = porSemana ? agruparSemanas(serie) : serie.map((p) => ({ ...p, rotulo: p.data.slice(8), dica: dataCurta(p.data) }));

  return (
    <div className="pn-pagina">
      <Cabecalho
        titulo="Relatórios"
        texto={`${dataCurta(de)} a ${dataCurta(ate)} · comparado aos ${dias} dias anteriores`}
        acoes={
          <Segmentado
            rotulo="Período"
            tamanho="p"
            valor={periodo}
            onMudar={setPeriodo}
            opcoes={[
              { id: "7", rotulo: "7 dias" },
              { id: "30", rotulo: "30 dias" },
              { id: "90", rotulo: "90 dias" },
              { id: "mes", rotulo: "Este mês" },
            ]}
          />
        }
      />

      <div className="pn-kpis k6">
        <Kpi rotulo="Faturamento" valor={r.faturamento} anterior={ra.faturamento} formatar={brlCurto} />
        <Kpi rotulo="Atendimentos" valor={r.atendimentos} anterior={ra.atendimentos} formatar={(v) => numero(Math.round(v))} />
        <Kpi rotulo="Ticket médio" valor={r.ticketMedio} anterior={ra.ticketMedio} formatar={brlCurto} />
        <Kpi rotulo="Ocupação" valor={r.ocupacao * 100} anterior={ra.ocupacao * 100} formatar={(v) => `${Math.round(v)}%`} />
        <Kpi rotulo="Taxa de faltas" valor={r.taxaFaltas * 100} anterior={ra.taxaFaltas * 100} formatar={(v) => `${v.toFixed(1).replace(".", ",")}%`} inverso />
        <Kpi rotulo="Clientes novos" valor={r.clientesNovos} anterior={ra.clientesNovos} formatar={(v) => numero(Math.round(v))} />
      </div>

      <div className="pn-cartao" style={{ marginTop: 14 }}>
        <div className="pn-cartao-cabeca">
          <h2>Quanto entrou {porSemana ? "por semana" : "por dia"}</h2>
          <div className="gf-legenda">
            <span>
              <i style={{ background: PALETA[0] }} /> Realizado
            </span>
            {colunas.some((c) => c.previsto > 0) && (
              <span>
                <i style={{ background: "#b7d3f6" }} /> Agendado
              </span>
            )}
          </div>
        </div>
        <div className="pn-cartao-corpo">
          <Colunas
            formatar={brlCurto}
            rotuloACada={colunas.length > 20 ? 5 : colunas.length > 10 ? 2 : 1}
            dados={colunas.map((p) => ({
              rotulo: p.rotulo,
              dica: p.dica,
              valores: [
                { valor: p.realizado, cor: PALETA[0], nome: "Realizado" },
                { valor: p.previsto, cor: "#b7d3f6", nome: "Agendado" },
              ],
            }))}
          />
        </div>
      </div>

      <div className="pn-grade g2" style={{ marginTop: 14 }}>
        <div className="pn-cartao">
          <div className="pn-cartao-cabeca">
            <h2>O que rende mais por hora</h2>
          </div>
          <p className="pn-cartao-sub" style={{ padding: "0 18px" }}>
            Faturamento dividido pelo tempo de cadeira. Um serviço caro e longo pode render menos que um rápido.
          </p>
          <div className="pn-cartao-corpo">
            <BarrasH
              formatar={(v) => `${brlCurto(v)}/h`}
              dados={servicos
                .slice()
                .sort((a, c) => c.porHora - a.porHora)
                .slice(0, 7)
                .map((s) => ({ rotulo: s.servico.nome, valor: s.porHora, cor: PALETA[0], detalhe: `${s.quantidade}× · ${brl(s.faturamento)} no período` }))}
            />
          </div>
        </div>

        <div className="pn-cartao">
          <div className="pn-cartao-cabeca">
            <h2>Quando a agenda enche (e quando esvazia)</h2>
          </div>
          <div className="pn-cartao-corpo">
            <MapaCalor dias={["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"]} horas={calor.horas} valores={calor.valores} />
          </div>
        </div>
      </div>

      <div className="pn-grade g-21" style={{ marginTop: 14 }}>
        <div className="pn-cartao">
          <div className="pn-cartao-cabeca">
            <h2>Equipe</h2>
          </div>
          <div className="pn-rolagem-x" style={{ marginTop: 8 }}>
            <table className="pn-tabela">
              <thead>
                <tr>
                  <th>Profissional</th>
                  <th className="num">Atend.</th>
                  <th className="num">Faturamento</th>
                  <th style={{ minWidth: 140 }}>Ocupação</th>
                  <th className="num">Faltas</th>
                  {b.negocio.modulos.comissoes && <th className="num">Comissão</th>}
                </tr>
              </thead>
              <tbody>
                {pros.map((p) => (
                  <tr key={p.profissional.id}>
                    <td>
                      <span style={{ display: "flex", gap: 10, alignItems: "center" }}>
                        <Avatar nome={p.profissional.nome} cor={p.profissional.cor} tamanho={28} />
                        {p.profissional.nome}
                      </span>
                    </td>
                    <td className="num">{p.atendimentos}</td>
                    <td className="num">{brl(p.faturamento)}</td>
                    <td>
                      <span style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "center" }}>
                        <span style={{ ["--c-marca" as string]: corDaPessoa(p.profissional.cor) }}>
                          <Medidor valor={p.ocupacao} rotulo="Ocupação" />
                        </span>
                        <small className="num">{Math.round(p.ocupacao * 100)}%</small>
                      </span>
                    </td>
                    <td className="num">{p.faltas}</td>
                    {b.negocio.modulos.comissoes && <td className="num">{brl(p.comissao)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div style={{ display: "grid", gap: 14, alignContent: "start" }}>
          <div className="pn-cartao">
            <div className="pn-cartao-cabeca">
              <h2>De onde vêm os agendamentos</h2>
            </div>
            <div className="pn-cartao-corpo">
              <Pilha
                formatar={(v) => numero(v)}
                partes={[
                  { nome: "Link de agendamento", valor: canais.online, cor: PALETA[0] },
                  { nome: "Marcados no painel", valor: canais.painel, cor: PALETA[1] },
                  { nome: "WhatsApp", valor: canais.whatsapp, cor: PALETA[2] },
                ]}
              />
            </div>
          </div>
          <div className="pn-cartao">
            <div className="pn-cartao-cabeca">
              <h2>Clientes atendidos</h2>
            </div>
            <div className="pn-cartao-corpo">
              <Pilha
                formatar={(v) => numero(v)}
                partes={[
                  { nome: "Voltaram", valor: r.clientesRecorrentes, cor: PALETA[0] },
                  { nome: "Primeira vez", valor: r.clientesNovos, cor: PALETA[1] },
                ]}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="pn-cartao" style={{ marginTop: 14 }}>
        <div className="pn-cartao-cabeca">
          <h2>Serviços no período</h2>
        </div>
        <div className="pn-rolagem-x" style={{ marginTop: 8 }}>
          <table className="pn-tabela">
            <thead>
              <tr>
                <th>Serviço</th>
                <th className="num">Vezes</th>
                <th className="num">Faturamento</th>
                <th className="num">Por hora</th>
                <th className="num">% do total</th>
              </tr>
            </thead>
            <tbody>
              {servicos.map((s) => (
                <tr key={s.servico.id}>
                  <td>{s.servico.nome}</td>
                  <td className="num">{s.quantidade}</td>
                  <td className="num">{brl(s.faturamento)}</td>
                  <td className="num">{brl(s.porHora)}</td>
                  <td className="num">{pct(s.faturamento / Math.max(1, r.faturamento - r.vendasAvulsas))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Kpi({ rotulo, valor, anterior, formatar, inverso }: { rotulo: string; valor: number; anterior: number; formatar: (n: number) => string; inverso?: boolean }) {
  const delta = anterior ? (valor - anterior) / anterior : 0;
  const bom = inverso ? delta < 0 : delta > 0;
  return (
    <div className="pn-cartao pn-kpi">
      <span className="pn-kpi-rotulo">{rotulo}</span>
      <span className="pn-kpi-valor">
        <NumeroAnimado valor={valor} formatar={formatar} />
      </span>
      {anterior > 0 && Math.abs(delta) >= 0.005 && (
        <span className="pn-kpi-rodape">
          <span className={`pn-delta ${bom ? "bom" : "ruim"}`}>
            <Icone nome={delta > 0 ? "alta" : "baixa"} tamanho={14} />
            {delta > 0 ? "+" : ""}
            {pct(delta)}
          </span>
          vs. período anterior
        </span>
      )}
    </div>
  );
}

type PontoSerie = { data: string; realizado: number; previsto: number; atendimentos: number };

function agruparSemanas(serie: PontoSerie[]) {
  const grupos: { rotulo: string; dica: string; realizado: number; previsto: number }[] = [];
  for (let i = 0; i < serie.length; i += 7) {
    const fatia = serie.slice(i, i + 7);
    grupos.push({
      rotulo: dataCurta(fatia[0].data).split(", ")[1],
      dica: `Semana de ${dataCurta(fatia[0].data)}`,
      realizado: fatia.reduce((s, p) => s + p.realizado, 0),
      previsto: fatia.reduce((s, p) => s + p.previsto, 0),
    });
  }
  return grupos;
}

