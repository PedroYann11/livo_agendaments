"use client";

// Financeiro: quanto entrou, quanto saiu, quanto sobrou — e a meta do mês.
// Entrada de atendimento é automática (vem do "Concluir e receber"); o que
// o dono lança à mão são despesas e vendas avulsas.

import { useMemo, useState } from "react";
import { useBanco, useLoja } from "@/lib/dados/loja";
import { Cabecalho } from "../Cabecalho";
import { Acumulado, Pilha } from "../graficos";
import { Icone } from "@/components/ui/Icone";
import { Botao, BotaoIcone, Campo, Entrada, EstadoVazio, Interruptor, Medidor, NumeroAnimado, Segmentado, Selo } from "@/components/ui/basicos";
import { Folha } from "@/components/ui/Folha";
import { useAvisos, useConfirmar } from "@/components/ui/Avisos";
import type { Lancamento } from "@/lib/tipos";
import { removerLancamento, salvarLancamento } from "@/lib/dados/acoes";
import { porFormaPagamento, porProfissional, realizado, resumo } from "@/lib/metricas";
import { brl, brlCurto, pct } from "@/lib/formato";
import { dataBr, dataCurta, fimDoMes, inicioDoMes, mesAno, somarDias, somarMeses } from "@/lib/datas";
import { centavosParaReais, formatarValorCampo } from "@/lib/masks";
import { novoId } from "@/lib/id";
import { PALETA, corDaPessoa } from "@/lib/paleta";
import { capitalizar } from "@/components/vitrine/util";

const NOME_FORMA: Record<string, string> = { pix: "Pix", credito: "Crédito", debito: "Débito", dinheiro: "Dinheiro", pacote: "Sessões de pacote" };

export function Financeiro() {
  const b = useBanco();
  const { agora, mudar } = useLoja();
  const avisar = useAvisos();
  const confirmar = useConfirmar();
  const hoje = agora().slice(0, 10);
  const [mes, setMes] = useState(inicioDoMes(hoje));
  const [aba, setAba] = useState<"lancamentos" | "comissoes" | "formas">("lancamentos");
  const [filtro, setFiltro] = useState<"tudo" | "entradas" | "saidas" | "apagar">("tudo");
  const [editar, setEditar] = useState<Lancamento | null>(null);
  const de = mes;
  const ate = fimDoMes(mes);
  const r = useMemo(() => resumo(b, de, ate), [b, de, ate]);
  const meta = b.negocio.metaMensal;
  const mesAtual = mes === inicioDoMes(hoje);

  const acumulado = useMemo(() => {
    const pontos: { rotulo: string; valor: number | null }[] = [];
    let soma = 0;
    for (let d = de; d <= ate; d = somarDias(d, 1)) {
      soma += b.agendamentos.filter((a) => a.status === "concluido" && a.inicio.slice(0, 10) === d).reduce((s, a) => s + realizado(a), 0);
      soma += b.lancamentos.filter((l) => l.tipo === "receita" && l.data === d).reduce((s, l) => s + l.valor, 0);
      pontos.push({ rotulo: String(Number(d.slice(8))), valor: d <= hoje ? soma : null });
    }
    return pontos;
  }, [b, de, ate, hoje]);

  // atendimentos agrupados por dia + lançamentos manuais
  type Linha = { id: string; data: string; descricao: string; categoria: string; valor: number; tipo: "receita" | "despesa"; pago: boolean; manual?: Lancamento };
  const linhas: Linha[] = [];
  const porDia = new Map<string, { n: number; v: number }>();
  for (const a of b.agendamentos) {
    if (a.status !== "concluido" || a.inicio.slice(0, 10) < de || a.inicio.slice(0, 10) > ate) continue;
    const d = a.inicio.slice(0, 10);
    const x = porDia.get(d) ?? { n: 0, v: 0 };
    x.n++;
    x.v += realizado(a);
    porDia.set(d, x);
  }
  for (const [d, x] of porDia) linhas.push({ id: "at" + d, data: d, descricao: `${x.n} atendimentos`, categoria: "Atendimentos", valor: x.v, tipo: "receita", pago: true });
  for (const l of b.lancamentos.filter((l) => l.data >= de && l.data <= ate)) linhas.push({ id: l.id, data: l.data, descricao: l.descricao, categoria: l.categoria, valor: l.valor, tipo: l.tipo, pago: l.pago, manual: l });
  linhas.sort((a, c) => (a.data === c.data ? (a.tipo === "receita" ? -1 : 1) : a.data > c.data ? -1 : 1));
  const visiveis = linhas.filter((l) => filtro === "tudo" || (filtro === "entradas" && l.tipo === "receita") || (filtro === "saidas" && l.tipo === "despesa") || (filtro === "apagar" && !l.pago));
  const aPagar = linhas.filter((l) => !l.pago).reduce((s, l) => s + l.valor, 0);

  const comissoes = porProfissional(b, de, ate).filter((p) => p.profissional.comissaoPct > 0);
  const formas = porFormaPagamento(b, de, ate);
  const categorias = [...new Set(b.lancamentos.map((l) => l.categoria))];

  return (
    <div className="pn-pagina">
      <Cabecalho
        titulo="Financeiro"
        texto={capitalizar(mesAno(mes))}
        acoes={
          <>
            <BotaoIcone icone="esquerda" rotulo="Mês anterior" onClick={() => setMes(inicioDoMes(somarMeses(mes, -1)))} />
            <BotaoIcone icone="direita" rotulo="Próximo mês" onClick={() => setMes(inicioDoMes(somarMeses(mes, 1)))} disabled={mesAtual} />
            <Botao
              variante="principal"
              icone="mais"
              onClick={() => setEditar({ id: novoId("lc"), tipo: "despesa", categoria: "", descricao: "", valor: 0, data: mesAtual ? hoje : mes, pago: true, recorrente: false })}
            >
              Lançar
            </Botao>
          </>
        }
      />

      <div className="pn-kpis">
        <div className="pn-cartao pn-kpi">
          <span className="pn-kpi-rotulo">
            <Icone nome="alta" tamanho={16} /> Entradas
          </span>
          <span className="pn-kpi-valor">
            <NumeroAnimado valor={r.faturamento} formatar={brlCurto} />
          </span>
          <span className="pn-kpi-rodape">{r.atendimentos} atendimentos · ticket {brl(r.ticketMedio)}</span>
        </div>
        <div className="pn-cartao pn-kpi">
          <span className="pn-kpi-rotulo">
            <Icone nome="baixa" tamanho={16} /> Saídas
          </span>
          <span className="pn-kpi-valor">
            <NumeroAnimado valor={r.despesas} formatar={brlCurto} />
          </span>
          <span className="pn-kpi-rodape">{aPagar > 0 ? `${brl(aPagar)} ainda a pagar` : "tudo pago"}</span>
        </div>
        <div className="pn-cartao pn-kpi">
          <span className="pn-kpi-rotulo">
            <Icone nome="moedas" tamanho={16} /> Lucro
          </span>
          <span className="pn-kpi-valor" style={{ color: r.lucro < 0 ? "var(--critico)" : undefined }}>
            <NumeroAnimado valor={r.lucro} formatar={brlCurto} />
          </span>
          <span className="pn-kpi-rodape">margem {pct(r.faturamento ? r.lucro / r.faturamento : 0)}</span>
        </div>
        <div className="pn-cartao pn-kpi">
          <span className="pn-kpi-rotulo">
            <Icone nome="raio" tamanho={16} /> Meta do mês
          </span>
          <span className="pn-kpi-valor">{meta ? pct(r.faturamento / meta) : "—"}</span>
          {meta > 0 ? <Medidor valor={r.faturamento / meta} tom={r.faturamento >= meta ? "bom" : "marca"} rotulo="Meta" /> : <span className="pn-kpi-rodape">Defina em Configurações › Negócio</span>}
          {meta > 0 && mesAtual && <span className="pn-kpi-rodape">+ {brlCurto(r.previsto)} já agendados</span>}
        </div>
      </div>

      <div className="pn-cartao" style={{ marginTop: 14 }}>
        <div className="pn-cartao-cabeca">
          <h2>Entradas acumuladas no mês</h2>
        </div>
        <div className="pn-cartao-corpo">
          <Acumulado pontos={acumulado} meta={meta} formatar={brlCurto} cor={PALETA[0]} />
        </div>
      </div>

      <div style={{ margin: "18px 0 12px" }}>
        <Segmentado
          rotulo="Seção"
          valor={aba}
          onMudar={setAba}
          opcoes={[
            { id: "lancamentos", rotulo: "Lançamentos" },
            ...(b.negocio.modulos.comissoes ? [{ id: "comissoes" as const, rotulo: "Comissões" }] : []),
            { id: "formas", rotulo: "Formas de pagamento" },
          ]}
        />
      </div>

      {aba === "lancamentos" && (
        <>
          <div className="pn-fichas" style={{ marginBottom: 12 }}>
            {(
              [
                ["tudo", "Tudo"],
                ["entradas", "Entradas"],
                ["saidas", "Saídas"],
                ["apagar", "A pagar"],
              ] as const
            ).map(([id, rot]) => (
              <button key={id} type="button" className="pn-ficha" aria-pressed={filtro === id} onClick={() => setFiltro(id)}>
                {rot}
              </button>
            ))}
          </div>
          <div className="pn-cartao">
            {visiveis.length === 0 ? (
              <EstadoVazio icone="recibo" titulo="Nada por aqui" />
            ) : (
              <div className="pn-lista">
                {visiveis.map((l) => (
                  <button key={l.id} type="button" className="pn-linha" onClick={() => l.manual && setEditar(l.manual)} disabled={!l.manual} style={{ cursor: l.manual ? "pointer" : "default" }}>
                    <span className="ini-atencao-icone" style={{ width: 34, height: 34, background: l.tipo === "receita" ? "var(--bom-sutil)" : "var(--c-sutil)", color: l.tipo === "receita" ? "var(--bom)" : "var(--c-texto-2)" }}>
                      <Icone nome={l.tipo === "receita" ? (l.categoria === "Atendimentos" ? "agendaOk" : "alta") : "baixa"} tamanho={17} />
                    </span>
                    <span className="pn-linha-info">
                      <strong>{l.descricao}</strong>
                      <small>
                        {dataCurta(l.data)} · {l.categoria}
                        {l.manual?.recorrente ? " · todo mês" : ""}
                      </small>
                    </span>
                    {!l.pago && <Selo tom="atencao">A pagar</Selo>}
                    <span className="pn-linha-lado">
                      <b style={{ color: l.tipo === "receita" ? "var(--bom)" : undefined }}>
                        {l.tipo === "receita" ? "+" : "−"} {brl(l.valor)}
                      </b>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {aba === "comissoes" && (
        <div className="pn-cartao">
          {comissoes.length === 0 ? (
            <EstadoVazio icone="comissao" titulo="Ninguém com comissão" texto="Defina o percentual de cada profissional em Equipe." />
          ) : (
            <div className="pn-rolagem-x">
              <table className="pn-tabela">
                <thead>
                  <tr>
                    <th>Profissional</th>
                    <th className="num">Atendimentos</th>
                    <th className="num">Base</th>
                    <th className="num">%</th>
                    <th className="num">A pagar</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {comissoes.map((c) => {
                    const descricao = `Comissão ${c.profissional.nome} · ${mesAno(mes)}`;
                    const paga = b.lancamentos.some((l) => l.descricao === descricao);
                    return (
                      <tr key={c.profissional.id}>
                        <td>
                          <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            <span className="ag-ponto-pro" style={{ background: corDaPessoa(c.profissional.cor) }} />
                            {c.profissional.nome}
                          </span>
                        </td>
                        <td className="num">{c.atendimentos}</td>
                        <td className="num">{brl(c.faturamento)}</td>
                        <td className="num">{c.profissional.comissaoPct}%</td>
                        <td className="num" style={{ fontWeight: 650 }}>
                          {brl(c.comissao)}
                        </td>
                        <td style={{ textAlign: "right" }}>
                          {paga ? (
                            <Selo tom="bom" icone="ok">
                              Paga
                            </Selo>
                          ) : (
                            <Botao
                              variante="suave"
                              tamanho="p"
                              onClick={async () => {
                                const ok = await confirmar({ titulo: `Pagar ${brl(c.comissao)} a ${c.profissional.nome}?`, texto: "Entra como saída no financeiro.", confirmar: "Registrar pagamento" });
                                if (!ok) return;
                                mudar((x) => salvarLancamento(x, { id: novoId("lc"), tipo: "despesa", categoria: "Comissões", descricao, valor: Math.round(c.comissao * 100) / 100, data: hoje, pago: true, recorrente: false }));
                                avisar("Comissão registrada.");
                              }}
                            >
                              Marcar como paga
                            </Botao>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {aba === "formas" && (
        <div className="pn-cartao pn-cartao-corpo">
          {Object.keys(formas).length ? (
            <Pilha
              formatar={brl}
              partes={(["pix", "credito", "debito", "dinheiro"] as const)
                .map((f, i) => ({ nome: NOME_FORMA[f], valor: formas[f] ?? 0, cor: PALETA[i] }))
                .filter((x) => x.valor > 0)}
            />
          ) : (
            <EstadoVazio icone="cartao" titulo="Nenhum recebimento no período" />
          )}
          <p className="pn-cartao-sub" style={{ marginTop: 12 }}>
            Sessões de pacote não entram aqui: o dinheiro entrou no dia da venda do pacote.
          </p>
        </div>
      )}

      <Folha
        aberta={!!editar}
        onFechar={() => setEditar(null)}
        titulo={editar && b.lancamentos.some((l) => l.id === editar.id) ? "Editar lançamento" : "Novo lançamento"}
        rodape={
          <>
            {editar && b.lancamentos.some((l) => l.id === editar.id) && (
              <Botao
                variante="fantasma"
                icone="apagar"
                onClick={() => {
                  mudar((x) => removerLancamento(x, editar.id));
                  setEditar(null);
                }}
              >
                Apagar
              </Botao>
            )}
            <Botao
              variante="principal"
              onClick={() => {
                if (!editar?.descricao.trim() || editar.valor <= 0) return avisar("Preencha descrição e valor.", "erro");
                mudar((x) => salvarLancamento(x, { ...editar, categoria: editar.categoria.trim() || "Outros" }));
                avisar("Lançado.");
                setEditar(null);
              }}
            >
              Salvar
            </Botao>
          </>
        }
      >
        {editar && (
          <div style={{ display: "grid", gap: 16 }}>
            <Segmentado
              rotulo="Tipo"
              valor={editar.tipo}
              onMudar={(t) => setEditar({ ...editar, tipo: t })}
              opcoes={[
                { id: "despesa", rotulo: "Saída", icone: "baixa" },
                { id: "receita", rotulo: "Entrada", icone: "alta" },
              ]}
            />
            <Campo rotulo="Descrição">
              <Entrada value={editar.descricao} onChange={(e) => setEditar({ ...editar, descricao: e.target.value })} placeholder={editar.tipo === "despesa" ? "Ex.: Conta de energia" : "Ex.: Venda de hidratante"} />
            </Campo>
            <div className="ui-grade-campos duas">
              <Campo rotulo="Valor">
                <Entrada inputMode="numeric" value={formatarValorCampo(editar.valor)} onChange={(e) => setEditar({ ...editar, valor: centavosParaReais(e.target.value) })} icone="dinheiro" />
              </Campo>
              <Campo rotulo="Data">
                <Entrada type="date" value={editar.data} onChange={(e) => setEditar({ ...editar, data: e.target.value })} />
              </Campo>
            </div>
            <Campo rotulo="Categoria">
              <Entrada list="categorias-lanc" value={editar.categoria} onChange={(e) => setEditar({ ...editar, categoria: e.target.value })} placeholder="Ex.: Aluguel" />
              <datalist id="categorias-lanc">
                {categorias.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </Campo>
            <Interruptor ligado={editar.pago} onMudar={(v) => setEditar({ ...editar, pago: v })} rotulo={editar.tipo === "despesa" ? "Já paguei" : "Já recebi"} mostrarRotulo />
            <Interruptor ligado={editar.recorrente} onMudar={(v) => setEditar({ ...editar, recorrente: v })} rotulo="Repete todo mês" mostrarRotulo />
            <small style={{ color: "var(--c-texto-3)" }}>Lançado em {dataBr(editar.data)}.</small>
          </div>
        )}
      </Folha>
    </div>
  );
}
