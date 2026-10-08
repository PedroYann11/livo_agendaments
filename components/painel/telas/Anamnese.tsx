"use client";

// Anamnese: o dono monta as perguntas (sem programador) e acompanha quem
// já respondeu. Resposta marcada como "alerta" aparece em vermelho para
// quem vai atender — no detalhe do agendamento e aqui.

import Link from "next/link";
import { useMemo, useState } from "react";
import { Reorder } from "motion/react";
import { useBanco, useLoja } from "@/lib/dados/loja";
import { Cabecalho } from "../Cabecalho";
import { Icone } from "@/components/ui/Icone";
import { Avatar, Botao, BotaoIcone, Campo, Entrada, EstadoVazio, Interruptor, Segmentado, Selo, Texto } from "@/components/ui/basicos";
import { Folha } from "@/components/ui/Folha";
import { useAvisos } from "@/components/ui/Avisos";
import type { Banco, CampoFicha, Ficha, ModeloFicha, TipoCampoFicha } from "@/lib/tipos";
import { salvarModeloFicha } from "@/lib/dados/acoes";
import { dataBr, dataCurta, somarDias } from "@/lib/datas";
import { primeiroNome } from "@/lib/formato";
import { linkWhatsApp } from "@/lib/whatsapp";
import { novoId } from "@/lib/id";

const TIPOS: { id: TipoCampoFicha; rotulo: string }[] = [
  { id: "simNao", rotulo: "Sim ou não" },
  { id: "escolha", rotulo: "Uma opção" },
  { id: "multipla", rotulo: "Várias opções" },
  { id: "texto", rotulo: "Resposta curta" },
  { id: "textoLongo", rotulo: "Resposta longa" },
  { id: "data", rotulo: "Data" },
];

export function alertasDaFicha(b: Banco, f: Ficha): CampoFicha[] {
  const m = b.modelosFicha.find((x) => x.id === f.modeloId);
  return (
    m?.campos.filter((c) => {
      const r = f.respostas[c.id];
      return c.alerta && (Array.isArray(r) ? r.includes(c.alerta) : r === c.alerta);
    }) ?? []
  );
}

export function Anamnese() {
  const b = useBanco();
  const { agora } = useLoja();
  const [aba, setAba] = useState<"fichas" | "modelos">("fichas");
  const [soAlertas, setSoAlertas] = useState(false);
  const [editar, setEditar] = useState<ModeloFicha | null>(null);
  const momento = agora();
  const hoje = momento.slice(0, 10);

  const pendentes = useMemo(
    () =>
      b.agendamentos
        .filter((a) => a.inicio >= momento && a.inicio.slice(0, 10) <= somarDias(hoje, 7) && (a.status === "confirmado" || a.status === "pendente"))
        .filter((a) =>
          a.itens.some((i) => {
            const s = b.servicos.find((x) => x.id === i.servicoId);
            return s?.fichaId && !b.fichas.some((f) => f.clienteId === a.clienteId && f.modeloId === s.fichaId);
          }),
        )
        .sort((a, c) => (a.inicio < c.inicio ? -1 : 1)),
    [b, momento, hoje],
  );
  const fichas = b.fichas
    .slice()
    .sort((a, c) => (a.preenchidaEm > c.preenchidaEm ? -1 : 1))
    .filter((f) => !soAlertas || alertasDaFicha(b, f).length);

  return (
    <div className="pn-pagina">
      <Cabecalho
        titulo="Anamnese"
        texto="Fichas de saúde preenchidas pelo cliente antes de chegar."
        acoes={
          aba === "modelos" && (
            <Botao variante="principal" icone="mais" onClick={() => setEditar({ id: novoId("fm"), nome: "", descricao: "", ativo: true, campos: [] })}>
              Novo modelo
            </Botao>
          )
        }
      />
      <div style={{ marginBottom: 14 }}>
        <Segmentado
          rotulo="Seção"
          valor={aba}
          onMudar={setAba}
          opcoes={[
            { id: "fichas", rotulo: "Fichas", contagem: b.fichas.length },
            { id: "modelos", rotulo: "Modelos", contagem: b.modelosFicha.length },
          ]}
        />
      </div>

      {aba === "fichas" ? (
        <div className="pn-grade g-12">
          <div className="pn-cartao" style={{ alignSelf: "start" }}>
            <div className="pn-cartao-cabeca">
              <h2>
                <Icone nome="ampulheta" tamanho={18} /> Faltando
              </h2>
              <Selo tom={pendentes.length ? "atencao" : "bom"}>{pendentes.length}</Selo>
            </div>
            <p className="pn-cartao-sub" style={{ padding: "0 18px" }}>
              Clientes dos próximos 7 dias sem ficha.
            </p>
            <div className="pn-lista" style={{ marginTop: 8 }}>
              {pendentes.length === 0 && <p style={{ padding: "6px 18px 16px", fontSize: 14, color: "var(--c-texto-3)" }}>Ninguém pendente.</p>}
              {pendentes.map((a) => {
                const c = b.clientes.find((x) => x.id === a.clienteId)!;
                return (
                  <div key={a.id} className="pn-linha">
                    <span className="pn-linha-info">
                      <strong>{c.nome}</strong>
                      <small>
                        {dataCurta(a.inicio.slice(0, 10))}, {a.inicio.slice(11)}
                      </small>
                    </span>
                    <a
                      className="ui-botao ui-botao-suave ui-botao-p"
                      target="_blank"
                      rel="noopener noreferrer"
                      href={linkWhatsApp(c.telefone, `Oi, ${primeiroNome(c.nome)}! Antes do seu horário, preencha sua ficha (leva 2 minutos): ${typeof window !== "undefined" ? window.location.origin : ""}/${b.negocio.slug}/ficha/${a.token}`)}
                    >
                      <Icone nome="whatsapp" tamanho={16} /> Enviar
                    </a>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="pn-cartao">
            <div className="pn-cartao-cabeca">
              <h2>
                <Icone nome="ficha" tamanho={18} /> Recebidas
              </h2>
              <Interruptor ligado={soAlertas} onMudar={setSoAlertas} rotulo="Só com alerta" mostrarRotulo />
            </div>
            <div className="pn-lista" style={{ marginTop: 10 }}>
              {fichas.length === 0 && <EstadoVazio icone="ficha" titulo="Nenhuma ficha ainda" />}
              {fichas.slice(0, 60).map((f) => {
                const c = b.clientes.find((x) => x.id === f.clienteId);
                const m = b.modelosFicha.find((x) => x.id === f.modeloId);
                const al = alertasDaFicha(b, f);
                return (
                  <Link key={f.id} href={`/painel/clientes/${f.clienteId}`} className="pn-linha">
                    <Avatar nome={c?.nome ?? "?"} tamanho={34} />
                    <span className="pn-linha-info">
                      <strong>{c?.nome}</strong>
                      <small>
                        {m?.nome} · {dataBr(f.preenchidaEm.slice(0, 10))}
                        {al.length ? ` · ${al.map((x) => x.rotulo.replace(/\?$/, "")).join("; ")}` : ""}
                      </small>
                    </span>
                    {al.length ? (
                      <Selo tom="critico" icone="alerta">
                        Atenção
                      </Selo>
                    ) : (
                      <Selo tom="bom">OK</Selo>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <div className="pn-grade g2">
          {b.modelosFicha.length === 0 && (
            <div className="pn-cartao">
              <EstadoVazio icone="ficha" titulo="Crie seu primeiro modelo" texto="Depois, ligue o modelo aos serviços que precisam dele (em Serviços)." />
            </div>
          )}
          {b.modelosFicha.map((m) => {
            const servicos = b.servicos.filter((s) => s.ativo && s.fichaId === m.id);
            return (
              <button key={m.id} type="button" className="pn-cartao" style={{ padding: 18, textAlign: "left", display: "grid", gap: 10 }} onClick={() => setEditar(m)}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <strong style={{ fontSize: 16 }}>{m.nome}</strong>
                  {!m.ativo && <Selo>Desativado</Selo>}
                </div>
                <small style={{ color: "var(--c-texto-2)" }}>{m.descricao}</small>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <Selo icone="lista">{m.campos.length} perguntas</Selo>
                  <Selo icone="alerta">{m.campos.filter((c) => c.alerta).length} com alerta</Selo>
                  <Selo icone="servicos">{servicos.length} serviços usam</Selo>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <EditorModelo modelo={editar} onFechar={() => setEditar(null)} />
    </div>
  );
}

function EditorModelo({ modelo, onFechar }: { modelo: ModeloFicha | null; onFechar: () => void }) {
  const { mudar } = useLoja();
  const avisar = useAvisos();
  const [m, setM] = useState<ModeloFicha | null>(modelo);
  const [ultimo, setUltimo] = useState<ModeloFicha | null>(null);
  if (modelo !== ultimo) {
    setUltimo(modelo);
    setM(modelo);
  }
  const mudarCampo = (id: string, parcial: Partial<CampoFicha>) => m && setM({ ...m, campos: m.campos.map((c) => (c.id === id ? { ...c, ...parcial } : c)) });

  return (
    <Folha
      aberta={!!modelo}
      onFechar={onFechar}
      titulo={m?.nome || "Novo modelo"}
      largura={580}
      rodape={
        <Botao
          variante="principal"
          onClick={() => {
            if (!m?.nome.trim()) return avisar("Dê um nome ao modelo.", "erro");
            if (m.campos.some((c) => !c.rotulo.trim())) return avisar("Toda pergunta precisa de texto.", "erro");
            mudar((x) => salvarModeloFicha(x, m));
            avisar("Modelo salvo.");
            onFechar();
          }}
        >
          Salvar modelo
        </Botao>
      }
    >
      {m && (
        <div style={{ display: "grid", gap: 16 }}>
          <Campo rotulo="Nome do modelo">
            <Entrada value={m.nome} onChange={(e) => setM({ ...m, nome: e.target.value })} placeholder="Ex.: Anamnese · depilação a laser" />
          </Campo>
          <Campo rotulo="Texto de abertura" opcional>
            <Texto rows={2} value={m.descricao} onChange={(e) => setM({ ...m, descricao: e.target.value })} />
          </Campo>
          <Interruptor ligado={m.ativo} onMudar={(v) => setM({ ...m, ativo: v })} rotulo="Em uso" mostrarRotulo />

          <div className="pn-secao-form">
            <h3>Perguntas</h3>
            <p>Arraste para reordenar. “Alerta” destaca a resposta para quem vai atender.</p>
            <Reorder.Group as="div" axis="y" values={m.campos.map((c) => c.id)} onReorder={(ids: string[]) => setM({ ...m, campos: ids.map((id) => m.campos.find((c) => c.id === id)!) })} style={{ display: "grid", gap: 10 }}>
              {m.campos.map((c, i) => {
                const opcoes = c.tipo === "simNao" ? ["Sim", "Não"] : c.opcoes;
                return (
                  <Reorder.Item as="div" key={c.id} value={c.id} style={{ padding: 12, borderRadius: 12, border: "1px solid var(--c-linha)", background: "var(--c-superficie)", display: "grid", gap: 10 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <span style={{ cursor: "grab", color: "var(--c-texto-3)" }}>
                        <Icone nome="menuVertical" tamanho={18} />
                      </span>
                      <span style={{ fontSize: 12, fontWeight: 650, color: "var(--c-texto-3)" }}>{i + 1}</span>
                      <Entrada value={c.rotulo} onChange={(e) => mudarCampo(c.id, { rotulo: e.target.value })} placeholder="Pergunta" />
                      <BotaoIcone icone="apagar" rotulo="Remover pergunta" onClick={() => setM({ ...m, campos: m.campos.filter((x) => x.id !== c.id) })} />
                    </div>
                    <div className="ui-grade-campos duas">
                      <select className="ui-entrada" value={c.tipo} onChange={(e) => mudarCampo(c.id, { tipo: e.target.value as TipoCampoFicha, alerta: null })}>
                        {TIPOS.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.rotulo}
                          </option>
                        ))}
                      </select>
                      {opcoes.length > 0 && (
                        <select className="ui-entrada" value={c.alerta ?? ""} onChange={(e) => mudarCampo(c.id, { alerta: e.target.value || null })}>
                          <option value="">Sem alerta</option>
                          {opcoes.map((o) => (
                            <option key={o} value={o}>
                              Alerta se “{o}”
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                    {(c.tipo === "escolha" || c.tipo === "multipla") && (
                      <Entrada value={c.opcoes.join(", ")} onChange={(e) => mudarCampo(c.id, { opcoes: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} placeholder="Opções separadas por vírgula" />
                    )}
                    <Interruptor ligado={c.obrigatorio} onMudar={(v) => mudarCampo(c.id, { obrigatorio: v })} rotulo="Obrigatória" mostrarRotulo />
                  </Reorder.Item>
                );
              })}
            </Reorder.Group>
            <Botao
              variante="suave"
              icone="mais"
              onClick={() => setM({ ...m, campos: [...m.campos, { id: novoId("cp"), rotulo: "", tipo: "simNao", opcoes: [], obrigatorio: true, ajuda: "", alerta: null }] })}
            >
              Adicionar pergunta
            </Botao>
          </div>
        </div>
      )}
    </Folha>
  );
}
