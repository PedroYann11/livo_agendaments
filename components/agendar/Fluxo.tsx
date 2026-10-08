"use client";

// =====================================================================
// O fluxo do cliente: serviço → profissional → dia e hora → dados.
//
// Meta: menos de um minuto, sem conta, sem senha. Passos que não fazem
// sentido são pulados (uma profissional só, ou a loja não deixa escolher).
// Os passos deslizam na direção em que se anda — voltar desliza para trás.
// =====================================================================

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useLoja } from "@/lib/dados/loja";
import type { Agendamento, Banco, Servico } from "@/lib/tipos";
import { Icone } from "@/components/ui/Icone";
import { Avatar, Botao, BotaoIcone, Campo, Entrada, Esqueleto, Texto } from "@/components/ui/basicos";
import { useAvisos } from "@/components/ui/Avisos";
import { SeletorHorario, type Escolha } from "./SeletorHorario";
import { Confirmado } from "./Confirmado";
import { aplicarCupom, criarAgendamento } from "@/lib/dados/acoes";
import { duracaoTotal, horariosDisponiveis, profissionaisAptos } from "@/lib/disponibilidade";
import { brl, duracao, primeiroNome } from "@/lib/formato";
import { dataLonga, dataRelativa, somarDias, somarMin, juntar } from "@/lib/datas";
import { capitalizarNome, mascaraTelefone, telefoneValido } from "@/lib/masks";
import { servicosVisiveis, capitalizar } from "@/components/vitrine/util";

type Passo = "servicos" | "profissional" | "horario" | "dados";

const CHAVE_CLIENTE = "livo-agenda:cliente";

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
        {[0, 1, 2, 3].map((i) => (
          <Esqueleto key={i} altura={72} raio={16} />
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
  const servicos = servicosVisiveis(b);

  const inicial = params.get("servico");
  const [selecionados, setSelecionados] = useState<string[]>(inicial && servicos.some((s) => s.id === inicial) ? [inicial] : []);
  const [profissional, setProfissional] = useState<string | null | undefined>(undefined);
  const [data, setData] = useState<string | null>(params.get("data"));
  const [escolha, setEscolha] = useState<Escolha | null>(null);
  const [cliente, setCliente] = useState({ nome: "", telefone: "", email: "", nascimento: "", observacao: "" });
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

  const passos: Passo[] = pularProfissional ? ["servicos", "horario", "dados"] : ["servicos", "profissional", "horario", "dados"];
  const [passo, setPasso] = useState<Passo>(inicial && selecionados.length ? (pularProfissional ? "horario" : "profissional") : "servicos");
  const [direcao, setDirecao] = useState(1);
  const indice = passos.indexOf(passo);

  const profEfetivo = pularProfissional ? (aptos.length === 1 ? aptos[0].id : null) : profissional ?? null;

  const escolhidos = selecionados.map((id) => b.servicos.find((s) => s.id === id)).filter((s): s is Servico => !!s);
  const { atendimento } = duracaoTotal(escolhidos);
  const subtotal = escolhidos.reduce((s, x) => s + x.preco, 0);
  const { cupom: cupomValido, desconto } = aplicarCupom(b, cupom, subtotal);
  const total = subtotal - desconto;
  const temPrecoOculto = escolhidos.some((s) => s.modoPreco === "oculto");
  const aPartirDe = escolhidos.some((s) => s.modoPreco === "a_partir_de");

  const ir = useCallback(
    (p: Passo) => {
      setDirecao(passos.indexOf(p) >= indice ? 1 : -1);
      setPasso(p);
      window.scrollTo({ top: 0 });
    },
    [passos, indice],
  );

  const avancar = () => {
    if (passo === "servicos") {
      if (!selecionados.length) return;
      ir(pularProfissional ? "horario" : "profissional");
    } else if (passo === "profissional") ir("horario");
    else if (passo === "horario" && escolha) ir("dados");
    else if (passo === "dados") confirmar();
  };

  const voltar = () => {
    if (indice <= 0) router.push(`/${slug}`);
    else ir(passos[indice - 1]);
  };

  const alternarServico = (id: string) => {
    setEscolha(null);
    if (!n.regras.multiplosServicos) {
      setSelecionados([id]);
      setProfissional(undefined);
      setTimeout(() => {
        setDirecao(1);
        const apt = profissionaisAptos(b, [id]);
        setPasso(!n.regras.escolherProfissional || apt.length <= 1 ? "horario" : "profissional");
      }, 220);
      return;
    }
    setSelecionados((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
    setProfissional(undefined);
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

  const titulos: Record<Passo, string> = {
    servicos: "Serviço",
    profissional: "Profissional",
    horario: "Dia e horário",
    dados: "Seus dados",
  };

  const podeAvancar =
    (passo === "servicos" && selecionados.length > 0) ||
    passo === "profissional" ||
    (passo === "horario" && !!escolha) ||
    passo === "dados";

  const rotuloBotao = passo === "dados" ? "Confirmar" : passo === "horario" ? "Continuar" : "Continuar";

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
                <motion.i initial={false} animate={{ scaleX: i <= indice ? 1 : 0 }} transition={{ duration: 0.45, ease: [0.23, 1, 0.32, 1] }} />
              </span>
            ))}
          </div>
        </div>
      </header>

      <main className="ag-miolo">
        <AnimatePresence mode="wait" custom={direcao} initial={false}>
          <motion.section
            key={passo}
            custom={direcao}
            variants={{
              entra: (d: number) => ({ opacity: 0, x: d * 36 }),
              fica: { opacity: 1, x: 0 },
              sai: (d: number) => ({ opacity: 0, x: d * -36 }),
            }}
            initial="entra"
            animate="fica"
            exit="sai"
            transition={{ duration: 0.26, ease: [0.23, 1, 0.32, 1] }}
          >
            {passo === "servicos" && (
              <PassoServicos b={b} servicos={servicos} selecionados={selecionados} multiplo={n.regras.multiplosServicos} onAlternar={alternarServico} />
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
                <h1 className="vt-titulo ag-passo-titulo">Quando fica bom?</h1>
                <p className="ag-passo-texto">
                  {duracao(atendimento)} de atendimento
                  {profEfetivo && !pularProfissional ? ` com ${primeiroNome(b.profissionais.find((p) => p.id === profEfetivo)?.nome ?? "")}` : ""}.
                </p>
                <SeletorHorario
                  banco={b}
                  servicosIds={selecionados}
                  profissionalId={profEfetivo}
                  agora={agora()}
                  data={data}
                  hora={escolha && escolha.data === data ? escolha.hora : null}
                  onData={(d) => {
                    setData(d);
                  }}
                  onHora={(e) => setEscolha(e)}
                />
              </div>
            )}
            {passo === "dados" && escolha && (
              <div>
                <h1 className="vt-titulo ag-passo-titulo">Quase lá</h1>
                <p className="ag-passo-texto">Só para a gente saber quem vem — e te avisar antes.</p>
                <div className="ag-form">
                  <Campo rotulo="Nome completo" erro={erros.nome}>
                    <Entrada
                      autoComplete="name"
                      value={cliente.nome}
                      onChange={(e) => setCliente({ ...cliente, nome: e.target.value })}
                      onBlur={() => setCliente((c) => ({ ...c, nome: capitalizarNome(c.nome) }))}
                      placeholder="Como você se chama?"
                    />
                  </Campo>
                  <Campo rotulo="WhatsApp" erro={erros.telefone} ajuda="A confirmação e o lembrete chegam por aqui.">
                    <Entrada
                      inputMode="tel"
                      autoComplete="tel-national"
                      value={mascaraTelefone(cliente.telefone)}
                      onChange={(e) => setCliente({ ...cliente, telefone: e.target.value })}
                      placeholder="(88) 9 9999-9999"
                      icone="whatsapp"
                    />
                  </Campo>
                  {n.modulos.aniversarios && (
                    <Campo rotulo="Data de nascimento" opcional ajuda="Tem mimo no seu aniversário.">
                      <Entrada type="date" value={cliente.nascimento} onChange={(e) => setCliente({ ...cliente, nascimento: e.target.value })} />
                    </Campo>
                  )}
                  <Campo rotulo="Observação" opcional>
                    <Texto
                      rows={2}
                      value={cliente.observacao}
                      onChange={(e) => setCliente({ ...cliente, observacao: e.target.value })}
                      placeholder="Algo que a gente precisa saber?"
                    />
                  </Campo>
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
                  <div className="ag-resumo-linha">
                    <Icone nome="cliente" />
                    <div>
                      <strong>{b.profissionais.find((p) => p.id === escolha.profissionalId)?.nome}</strong>
                      <small>{b.profissionais.find((p) => p.id === escolha.profissionalId)?.cargo}</small>
                    </div>
                  </div>
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
                  Ao confirmar, você recebe um link para remarcar ou cancelar até {n.regras.cancelamentoAteHoras}h antes do horário.
                  {n.regras.confirmacao === "manual" && " O horário fica reservado e o negócio confirma em seguida."}
                  {n.modulos.sinal && escolhidos.some((s) => n.sinal.servicosIds.includes(s.id)) &&
                    ` Este serviço pede um sinal de ${n.sinal.percentual}% via Pix para garantir o horário.`}
                </p>
              </div>
            )}
          </motion.section>
        </AnimatePresence>
      </main>

      <motion.footer className="ag-barra" initial={{ y: 100 }} animate={{ y: 0 }} transition={{ duration: 0.4, ease: [0.32, 0.72, 0, 1] }}>
        <div className="ag-barra-linha">
          <div className="ag-barra-info">
            {escolhidos.length ? (
              <>
                <small>
                  {escolhidos.length === 1 ? escolhidos[0].nome : `${escolhidos.length} serviços`} · {duracao(atendimento)}
                  {escolha ? ` · ${capitalizar(dataRelativa(escolha.data, agora().slice(0, 10)))}, ${escolha.hora}` : ""}
                </small>
                <strong>{temPrecoOculto ? "Sob consulta" : `${aPartirDe ? "a partir de " : ""}${brl(total)}`}</strong>
              </>
            ) : (
              <>
                <small>Nenhum serviço ainda</small>
                <strong>Escolha um serviço</strong>
              </>
            )}
          </div>
          {(passo !== "profissional" || pularProfissional) && (
            <Botao variante="principal" disabled={!podeAvancar} carregando={enviando} onClick={avancar} iconeDepois={passo === "dados" ? undefined : "avancar"}>
              {rotuloBotao}
            </Botao>
          )}
        </div>
      </motion.footer>
    </div>
  );
}

function PassoServicos({
  b,
  servicos,
  selecionados,
  multiplo,
  onAlternar,
}: {
  b: Banco;
  servicos: Servico[];
  selecionados: string[];
  multiplo: boolean;
  onAlternar: (id: string) => void;
}) {
  const categorias = b.categorias.slice().sort((a, c) => a.ordem - c.ordem);
  const grupos = [
    ...categorias.map((c) => ({ id: c.id, nome: c.nome, lista: servicos.filter((s) => s.categoriaId === c.id) })),
    { id: "_", nome: "Outros", lista: servicos.filter((s) => !s.categoriaId || !categorias.some((c) => c.id === s.categoriaId)) },
  ].filter((g) => g.lista.length);
  return (
    <div>
      <h1 className="vt-titulo ag-passo-titulo">O que vamos fazer?</h1>
      <p className="ag-passo-texto">{multiplo ? "Pode escolher mais de um — a gente soma o tempo." : "Escolha o serviço."}</p>
      {grupos.map((g) => (
        <div className="ag-grupo" key={g.id}>
          {grupos.length > 1 && <h3>{g.nome}</h3>}
          <div className="ag-lista">
            {g.lista.map((s) => {
              const ativo = selecionados.includes(s.id);
              return (
                <button key={s.id} type="button" className="ag-opcao" aria-pressed={ativo} onClick={() => onAlternar(s.id)}>
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
                    {s.descricao && <small>{s.descricao}</small>}
                  </span>
                  <span className="ag-opcao-lado">
                    <b>{s.modoPreco === "oculto" ? "Consulte" : brl(s.preco)}</b>
                    {duracao(s.duracaoMin)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
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
  // o primeiro horário livre de cada um, nos próximos 14 dias
  const primeiro = useMemo(() => {
    const r: Record<string, string> = {};
    const hoje = agora.slice(0, 10);
    for (const p of [null, ...aptos.map((x) => x.id)]) {
      for (let i = 0; i < 14; i++) {
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
      <p className="ag-passo-texto">Sem preferência, você pega o primeiro horário livre.</p>
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
