"use client";

// =====================================================================
// Serviços: o "cardápio" do negócio.
//
// Lição do livo (UX-arquitetura, 1.2): ordem é DENTRO da categoria, criar
// não exige foto, e editar abre ao lado — não empurra a lista. Pausar ≠
// apagar: pausado some do site e continua no painel.
// =====================================================================

import { useState } from "react";
import { Reorder } from "motion/react";
import { useBanco, useLoja } from "@/lib/dados/loja";
import { Cabecalho } from "../Cabecalho";
import { Icone } from "@/components/ui/Icone";
import { Botao, BotaoIcone, Busca, Campo, Entrada, EstadoVazio, Interruptor, Segmentado, Selo, Texto } from "@/components/ui/basicos";
import { Folha } from "@/components/ui/Folha";
import { useAvisos, useConfirmar } from "@/components/ui/Avisos";
import type { Banco, Categoria, Pacote, Servico } from "@/lib/tipos";
import { arquivarServico, removerCategoria, reordenar, salvarCategoria, salvarPacote, salvarServico, servicoNovo } from "@/lib/dados/acoes";
import { brl, duracao, normalizar } from "@/lib/formato";
import { centavosParaReais, formatarValorCampo } from "@/lib/masks";
import { novoId } from "@/lib/id";
import { corDaPessoa } from "@/lib/paleta";

export function Servicos() {
  const b = useBanco();
  const { mudar } = useLoja();
  const avisar = useAvisos();
  const [aba, setAba] = useState<"servicos" | "pacotes">("servicos");
  const [busca, setBusca] = useState("");
  const [editar, setEditar] = useState<Servico | null>(null);
  const [pacote, setPacote] = useState<Pacote | null>(null);
  const [categorias, setCategorias] = useState(false);

  const ativos = b.servicos.filter((s) => s.ativo);
  const cats = b.categorias.slice().sort((a, c) => a.ordem - c.ordem);
  const grupos: { cat: Categoria | null; lista: Servico[] }[] = [
    ...cats.map((c) => ({ cat: c, lista: ativos.filter((s) => s.categoriaId === c.id).sort((a, x) => a.ordem - x.ordem) })),
    { cat: null, lista: ativos.filter((s) => !s.categoriaId || !cats.some((c) => c.id === s.categoriaId)) },
  ].filter((g) => g.lista.length || g.cat);
  const q = normalizar(busca);

  return (
    <div className="pn-pagina">
      <Cabecalho
        titulo="Serviços"
        texto={`${ativos.length} serviços · ${ativos.filter((s) => s.pausado).length} pausados`}
        acoes={
          aba === "servicos" ? (
            <>
              <Botao variante="secundario" icone="lista" onClick={() => setCategorias(true)}>
                Categorias
              </Botao>
              <Botao variante="principal" icone="mais" onClick={() => setEditar(servicoNovo(b, cats[0]?.id ?? null))}>
                Novo serviço
              </Botao>
            </>
          ) : (
            <Botao
              variante="principal"
              icone="mais"
              onClick={() => setPacote({ id: novoId("pk"), nome: "", servicoId: ativos[0]?.id ?? "", sessoes: 10, preco: 0, validadeDias: 365, ativo: true })}
            >
              Novo pacote
            </Botao>
          )
        }
      />

      {b.negocio.modulos.pacotes && (
        <div style={{ marginBottom: 14 }}>
          <Segmentado
            rotulo="Seção"
            valor={aba}
            onMudar={setAba}
            opcoes={[
              { id: "servicos", rotulo: "Serviços", contagem: ativos.length },
              { id: "pacotes", rotulo: "Pacotes e assinaturas", contagem: b.pacotes.filter((p) => p.ativo).length },
            ]}
          />
        </div>
      )}

      {aba === "servicos" ? (
        <>
          {ativos.length > 8 && (
            <div className="pn-filtros">
              <Busca valor={busca} onMudar={setBusca} placeholder="Buscar serviço" />
            </div>
          )}
          {!ativos.length && (
            <div className="pn-cartao">
              <EstadoVazio icone="servicos" titulo="Cadastre seu primeiro serviço" texto="Nome, duração e preço. Foto é opcional." acao={<Botao variante="principal" icone="mais" onClick={() => setEditar(servicoNovo(b, null))}>Novo serviço</Botao>} />
            </div>
          )}
          <div style={{ display: "grid", gap: 16 }}>
            {grupos.map((g) => {
              const lista = q ? g.lista.filter((s) => normalizar(s.nome).includes(q)) : g.lista;
              if (q && !lista.length) return null;
              return (
                <div key={g.cat?.id ?? "_"} className="pn-cartao">
                  <div className="pn-cartao-cabeca" style={{ paddingBottom: 10 }}>
                    <h2>
                      {g.cat?.nome ?? "Sem categoria"} <Selo>{lista.length}</Selo>
                    </h2>
                    <Botao variante="fantasma" tamanho="p" icone="mais" onClick={() => setEditar(servicoNovo(b, g.cat?.id ?? null))}>
                      Adicionar
                    </Botao>
                  </div>
                  {lista.length === 0 ? (
                    <p className="pn-cartao-sub" style={{ padding: "0 18px 16px" }}>
                      Nenhum serviço nesta categoria.
                    </p>
                  ) : (
                    <Reorder.Group
                      as="div"
                      axis="y"
                      values={lista.map((s) => s.id)}
                      onReorder={(ids: string[]) => mudar((x) => ({ ...x, servicos: reordenar(x.servicos, ids) }))}
                      className="pn-lista"
                    >
                      {lista.map((s) => (
                        <LinhaServico key={s.id} b={b} s={s} arrastar={!q} onEditar={() => setEditar(s)} onPausar={(v) => { mudar((x) => salvarServico(x, { ...s, pausado: v })); avisar(v ? `${s.nome} pausado: some do site até você reativar.` : `${s.nome} de volta ao site.`); }} />
                      ))}
                    </Reorder.Group>
                  )}
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <Pacotes b={b} onEditar={setPacote} />
      )}

      <EditorServico servico={editar} onFechar={() => setEditar(null)} />
      <EditorPacote pacote={pacote} onFechar={() => setPacote(null)} />
      <EditorCategorias aberta={categorias} onFechar={() => setCategorias(false)} />
    </div>
  );
}

function LinhaServico({ b, s, arrastar, onEditar, onPausar }: { b: Banco; s: Servico; arrastar: boolean; onEditar: () => void; onPausar: (v: boolean) => void }) {
  const quem = b.profissionais.filter((p) => p.ativo && p.servicosIds.includes(s.id));
  return (
    <Reorder.Item as="div" value={s.id} dragListener={arrastar} className="pn-linha" style={{ background: "var(--c-superficie)", cursor: arrastar ? "grab" : undefined, opacity: s.pausado ? 0.6 : 1 }}>
      {arrastar && <Icone nome="menuVertical" tamanho={18} />}
      <button type="button" className="pn-linha-info" style={{ textAlign: "left" }} onClick={onEditar}>
        <strong style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {s.nome}
          {s.destaque && <Icone nome="estrela" tamanho={14} peso="fill" />}
        </strong>
        <small style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {duracao(s.duracaoMin)}
          {s.intervaloMin > 0 && ` + ${s.intervaloMin} min de limpeza`} ·{" "}
          {s.modoPreco === "oculto" ? "preço sob consulta" : `${s.modoPreco === "a_partir_de" ? "a partir de " : ""}${brl(s.preco)}`}
          <span style={{ display: "inline-flex", gap: 2 }}>
            {quem.map((p) => (
              <span key={p.id} className="ag-ponto-pro" title={p.nome} style={{ background: corDaPessoa(p.cor) }} />
            ))}
          </span>
        </small>
      </button>
      {!s.online && <Selo>Só no balcão</Selo>}
      {s.pausado && <Selo tom="atencao">Pausado</Selo>}
      <span onPointerDown={(e) => e.stopPropagation()}>
        <Interruptor ligado={!s.pausado} onMudar={(v) => onPausar(!v)} rotulo={s.pausado ? "Reativar" : "Pausar"} />
      </span>
      <BotaoIcone icone="editar" rotulo="Editar" onClick={onEditar} />
    </Reorder.Item>
  );
}

function EditorServico({ servico, onFechar }: { servico: Servico | null; onFechar: () => void }) {
  const { banco, mudar } = useLoja();
  const avisar = useAvisos();
  const confirmar = useConfirmar();
  const [s, setS] = useState<Servico | null>(servico);
  const [quem, setQuem] = useState<string[]>([]);
  const [ultimo, setUltimo] = useState<Servico | null>(null);
  if (servico !== ultimo) {
    setUltimo(servico);
    setS(servico);
    setQuem(servico && banco ? banco.profissionais.filter((p) => p.servicosIds.includes(servico.id) || !banco.servicos.some((x) => x.id === servico.id)).map((p) => p.id) : []);
  }
  if (!banco) return null;
  const b = banco;
  const novo = servico && !b.servicos.some((x) => x.id === servico.id);

  const salvar = () => {
    if (!s) return;
    if (!s.nome.trim()) return avisar("Dê um nome ao serviço.", "erro");
    if (!quem.length) return avisar("Marque pelo menos uma pessoa que faz este serviço.", "erro");
    mudar((x) => ({
      ...salvarServico(x, { ...s, nome: s.nome.trim() }),
      profissionais: x.profissionais.map((p) => ({
        ...p,
        servicosIds: quem.includes(p.id) ? [...new Set([...p.servicosIds, s.id])] : p.servicosIds.filter((id) => id !== s.id),
      })),
    }));
    avisar(novo ? "Serviço criado." : "Serviço salvo.");
    onFechar();
  };

  return (
    <Folha
      aberta={!!servico}
      onFechar={onFechar}
      titulo={novo ? "Novo serviço" : "Editar serviço"}
      largura={500}
      rodape={
        <>
          {!novo && (
            <Botao
              variante="fantasma"
              icone="apagar"
              onClick={async () => {
                const ok = await confirmar({ titulo: "Remover este serviço?", texto: "Some do site e do painel. O histórico de quem já fez continua.", confirmar: "Remover", perigo: true });
                if (!ok || !s) return;
                mudar((x) => arquivarServico(x, s.id));
                onFechar();
              }}
            >
              Remover
            </Botao>
          )}
          <Botao variante="principal" onClick={salvar}>
            Salvar
          </Botao>
        </>
      }
    >
      {s && (
        <div style={{ display: "grid", gap: 16 }}>
          <Campo rotulo="Nome">
            <Entrada value={s.nome} onChange={(e) => setS({ ...s, nome: e.target.value })} placeholder="Ex.: Corte masculino" />
          </Campo>
          <Campo rotulo="Descrição" opcional ajuda="Aparece na sua página. Duas linhas bastam.">
            <Texto rows={2} value={s.descricao} onChange={(e) => setS({ ...s, descricao: e.target.value })} />
          </Campo>
          <Campo rotulo="Categoria">
            <select className="ui-entrada" value={s.categoriaId ?? ""} onChange={(e) => setS({ ...s, categoriaId: e.target.value || null })}>
              <option value="">Sem categoria</option>
              {b.categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </Campo>
          <div className="ui-grade-campos duas" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <Campo rotulo="Duração">
              <Passo valor={s.duracaoMin} passo={5} min={5} formatar={duracao} onMudar={(v) => setS({ ...s, duracaoMin: v })} />
            </Campo>
            <Campo rotulo="Limpeza depois" ajuda="Bloqueia a agenda, o cliente não vê.">
              <Passo valor={s.intervaloMin} passo={5} min={0} formatar={(v) => (v ? `${v} min` : "nenhuma")} onMudar={(v) => setS({ ...s, intervaloMin: v })} />
            </Campo>
          </div>
          <div className="ui-grade-campos duas">
            <Campo rotulo="Preço">
              <Entrada inputMode="numeric" value={formatarValorCampo(s.preco)} onChange={(e) => setS({ ...s, preco: centavosParaReais(e.target.value) })} icone="dinheiro" disabled={s.modoPreco === "oculto"} />
            </Campo>
            <Campo rotulo="Como mostrar o preço">
              <select className="ui-entrada" value={s.modoPreco} onChange={(e) => setS({ ...s, modoPreco: e.target.value as Servico["modoPreco"] })}>
                <option value="fixo">Preço fixo</option>
                <option value="a_partir_de">“A partir de”</option>
                <option value="oculto">Sob consulta</option>
              </select>
            </Campo>
          </div>

          <div className="pn-secao-form">
            <h3>Quem faz</h3>
            <div className="pn-checks">
              {b.profissionais
                .filter((p) => p.ativo)
                .map((p) => (
                  <label key={p.id} className="pn-check">
                    <input type="checkbox" checked={quem.includes(p.id)} onChange={(e) => setQuem((q) => (e.target.checked ? [...q, p.id] : q.filter((x) => x !== p.id)))} />
                    <span className="ag-ponto-pro" style={{ background: corDaPessoa(p.cor) }} />
                    <span>{p.nome}</span>
                  </label>
                ))}
            </div>
          </div>

          <div className="pn-secao-form">
            <h3>Na sua página</h3>
            <div>
              <div className="pn-opcao">
                <div>
                  <strong>Agendável pelo link</strong>
                  <small>Desligado, só a equipe marca pelo painel.</small>
                </div>
                <Interruptor ligado={s.online} onMudar={(v) => setS({ ...s, online: v })} rotulo="Agendável pelo link" />
              </div>
              <div className="pn-opcao">
                <div>
                  <strong>Destaque</strong>
                  <small>Aparece em “Mais procurados”, no topo.</small>
                </div>
                <Interruptor ligado={s.destaque} onMudar={(v) => setS({ ...s, destaque: v })} rotulo="Destaque" />
              </div>
              <div className="pn-opcao">
                <div>
                  <strong>Pausado</strong>
                  <small>Some do site temporariamente (falta de produto, férias).</small>
                </div>
                <Interruptor ligado={s.pausado} onMudar={(v) => setS({ ...s, pausado: v })} rotulo="Pausado" />
              </div>
            </div>
          </div>

          {(b.negocio.modulos.retorno || b.negocio.modulos.anamnese) && (
            <div className="pn-secao-form">
              <h3>Cuidado com o cliente</h3>
              {b.negocio.modulos.retorno && (
                <Campo rotulo="Lembrar de voltar depois de" opcional ajuda="O cliente entra em “Hora de voltar” quando passa desse prazo sem marcar.">
                  <Passo valor={s.retornoDias ?? 0} passo={5} min={0} formatar={(v) => (v ? `${v} dias` : "não lembrar")} onMudar={(v) => setS({ ...s, retornoDias: v || null })} />
                </Campo>
              )}
              {b.negocio.modulos.anamnese && (
                <Campo rotulo="Ficha de anamnese" opcional ajuda="Pedida ao cliente antes do primeiro atendimento.">
                  <select className="ui-entrada" value={s.fichaId ?? ""} onChange={(e) => setS({ ...s, fichaId: e.target.value || null })}>
                    <option value="">Não precisa</option>
                    {b.modelosFicha.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.nome}
                      </option>
                    ))}
                  </select>
                </Campo>
              )}
            </div>
          )}
        </div>
      )}
    </Folha>
  );
}

export function Passo({ valor, passo, min, max = 600, formatar, onMudar }: { valor: number; passo: number; min: number; max?: number; formatar: (v: number) => string; onMudar: (v: number) => void }) {
  return (
    <div className="pn-passo-num">
      <button type="button" aria-label="Menos" onClick={() => onMudar(Math.max(min, valor - passo))}>
        <Icone nome="menos" tamanho={16} />
      </button>
      <span>{formatar(valor)}</span>
      <button type="button" aria-label="Mais" onClick={() => onMudar(Math.min(max, valor + passo))}>
        <Icone nome="mais" tamanho={16} />
      </button>
    </div>
  );
}

function EditorCategorias({ aberta, onFechar }: { aberta: boolean; onFechar: () => void }) {
  const { banco, mudar } = useLoja();
  const confirmar = useConfirmar();
  const [nova, setNova] = useState("");
  if (!banco) return null;
  const cats = banco.categorias.slice().sort((a, c) => a.ordem - c.ordem);
  return (
    <Folha aberta={aberta} onFechar={onFechar} titulo="Categorias" subtitulo="Arraste para mudar a ordem na sua página.">
      <div style={{ display: "grid", gap: 14 }}>
        <Reorder.Group as="div" axis="y" values={cats.map((c) => c.id)} onReorder={(ids: string[]) => mudar((x) => ({ ...x, categorias: reordenar(x.categorias, ids) }))} style={{ display: "grid", gap: 6 }}>
          {cats.map((c) => (
            <Reorder.Item as="div" key={c.id} value={c.id} style={{ display: "flex", gap: 8, alignItems: "center", background: "var(--c-superficie)", cursor: "grab" }}>
              <Icone nome="menuVertical" tamanho={18} />
              <Entrada defaultValue={c.nome} onBlur={(e) => e.target.value.trim() && mudar((x) => salvarCategoria(x, { ...c, nome: e.target.value.trim() }))} />
              <BotaoIcone
                icone="apagar"
                rotulo="Remover categoria"
                onClick={async () => {
                  const ok = await confirmar({ titulo: `Remover “${c.nome}”?`, texto: "Os serviços dela ficam sem categoria — nada é apagado.", confirmar: "Remover" });
                  if (ok) mudar((x) => removerCategoria(x, c.id));
                }}
              />
            </Reorder.Item>
          ))}
        </Reorder.Group>
        <div style={{ display: "flex", gap: 8 }}>
          <Entrada value={nova} onChange={(e) => setNova(e.target.value)} placeholder="Nova categoria" />
          <Botao
            variante="principal"
            disabled={!nova.trim()}
            onClick={() => {
              mudar((x) => salvarCategoria(x, { id: novoId("ct"), nome: nova.trim(), ordem: x.categorias.length }));
              setNova("");
            }}
          >
            Adicionar
          </Botao>
        </div>
      </div>
    </Folha>
  );
}

function Pacotes({ b, onEditar }: { b: Banco; onEditar: (p: Pacote) => void }) {
  const vendidos = (id: string) => b.pacotesClientes.filter((p) => p.pacoteId === id);
  return (
    <div className="pn-cartao">
      {b.pacotes.length === 0 ? (
        <EstadoVazio icone="pacote" titulo="Nenhum pacote ainda" texto="Pacote de sessões (10 sessões de laser) ou assinatura mensal (4 cortes por mês)." />
      ) : (
        <div className="pn-lista">
          {b.pacotes.map((p) => {
            const s = b.servicos.find((x) => x.id === p.servicoId);
            const v = vendidos(p.id);
            const ativos = v.filter((x) => {
              const pk = b.pacotes.find((y) => y.id === x.pacoteId);
              return pk && x.sessoesUsadas < pk.sessoes;
            });
            return (
              <button key={p.id} type="button" className="pn-linha" onClick={() => onEditar(p)} style={{ opacity: p.ativo ? 1 : 0.55 }}>
                <span className="ini-atencao-icone" style={{ background: "var(--c-marca-sutil)", color: "var(--c-marca-tinta)" }}>
                  <Icone nome="pacote" tamanho={20} />
                </span>
                <span className="pn-linha-info">
                  <strong>{p.nome}</strong>
                  <small>
                    {p.sessoes}× {s?.nome} · {brl(p.preco / p.sessoes)} por sessão (avulso {brl(s?.preco ?? 0)})
                  </small>
                </span>
                <span className="pn-linha-lado">
                  <b>{brl(p.preco)}</b>
                  {ativos.length} clientes ativos
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function EditorPacote({ pacote, onFechar }: { pacote: Pacote | null; onFechar: () => void }) {
  const { banco, mudar } = useLoja();
  const avisar = useAvisos();
  const [p, setP] = useState<Pacote | null>(pacote);
  const [ultimo, setUltimo] = useState<Pacote | null>(null);
  if (pacote !== ultimo) {
    setUltimo(pacote);
    setP(pacote);
  }
  if (!banco) return null;
  const s = p ? banco.servicos.find((x) => x.id === p.servicoId) : null;
  const economia = p && s ? s.preco * p.sessoes - p.preco : 0;
  return (
    <Folha
      aberta={!!pacote}
      onFechar={onFechar}
      titulo={pacote && banco.pacotes.some((x) => x.id === pacote.id) ? "Editar pacote" : "Novo pacote"}
      rodape={
        <Botao
          variante="principal"
          onClick={() => {
            if (!p?.nome.trim() || !p.servicoId) return avisar("Preencha nome e serviço.", "erro");
            mudar((x) => salvarPacote(x, p));
            avisar("Pacote salvo.");
            onFechar();
          }}
        >
          Salvar
        </Botao>
      }
    >
      {p && (
        <div style={{ display: "grid", gap: 16 }}>
          <Campo rotulo="Nome">
            <Entrada value={p.nome} onChange={(e) => setP({ ...p, nome: e.target.value })} placeholder="Ex.: Laser axilas · 10 sessões" />
          </Campo>
          <Campo rotulo="Serviço">
            <select className="ui-entrada" value={p.servicoId} onChange={(e) => setP({ ...p, servicoId: e.target.value })}>
              {banco.servicos
                .filter((x) => x.ativo)
                .map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.nome}
                  </option>
                ))}
            </select>
          </Campo>
          <div className="ui-grade-campos duas" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <Campo rotulo="Sessões">
              <Passo valor={p.sessoes} passo={1} min={1} max={60} formatar={(v) => `${v}`} onMudar={(v) => setP({ ...p, sessoes: v })} />
            </Campo>
            <Campo rotulo="Validade">
              <Passo valor={p.validadeDias} passo={30} min={30} max={1095} formatar={(v) => `${Math.round(v / 30)} meses`} onMudar={(v) => setP({ ...p, validadeDias: v })} />
            </Campo>
          </div>
          <Campo rotulo="Preço do pacote" ajuda={economia > 0 ? `O cliente economiza ${brl(economia)} em relação ao avulso.` : undefined}>
            <Entrada inputMode="numeric" value={formatarValorCampo(p.preco)} onChange={(e) => setP({ ...p, preco: centavosParaReais(e.target.value) })} icone="dinheiro" />
          </Campo>
          <Interruptor ligado={p.ativo} onMudar={(v) => setP({ ...p, ativo: v })} rotulo="À venda" mostrarRotulo />
        </div>
      )}
    </Folha>
  );
}
