"use client";

// =====================================================================
// O fluxo do cliente: categoria → opções → dia → horário → dados.
//
// Pouco texto e uma decisão por tela: primeiro o tipo de serviço, depois
// as opções dele, depois o mês com os dias livres em destaque e, tocado o
// dia, os horários. Passos que não fazem sentido somem (uma categoria só,
// uma profissional só). Escolher em mais de uma categoria é possível: a
// seleção fica guardada enquanto se volta às categorias.
// =====================================================================

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useLoja } from "@/lib/dados/loja";
import type { Agendamento, Banco, Servico } from "@/lib/tipos";
import { Icone } from "@/components/ui/Icone";
import { Avatar, Botao, BotaoIcone, Campo, Entrada, Esqueleto, Texto } from "@/components/ui/basicos";
import { useAvisos } from "@/components/ui/Avisos";
import type { Escolha } from "./SeletorHorario";
import { DiaHora } from "./DiaHora";
import { Confirmado } from "./Confirmado";
import { aplicarCupom, criarAgendamento } from "@/lib/dados/acoes";
import { duracaoTotal, horariosDisponiveis, profissionaisAptos } from "@/lib/disponibilidade";
import { brl, duracao, plural, primeiroNome } from "@/lib/formato";
import { dataLonga, dataRelativa, somarDias, somarMin, juntar } from "@/lib/datas";
import { capitalizarNome, mascaraTelefone, telefoneValido } from "@/lib/masks";
import { capitalizar, gruposVisiveis, menorPreco, servicosVisiveis, type Grupo } from "@/components/vitrine/util";

type Passo = "categoria" | "servicos" | "profissional" | "horario" | "dados";

const CHAVE_CLIENTE = "livo-agenda:cliente";
const SAIDA = [0.23, 1, 0.32, 1] as const;

function lerClienteSalvo(): { nome: string; telefone: string; email: string } {
  try {
    const j = JSON.parse(localStorage.getItem(CHAVE_CLIENTE) ?? "{}");
    return { nome: j.nome ?? "", telefone: j.telefone ?? "", email: j.email ?? "" };
  } catch {
    return { nome: "", telefone: "", email: "" };
  }
}

export function Fluxo() {
  const { banco } = useLoja();
  if (!banco) {
    return (
      <div className="ag-miolo" style={{ display: "grid", gap: 12, paddingTop: 90 }}>
        <Esqueleto altura={40} largura="70%" />
        {[0, 1, 2].map((i) => (
          <Esqueleto key={i} altura={84} raio={18} />
        ))}
      </div>
    );
  }
  return <FluxoComDados b={banco} />;
}

function FluxoComDados({ b }: { b: Banco }) {
  const { slug, mudar, agora } = useLoja();
  const router = useRouter();
  const params = useSearchParams();
  const avisar = useAvisos();
  const n = b.negocio;
  const grupos = useMemo(() => gruposVisiveis(b), [b]);
  const visiveis = useMemo(() => servicosVisiveis(b), [b]);
  const umaCategoria = grupos.length <= 1;

  // atalhos vindos da página: ?categoria=… abre as opções; ?servico=… já vai para o dia
  const servicoInicial = visiveis.find((s) => s.id === params.get("servico")) ?? null;
  const grupoDoServico = servicoInicial ? grupos.find((g) => g.servicos.includes(servicoInicial))?.id ?? null : null;
  const categoriaParam = grupos.some((g) => g.id === params.get("categoria")) ? params.get("categoria") : null;

  const [categoria, setCategoria] = useState<string | null>(grupoDoServico ?? categoriaParam ?? (umaCategoria ? grupos[0]?.id ?? null : null));
  const [selecionados, setSelecionados] = useState<string[]>(servicoInicial ? [servicoInicial.id] : []);
  const [profissional, setProfissional] = useState<string | null | undefined>(undefined);
  const [data, setData] = useState<string | null>(params.get("data"));
  const [escolha, setEscolha] = useState<Escolha | null>(null);
  const [cliente, setCliente] = useState({ nome: "", telefone: "", email: "", nascimento: "", observacao: "" });
  const [mais, setMais] = useState(false);
  const [cupom, setCupom] = useState("");
  const [cupomAberto, setCupomAberto] = useState(false);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  const [feito, setFeito] = useState<Agendamento | null>(null);

  useEffect(() => {
    const salvo = lerClienteSalvo();
    setCliente((c) => ({ ...c, ...salvo }));
  }, []);

  const aptos = useMemo(() => profissionaisAptos(b, selecionados), [b, selecionados]);
  const pularProfissional = !n.regras.escolherProfissional || aptos.length <= 1;

  const passos: Passo[] = [
    ...(umaCategoria ? [] : (["categoria"] as Passo[])),
    "servicos",
    ...(pularProfissional ? [] : (["profissional"] as Passo[])),
    "horario",
    "dados",
  ];
  const [passo, setPasso] = useState<Passo>(() => {
    if (servicoInicial) return pularProfissional ? "horario" : "profissional";
    if (categoriaParam || umaCategoria) return "servicos";
    return "categoria";
  });
  const [direcao, setDirecao] = useState(1);
  const indice = Math.max(0, passos.indexOf(passo));

  const profEfetivo = pularProfissional ? (aptos.length === 1 ? aptos[0].id : null) : profissional ?? null;

  const escolhidos = selecionados.map((id) => b.servicos.find((s) => s.id === id)).filter((s): s is Servico => !!s);
  const { atendimento } = duracaoTotal(escolhidos);
  const subtotal = escolhidos.reduce((s, x) => s + x.preco, 0);
  const { cupom: cupomValido, desconto } = aplicarCupom(b, cupom, subtotal);
  const total = subtotal - desconto;
  const temPrecoOculto = escolhidos.some((s) => s.modoPreco === "oculto");
  const aPartirDe = escolhidos.some((s) => s.modoPreco === "a_partir_de");
  const grupoAtual = grupos.find((g) => g.id === categoria) ?? null;

  const ir = (p: Passo) => {
    setDirecao(passos.indexOf(p) >= indice ? 1 : -1);
    setPasso(p);
    window.scrollTo({ top: 0 });
  };

  const depoisDosServicos = (ids: string[]): Passo => {
    const apt = profissionaisAptos(b, ids);
    return !n.regras.escolherProfissional || apt.length <= 1 ? "horario" : "profissional";
  };

  const avancar = () => {
    if (passo === "servicos") {
      if (selecionados.length) ir(depoisDosServicos(selecionados));
    } else if (passo === "profissional") ir("horario");
    else if (passo === "horario" && escolha) ir("dados");
    else if (passo === "dados") confirmar();
  };

  const voltar = () => {
    if (indice <= 0) router.push(`/${slug}`);
    else ir(passos[indice - 1]);
  };

  const abrirCategoria = (id: string) => {
    setCategoria(id);
    setDirecao(1);
    setPasso("servicos");
    window.scrollTo({ top: 0 });
  };

  const alternarServico = (id: string) => {
    setEscolha(null);
    setProfissional(undefined);
    if (!n.regras.multiplosServicos) {
      setSelecionados([id]);
      setTimeout(() => ir(depoisDosServicos([id])), 220);
      return;
    }
    setSelecionados((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  };

  const confirmar = () => {
    const e: Record<string, string> = {};
    if (cliente.nome.trim().split(/\s+/).length < 2) e.nome = "Escreva nome e sobrenome.";
    if (!telefoneValido(cliente.telefone)) e.telefone = "Confira o número com DDD.";
    setErros(e);
    if (Object.keys(e).length || !escolha) return;
    setEnviando(true);
    const momento = agora();
    const r = criarAgendamento(b, {
      servicosIds: selecionados,
      profissionalId: profEfetivo,
      data: escolha.data,
      hora: escolha.hora,
      canal: "online",
      agora: momento,
      cliente: {
        nome: cliente.nome,
        telefone: cliente.telefone,
        email: cliente.email,
        nascimento: cliente.nascimento || null,
      },
      observacao: cliente.observacao,
      cupom: cupomValido?.codigo ?? null,
    });
    setTimeout(() => {
      setEnviando(false);
      if (!r.ok) {
        avisar(r.motivo, "erro");
        setEscolha(null);
        ir("horario");
        return;
      }
      mudar(() => r.banco);
      try {
        localStorage.setItem(CHAVE_CLIENTE, JSON.stringify({ nome: cliente.nome, telefone: cliente.telefone, email: cliente.email }));
      } catch {}
      setFeito(r.valor);
      window.scrollTo({ top: 0 });
    }, 650);
  };

  if (feito) return <Confirmado ag={feito} />;

  if (!grupos.length) {
    return (
      <div className="ag">
        <main className="ag-miolo" style={{ paddingTop: 80 }}>
          <h1 className="vt-titulo ag-passo-titulo">Agenda fechada</h1>
          <p className="ag-passo-texto">Nenhum serviço pode ser marcado pelo link agora.</p>
          <Link href={`/${slug}`} className="vt-link" style={{ paddingLeft: 0 }}>
            <Icone nome="voltar" tamanho={18} /> Voltar para {n.nome}
          </Link>
        </main>
      </div>
    );
  }

  const titulos: Record<Passo, string> = {
    categoria: "Serviço",
    servicos: grupoAtual?.nome ?? "Serviço",
    profissional: "Profissional",
    horario: "Dia e horário",
    dados: "Seus dados",
  };

  const podeAvancar =
    (passo === "servicos" && selecionados.length > 0) ||
    passo === "profissional" ||
    (passo === "horario" && !!escolha) ||
    passo === "dados";

  const mostrarBotao = passo !== "categoria" && passo !== "profissional";

  return (
    <div className="ag">
      <header className="ag-topo">
        <div className="vt-container" style={{ maxWidth: 640 }}>
          <div className="ag-topo-linha">
            <BotaoIcone icone="voltar" rotulo="Voltar" onClick={voltar} />
            <div className="ag-topo-titulo">
              <small>{n.nome}</small>
              <strong>{titulos[passo]}</strong>
            </div>
            <Link href={`/${slug}`} className="ui-botao-icone" aria-label="Fechar">
              <Icone nome="fechar" />
            </Link>
          </div>
          <div className="ag-progresso" style={{ gridTemplateColumns: `repeat(${passos.length}, 1fr)` }}>
            {passos.map((p, i) => (
              <span key={p}>
                <motion.i initial={false} animate={{ scaleX: i <= indice ? 1 : 0 }} transition={{ duration: 0.45, ease: SAIDA }} />
              </span>
            ))}
          </div>
        </div>
      </header>

      <main className="ag-miolo">
        <AnimatePresence mode="wait" custom={direcao} initial={false}>
          <motion.section
            key={passo === "servicos" ? `servicos-${categoria}` : passo}
            custom={direcao}
            variants={{
              entra: (d: number) => ({ opacity: 0, x: d * 36 }),
              fica: { opacity: 1, x: 0 },
              sai: (d: number) => ({ opacity: 0, x: d * -36 }),
            }}
            initial="entra"
            animate="fica"
            exit="sai"
            transition={{ duration: 0.26, ease: SAIDA }}
          >
            {passo === "categoria" && <PassoCategoria grupos={grupos} selecionados={selecionados} onAbrir={abrirCategoria} />}

            {passo === "servicos" && grupoAtual && (
              <PassoServicos
                grupo={grupoAtual}
                selecionados={selecionados}
                multiplo={n.regras.multiplosServicos}
                outrasCategorias={!umaCategoria}
                onAlternar={alternarServico}
                onOutraCategoria={() => ir("categoria")}
              />
            )}

            {passo === "profissional" && (
              <PassoProfissional
                b={b}
                aptos={aptos}
                selecionados={selecionados}
                agora={agora()}
                valor={profissional}
                onEscolher={(id) => {
                  setProfissional(id);
                  setEscolha(null);
                  setTimeout(() => ir("horario"), 200);
                }}
              />
            )}

            {passo === "horario" && (
              <div>
                <h1 className="vt-titulo ag-passo-titulo">Escolha o dia</h1>
                <p className="ag-passo-texto">
                  {escolhidos.map((s) => s.nome).join(" + ")} · {duracao(atendimento)}
                  {profEfetivo && !pularProfissional ? ` · com ${primeiroNome(b.profissionais.find((p) => p.id === profEfetivo)?.nome ?? "")}` : ""}
                </p>
                <DiaHora
                  banco={b}
                  servicosIds={selecionados}
                  profissionalId={profEfetivo}
                  agora={agora()}
                  data={data}
                  hora={escolha && escolha.data === data ? escolha.hora : null}
                  onData={(d) => {
                    setData(d);
                    if (escolha?.data !== d) setEscolha(null);
                  }}
                  onHora={setEscolha}
                />
              </div>
            )}

            {passo === "dados" && escolha && (
              <div>
                <h1 className="vt-titulo ag-passo-titulo">Seus dados</h1>
                <div className="ag-form">
                  <Campo rotulo="Nome completo" erro={erros.nome}>
                    <Entrada
                      autoComplete="name"
                      value={cliente.nome}
                      onChange={(e) => setCliente({ ...cliente, nome: e.target.value })}
                      onBlur={() => setCliente((c) => ({ ...c, nome: capitalizarNome(c.nome) }))}
                      placeholder="Nome e sobrenome"
                    />
                  </Campo>
                  <Campo rotulo="WhatsApp" erro={erros.telefone}>
                    <Entrada
                      inputMode="tel"
                      autoComplete="tel-national"
                      value={mascaraTelefone(cliente.telefone)}
                      onChange={(e) => setCliente({ ...cliente, telefone: e.target.value })}
                      placeholder="(88) 9 9999-9999"
                      icone="whatsapp"
                    />
                  </Campo>
                  {mais ? (
                    <>
                      {n.modulos.aniversarios && (
                        <Campo rotulo="Data de nascimento" opcional>
                          <Entrada type="date" value={cliente.nascimento} onChange={(e) => setCliente({ ...cliente, nascimento: e.target.value })} />
                        </Campo>
                      )}
                      <Campo rotulo="Observação" opcional>
                        <Texto rows={2} value={cliente.observacao} onChange={(e) => setCliente({ ...cliente, observacao: e.target.value })} />
                      </Campo>
                    </>
                  ) : (
                    <button type="button" className="vt-link" style={{ justifySelf: "start", padding: 0 }} onClick={() => setMais(true)}>
                      <Icone nome="mais" tamanho={18} /> Adicionar observação
                    </button>
                  )}
                  {b.cupons.some((c) => c.ativo) &&
                    (cupomAberto ? (
                      <Campo rotulo="Cupom" erro={cupom && !cupomValido ? "Cupom não encontrado." : null} ajuda={cupomValido ? `Desconto de ${brl(desconto)} aplicado.` : undefined}>
                        <div className="ag-cupom">
                          <Entrada value={cupom} onChange={(e) => setCupom(e.target.value.toUpperCase())} placeholder="CÓDIGO" icone="cupom" />
                        </div>
                      </Campo>
                    ) : (
                      <button type="button" className="vt-link" style={{ justifySelf: "start", padding: 0 }} onClick={() => setCupomAberto(true)}>
                        <Icone nome="cupom" tamanho={18} /> Tenho um cupom
                      </button>
                    ))}
                </div>

                <div className="ag-resumo">
                  <div className="ag-resumo-linha">
                    <Icone nome="agenda" />
                    <div>
                      <strong>{capitalizar(dataLonga(escolha.data))}</strong>
                      <small>
                        {escolha.hora} às {somarMin(juntar(escolha.data, escolha.hora), atendimento).slice(11)} · {capitalizar(dataRelativa(escolha.data, agora().slice(0, 10)))}
                      </small>
                    </div>
                  </div>
                  <div className="ag-resumo-linha">
                    <Icone nome="servicos" />
                    <div>
                      <strong>{escolhidos.map((s) => s.nome).join(" + ")}</strong>
                      <small>{duracao(atendimento)}</small>
                    </div>
                  </div>
                  {!pularProfissional && (
                    <div className="ag-resumo-linha">
                      <Icone nome="cliente" />
                      <div>
                        <strong>{b.profissionais.find((p) => p.id === escolha.profissionalId)?.nome}</strong>
                        <small>{b.profissionais.find((p) => p.id === escolha.profissionalId)?.cargo}</small>
                      </div>
                    </div>
                  )}
                  {!temPrecoOculto && (
                    <div className="ag-resumo-total">
                      <span>{aPartirDe ? "A partir de" : "Total"}</span>
                      <b>
                        {desconto > 0 && (
                          <s style={{ fontSize: 14, color: "var(--c-texto-3)", marginRight: 8, fontWeight: 500 }}>{brl(subtotal)}</s>
                        )}
                        {brl(total)}
                      </b>
                    </div>
                  )}
                </div>
                <p className="ag-politica">
                  Você recebe um link para remarcar ou cancelar até {n.regras.cancelamentoAteHoras}h antes.
                  {n.regras.confirmacao === "manual" && " O negócio confirma em seguida."}
                  {n.modulos.sinal && escolhidos.some((s) => n.sinal.servicosIds.includes(s.id)) && ` Sinal de ${n.sinal.percentual}% via Pix para garantir o horário.`}
                </p>
              </div>
            )}
          </motion.section>
        </AnimatePresence>
      </main>

      <AnimatePresence>
        {(mostrarBotao || selecionados.length > 0) && (
          <motion.footer className="ag-barra" initial={{ y: 100 }} animate={{ y: 0 }} exit={{ y: 100 }} transition={{ duration: 0.4, ease: [0.32, 0.72, 0, 1] }}>
            <div className="ag-barra-linha">
              <div className="ag-barra-info">
                {escolhidos.length ? (
                  <>
                    <small>
                      {escolhidos.length === 1 ? escolhidos[0].nome : plural(escolhidos.length, "serviço", "serviços")} · {duracao(atendimento)}
                      {escolha ? ` · ${capitalizar(dataRelativa(escolha.data, agora().slice(0, 10)))}, ${escolha.hora}` : ""}
                    </small>
                    <strong>{temPrecoOculto ? "Sob consulta" : `${aPartirDe ? "a partir de " : ""}${brl(total)}`}</strong>
                  </>
                ) : (
                  <>
                    <small>Nada escolhido ainda</small>
                    <strong>Toque numa opção</strong>
                  </>
                )}
              </div>
              {passo === "categoria" ? (
                <Botao variante="principal" onClick={() => ir(depoisDosServicos(selecionados))} iconeDepois="avancar">
                  Continuar
                </Botao>
              ) : (
                mostrarBotao && (
                  <Botao variante="principal" disabled={!podeAvancar} carregando={enviando} onClick={avancar} iconeDepois={passo === "dados" ? undefined : "avancar"}>
                    {passo === "dados" ? "Confirmar" : "Continuar"}
                  </Botao>
                )
              )}
            </div>
          </motion.footer>
        )}
      </AnimatePresence>
    </div>
  );
}

function PassoCategoria({ grupos, selecionados, onAbrir }: { grupos: Grupo[]; selecionados: string[]; onAbrir: (id: string) => void }) {
  return (
    <div>
      <h1 className="vt-titulo ag-passo-titulo">O que você procura?</h1>
      <div className="ag-categorias">
        {grupos.map((g, i) => {
          const escolhidos = g.servicos.filter((s) => selecionados.includes(s.id)).length;
          const minimo = menorPreco(g.servicos);
          return (
            <motion.button
              key={g.id}
              type="button"
              className="ag-categoria"
              onClick={() => onAbrir(g.id)}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: i * 0.05, ease: SAIDA }}
            >
              <span className="ag-categoria-info">
                <strong className="vt-titulo">{g.nome}</strong>
                <small>
                  {g.descricao ? `${g.descricao} · ` : ""}
                  {plural(g.servicos.length, "opção", "opções")}
                  {minimo !== null ? ` · a partir de ${brl(minimo)}` : ""}
                </small>
              </span>
              {escolhidos > 0 ? <span className="ag-categoria-conta">{escolhidos}</span> : <Icone nome="direita" tamanho={20} />}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

function PassoServicos({
  grupo,
  selecionados,
  multiplo,
  outrasCategorias,
  onAlternar,
  onOutraCategoria,
}: {
  grupo: Grupo;
  selecionados: string[];
  multiplo: boolean;
  outrasCategorias: boolean;
  onAlternar: (id: string) => void;
  onOutraCategoria: () => void;
}) {
  return (
    <div>
      <h1 className="vt-titulo ag-passo-titulo">{grupo.nome}</h1>
      {multiplo && <p className="ag-passo-texto">Pode escolher mais de um.</p>}
      <div className="ag-lista">
        {grupo.servicos.map((s, i) => {
          const ativo = selecionados.includes(s.id);
          return (
            <motion.button
              key={s.id}
              type="button"
              className="ag-opcao"
              aria-pressed={ativo}
              onClick={() => onAlternar(s.id)}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: Math.min(i, 8) * 0.03, ease: SAIDA }}
            >
              <span className={`ag-marcador${multiplo ? " quadrado" : ""}`}>
                <AnimatePresence>
                  {ativo && (
                    <motion.span initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.4, opacity: 0 }} transition={{ type: "spring", stiffness: 600, damping: 30 }}>
                      <Icone nome="ok" tamanho={14} peso="bold" />
                    </motion.span>
                  )}
                </AnimatePresence>
              </span>
              <span className="ag-opcao-info">
                <strong>{s.nome}</strong>
                {/* a descrição só aparece em quem foi escolhido: a lista fica curta */}
                <AnimatePresence initial={false}>
                  {ativo && s.descricao && (
                    <motion.small initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22, ease: SAIDA }} style={{ overflow: "hidden" }}>
                      {s.descricao}
                    </motion.small>
                  )}
                </AnimatePresence>
              </span>
              <span className="ag-opcao-lado">
                <b>{s.modoPreco === "oculto" ? "Consulte" : `${s.modoPreco === "a_partir_de" ? "a partir de " : ""}${brl(s.preco)}`}</b>
                {duracao(s.duracaoMin)}
              </span>
            </motion.button>
          );
        })}
      </div>
      {multiplo && outrasCategorias && (
        <button type="button" className="vt-link ag-outra" onClick={onOutraCategoria}>
          <Icone nome="mais" tamanho={18} /> Somar de outra categoria
        </button>
      )}
    </div>
  );
}

function PassoProfissional({
  b,
  aptos,
  selecionados,
  agora,
  valor,
  onEscolher,
}: {
  b: Banco;
  aptos: Banco["profissionais"];
  selecionados: string[];
  agora: string;
  valor: string | null | undefined;
  onEscolher: (id: string | null) => void;
}) {
  // o primeiro horário livre de cada um, dentro da janela de agendamento
  const primeiro = useMemo(() => {
    const r: Record<string, string> = {};
    const hoje = agora.slice(0, 10);
    for (const p of [null, ...aptos.map((x) => x.id)]) {
      for (let i = 0; i <= b.negocio.regras.janelaMaxDias; i++) {
        const d = somarDias(hoje, i);
        const v = horariosDisponiveis(b, { servicosIds: selecionados, profissionalId: p, data: d, agora });
        if (v.length) {
          r[p ?? "_"] = `${capitalizar(dataRelativa(d, hoje))}, ${v[0].hora}`;
          break;
        }
      }
    }
    return r;
  }, [b, aptos, selecionados, agora]);

  return (
    <div>
      <h1 className="vt-titulo ag-passo-titulo">Com quem?</h1>
      <div className="ag-lista">
        <button type="button" className="ag-opcao" aria-pressed={valor === null} onClick={() => onEscolher(null)}>
          <span className="ag-qualquer">
            <Icone nome="servicos" tamanho={20} />
          </span>
          <span className="ag-opcao-info">
            <strong>Sem preferência</strong>
            <small>Primeiro livre: {primeiro._ ?? "sem horários"}</small>
          </span>
          <Icone nome="direita" tamanho={18} />
        </button>
        {aptos.map((p) => (
          <button key={p.id} type="button" className="ag-opcao" aria-pressed={valor === p.id} onClick={() => onEscolher(p.id)}>
            <Avatar nome={p.nome} cor={p.cor} tamanho={44} foto={p.fotoUrl} />
            <span className="ag-opcao-info">
              <strong>{p.nome}</strong>
              <small>
                {p.cargo}
                {primeiro[p.id] ? ` · ${primeiro[p.id]}` : " · sem horários"}
              </small>
            </span>
            <Icone nome="direita" tamanho={18} />
          </button>
        ))}
      </div>
    </div>
  );
}
