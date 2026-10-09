"use client";

// =====================================================================
// A agenda. É a tela que o dono mais abre — então ela tem que responder,
// num olhar: quem vem, com quem, quando, e onde ainda cabe alguém.
//
//   celular  → faixa da semana + linha do tempo do dia, com os buracos
//              livres visíveis ("livre 14:00–15:30 · tocar para agendar")
//   desktop  → dia com uma coluna por profissional, ou a semana inteira
// Cor = profissional (a mesma em todo o painel). Listrado = a confirmar.
// =====================================================================

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { useBanco, useLoja } from "@/lib/dados/loja";
import { usePainel } from "../PainelRaiz";
import { Cabecalho } from "../Cabecalho";
import { STATUS } from "../DetalheAgendamento";
import { Icone } from "@/components/ui/Icone";
import { Avatar, Botao, BotaoIcone, Campo, Entrada, Interruptor, Segmentado, Selo } from "@/components/ui/basicos";
import { Folha, useTelaLarga } from "@/components/ui/Folha";
import { useAvisos, useConfirmar } from "@/components/ui/Avisos";
import type { Agendamento, Banco, Profissional } from "@/lib/tipos";
import { STATUS_OCUPAM, aberturasDoDia, diaFechado, expedienteDoDia, janelasDoDia } from "@/lib/disponibilidade";
import { removerBloqueio, salvarBloqueio, salvarNegocio } from "@/lib/dados/acoes";
import {
  NOMES_DIAS_CURTOS,
  dataCurta,
  dataLonga,
  diaDaSemana,
  difMin,
  horaDoMin,
  inicioDaSemana,
  juntar,
  minDoDia,
  somarDias,
} from "@/lib/datas";
import { duracao, primeiroNome } from "@/lib/formato";
import { corDaPessoa } from "@/lib/paleta";
import { novoId } from "@/lib/id";
import { capitalizar } from "@/components/vitrine/util";
import { minutosDisponiveis } from "@/lib/metricas";

const ESCALA = 1.5; // px por minuto

export function Agenda() {
  const b = useBanco();
  const { agora } = useLoja();
  const { meuProfissionalId, novo } = usePainel();
  const params = useSearchParams();
  const router = useRouter();
  const larga = useTelaLarga(1024);
  const momento = agora();
  const hoje = momento.slice(0, 10);

  const [data, setData] = useState(params.get("data") ?? hoje);
  const [visao, setVisao] = useState<"dia" | "semana">("dia");
  const [pro, setPro] = useState<string>(meuProfissionalId ?? "todos");
  const [cancelados, setCancelados] = useState(false);
  const [bloquear, setBloquear] = useState(false);
  const [abrirDia, setAbrirDia] = useState(false);
  const soPendentes = params.get("filtro") === "pendente";
  const { mudar } = useLoja();
  const avisar = useAvisos();
  const confirmar = useConfirmar();

  const equipe = b.profissionais.filter((p) => p.ativo && (!meuProfissionalId || p.id === meuProfissionalId)).sort((a, c) => a.ordem - c.ordem);
  const colunas = pro === "todos" ? equipe : equipe.filter((p) => p.id === pro);

  const visiveis = (a: Agendamento) =>
    (cancelados || a.status !== "cancelado") &&
    (!soPendentes || a.status === "pendente") &&
    colunas.some((p) => p.id === a.profissionalId);

  const doDia = useMemo(
    () => b.agendamentos.filter((a) => a.inicio.slice(0, 10) === data && visiveis(a)).sort((a, c) => (a.inicio < c.inicio ? -1 : 1)),
    [b.agendamentos, data, cancelados, soPendentes, pro, meuProfissionalId], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const ocupado = doDia.filter((a) => STATUS_OCUPAM.includes(a.status) || a.status === "faltou").reduce((s, a) => s + difMin(a.inicio, a.fim), 0);
  const disponivel = colunas.reduce((s, p) => s + minutosDisponiveis(b, p, data, data), 0);
  const fechado = diaFechado(b, data);
  const avulso = aberturasDoDia(b, data);
  // ninguém trabalha nesse dia da semana: só abre como dia avulso
  const semDiaFixo = equipe.every((p) => (p.horario[diaDaSemana(data)] ?? []).length === 0);
  const marcados = doDia.filter((a) => STATUS_OCUPAM.includes(a.status)).length;

  const mover = (dias: number) => setData((d) => somarDias(d, visao === "semana" ? dias * 7 : dias));

  const reabrir = () => {
    mudar((x) => salvarNegocio(x, { datasEspeciais: x.negocio.datasEspeciais.filter((d) => d.data !== data) }));
    avisar("Dia reaberto: as vagas voltam para o site.");
  };
  const fecharDia = async () => {
    const ok = await confirmar({
      titulo: `Fechar ${dataCurta(data)}?`,
      texto: marcados
        ? `Ninguém mais consegue marcar neste dia. Os ${marcados} atendimentos já marcados continuam — avise os clientes.`
        : "Ninguém consegue marcar neste dia.",
      confirmar: "Fechar o dia",
    });
    if (!ok) return;
    mudar((x) =>
      avulso.length
        ? salvarNegocio(x, { aberturas: x.negocio.aberturas.filter((a) => a.data !== data) })
        : salvarNegocio(x, { datasEspeciais: [...x.negocio.datasEspeciais.filter((d) => d.data !== data), { data, rotulo: "Fechado" }] }),
    );
    avisar("Dia fechado. Some do site na hora.");
  };

  return (
    <div className="pn-pagina">
      <Cabecalho
        titulo="Agenda"
        texto={
          fechado
            ? `Fechado: ${fechado}`
            : avulso.length || !semDiaFixo
              ? `${avulso.length ? `Dia de atendimento ${avulso.map((a) => `${a.inicio}–${a.fim}`).join(", ")} · ` : ""}${doDia.filter((a) => a.status !== "cancelado").length} atendimentos · ${disponivel ? Math.round((ocupado / disponivel) * 100) : 0}% ocupado`
              : "Sem atendimento neste dia"
        }
        acoes={
          <>
            {fechado ? (
              <Botao variante="secundario" icone="desfazer" onClick={reabrir}>
                Reabrir o dia
              </Botao>
            ) : avulso.length || !semDiaFixo ? (
              <>
                <Botao variante="secundario" icone="agendaX" onClick={fecharDia}>
                  {avulso.length ? "Desmarcar dia" : "Fechar o dia"}
                </Botao>
                <Botao variante="secundario" icone="proibido" onClick={() => setBloquear(true)}>
                  Bloquear horário
                </Botao>
              </>
            ) : (
              <Botao variante="secundario" icone="agendaOk" onClick={() => setAbrirDia(true)}>
                Abrir este dia
              </Botao>
            )}
            <Botao variante="principal" icone="agendaMais" onClick={() => novo({ data, profissionalId: pro !== "todos" ? pro : undefined })}>
              Novo
            </Botao>
          </>
        }
      />

      {soPendentes && (
        <div className="dt-alerta" style={{ marginBottom: 12 }}>
          <Icone nome="ampulheta" tamanho={18} />
          <span style={{ flex: 1 }}>Mostrando só os horários a confirmar.</span>
          <button type="button" style={{ fontWeight: 650, textDecoration: "underline" }} onClick={() => router.replace("/painel/agenda")}>
            Ver todos
          </button>
        </div>
      )}

      <div className="ag-painel-barra">
        <div className="ag-painel-data">
          <BotaoIcone icone="esquerda" rotulo="Anterior" onClick={() => mover(-1)} />
          <BotaoIcone icone="direita" rotulo="Próximo" onClick={() => mover(1)} />
          <Botao variante="secundario" tamanho="p" onClick={() => setData(hoje)} disabled={data === hoje}>
            Hoje
          </Botao>
          <strong style={{ marginLeft: 6 }}>
            {visao === "semana" ? `Semana de ${dataCurta(inicioDaSemana(data))}` : capitalizar(dataLonga(data))}
          </strong>
        </div>
        <div style={{ flex: 1 }} />
        {larga && (
          <Segmentado
            rotulo="Visão"
            tamanho="p"
            valor={visao}
            onMudar={setVisao}
            opcoes={[
              { id: "dia", rotulo: "Dia" },
              { id: "semana", rotulo: "Semana" },
            ]}
          />
        )}
        <Interruptor ligado={cancelados} onMudar={setCancelados} rotulo="Cancelados" mostrarRotulo />
      </div>

      {equipe.length > 1 && (
        <div className="pn-fichas" style={{ marginBottom: 12 }}>
          <button type="button" className="pn-ficha" aria-pressed={pro === "todos"} onClick={() => setPro("todos")}>
            Toda a equipe
          </button>
          {equipe.map((p) => (
            <button key={p.id} type="button" className="pn-ficha" aria-pressed={pro === p.id} onClick={() => setPro(p.id)}>
              <i style={{ background: corDaPessoa(p.cor) }} />
              {primeiroNome(p.nome)}
            </button>
          ))}
        </div>
      )}

      {!larga && <FaixaSemana b={b} data={data} hoje={hoje} onData={setData} filtro={visiveis} />}

      {larga && visao === "semana" ? (
        <Semana b={b} data={data} hoje={hoje} filtro={visiveis} onDia={(d) => { setData(d); setVisao("dia"); }} />
      ) : larga ? (
        <GradeDia b={b} data={data} colunas={colunas} agendamentos={doDia} momento={momento} onVago={(p, hora) => novo({ data, hora, profissionalId: p })} />
      ) : (
        <ListaDia b={b} data={data} colunas={colunas} agendamentos={doDia} momento={momento} onVago={(p, hora) => novo({ data, hora, profissionalId: p ?? undefined })} />
      )}

      <FolhaBloqueio aberta={bloquear} onFechar={() => setBloquear(false)} data={data} equipe={equipe} />
      <FolhaAbrirDia aberta={abrirDia} onFechar={() => setAbrirDia(false)} data={data} />
    </div>
  );
}

// ---------------------------------------------------------------------

function FaixaSemana({ b, data, hoje, onData, filtro }: { b: Banco; data: string; hoje: string; onData: (d: string) => void; filtro: (a: Agendamento) => boolean }) {
  const inicio = inicioDaSemana(data);
  const dias = Array.from({ length: 7 }, (_, i) => somarDias(inicio, i));
  return (
    <div className="ag-semana-faixa">
      {dias.map((d) => {
        const qtd = b.agendamentos.filter((a) => a.inicio.slice(0, 10) === d && a.status !== "cancelado" && filtro(a)).length;
        const ativo = d === data;
        return (
          <button key={d} type="button" className={`ag-semana-dia${ativo ? " ativo" : ""}${d === hoje ? " hoje" : ""}`} onClick={() => onData(d)}>
            {ativo && <motion.span layoutId="ag-semana" className="ag-semana-dia-fundo" transition={{ type: "spring", stiffness: 480, damping: 38 }} />}
            {NOMES_DIAS_CURTOS[diaDaSemana(d)]}
            <b>{Number(d.slice(8))}</b>
            <i>
              {Array.from({ length: Math.min(4, Math.ceil(qtd / 4)) }, (_, i) => (
                <span key={i} />
              ))}
            </i>
          </button>
        );
      })}
    </div>
  );
}

/** Lista do dia (celular), com os intervalos livres entre os horários. */
function ListaDia({
  b,
  data,
  colunas,
  agendamentos,
  momento,
  onVago,
}: {
  b: Banco;
  data: string;
  colunas: Profissional[];
  agendamentos: Agendamento[];
  momento: string;
  onVago: (profissionalId: string | null, hora: string) => void;
}) {
  const { abrir } = usePainel();
  const umaPessoa = colunas.length === 1 ? colunas[0] : null;
  const fechado = diaFechado(b, data);

  // buracos livres só quando a visão é de uma pessoa (com a equipe toda, a lista mistura)
  type Item = { tipo: "ag"; ag: Agendamento } | { tipo: "livre"; de: number; ate: number } | { tipo: "bloqueio"; motivo: string; de: string; ate: string };
  const itens: Item[] = [];
  if (umaPessoa && !fechado) {
    const faixas = janelasDoDia(b, umaPessoa, data);
    const ocupacoes = agendamentos
      .filter((a) => a.status !== "cancelado")
      .map((a) => ({ de: minDoDia(a.inicio.slice(11)), ate: minDoDia(a.inicio.slice(11)) + difMin(a.inicio, a.fim) + a.intervaloMin }));
    const bloqueios = b.bloqueios.filter((x) => (x.profissionalId === umaPessoa.id || !x.profissionalId) && x.inicio.slice(0, 10) === data);
    for (const bl of bloqueios) ocupacoes.push({ de: minDoDia(bl.inicio.slice(11)), ate: minDoDia(bl.fim.slice(11)) });
    for (const f of faixas) {
      let t = minDoDia(f.inicio);
      const fim = minDoDia(f.fim);
      for (const o of ocupacoes.filter((x) => x.ate > t && x.de < fim).sort((a, c) => a.de - c.de)) {
        if (o.de - t >= 30) itens.push({ tipo: "livre", de: t, ate: o.de });
        t = Math.max(t, o.ate);
      }
      if (fim - t >= 30) itens.push({ tipo: "livre", de: t, ate: fim });
    }
    for (const bl of bloqueios) itens.push({ tipo: "bloqueio", motivo: bl.motivo, de: bl.inicio.slice(11), ate: bl.fim.slice(11) });
  }
  for (const a of agendamentos) itens.push({ tipo: "ag", ag: a });
  const chave = (i: Item) => (i.tipo === "ag" ? i.ag.inicio.slice(11) : i.tipo === "livre" ? horaDoMin(i.de) : i.de);
  itens.sort((x, y) => (chave(x) < chave(y) ? -1 : 1));
  const agoraMin = momento.slice(0, 10) === data ? minDoDia(momento.slice(11)) : null;

  if (fechado) {
    return <div className="ag-sem-vaga" style={{ background: "var(--c-superficie)" }}>Fechado: {fechado}</div>;
  }
  if (!itens.length) {
    return (
      <div className="pn-cartao">
        <div className="ui-vazio">
          <span className="ui-vazio-icone">
            <Icone nome="agenda" tamanho={26} />
          </span>
          <strong>Nada marcado neste dia</strong>
          <Botao variante="principal" icone="agendaMais" onClick={() => onVago(null, "")}>
            Agendar
          </Botao>
        </div>
      </div>
    );
  }

  return (
    <div className="ag-lista-dia">
      {itens.map((i, k) => {
        if (i.tipo === "livre") {
          if (agoraMin !== null && i.ate <= agoraMin) return null;
          const de = agoraMin !== null ? Math.max(i.de, Math.ceil(agoraMin / 15) * 15) : i.de;
          if (i.ate - de < 30) return null;
          return (
            <button key={`l${k}`} type="button" className="ag-intervalo-livre" onClick={() => onVago(umaPessoa?.id ?? null, horaDoMin(de))}>
              <Icone nome="mais" tamanho={16} />
              Livre {horaDoMin(de)}–{horaDoMin(i.ate)} · {duracao(i.ate - de)}
            </button>
          );
        }
        if (i.tipo === "bloqueio") {
          return (
            <div key={`b${k}`} className="ag-bloqueio" style={{ position: "static", padding: "10px 14px" }}>
              <Icone nome="proibido" tamanho={16} />
              {i.de}–{i.ate} · {i.motivo || "Bloqueado"}
            </div>
          );
        }
        const a = i.ag;
        const c = b.clientes.find((x) => x.id === a.clienteId);
        const p = b.profissionais.find((x) => x.id === a.profissionalId);
        return (
          <motion.button
            key={a.id}
            type="button"
            className={`ag-cartao-ag ${a.status}`}
            onClick={() => abrir(a.id)}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: Math.min(k, 8) * 0.025 }}
          >
            <span className="ag-cartao-ag-hora">
              <b>{a.inicio.slice(11)}</b>
              <small>{a.fim.slice(11)}</small>
            </span>
            <span className="pn-barra-cor" style={{ background: corDaPessoa(p?.cor ?? 0), width: 3 }} />
            <span className="ag-cartao-ag-info">
              <strong>{c?.nome}</strong>
              <small>{a.itens.map((x) => x.nome).join(" + ")}</small>
              <span className="ag-cartao-ag-pe">
                <Selo tom={STATUS[a.status].tom} icone={STATUS[a.status].icone}>
                  {STATUS[a.status].rotulo}
                </Selo>
                {!umaPessoa && <span style={{ fontSize: 12.5, color: "var(--c-texto-2)" }}>{primeiroNome(p?.nome ?? "")}</span>}
                {a.sinal && !a.sinal.pago && <Selo tom="atencao" icone="pix">Sinal</Selo>}
                {a.canal === "online" && <Icone nome="navegador" tamanho={14} rotulo="Marcado pelo link" />}
              </span>
            </span>
          </motion.button>
        );
      })}
    </div>
  );
}

/** Dia com uma coluna por profissional (desktop). */
function GradeDia({
  b,
  data,
  colunas,
  agendamentos,
  momento,
  onVago,
}: {
  b: Banco;
  data: string;
  colunas: Profissional[];
  agendamentos: Agendamento[];
  momento: string;
  onVago: (profissionalId: string, hora: string) => void;
}) {
  const { abrir } = usePainel();
  const { mudar } = useLoja();
  const confirmar = useConfirmar();
  const moldura = useRef<HTMLDivElement>(null);
  const { inicio, fim } = expedienteDoDia(b, data);
  const altura = (fim - inicio) * ESCALA;
  const agoraMin = momento.slice(0, 10) === data ? minDoDia(momento.slice(11)) : null;

  useEffect(() => {
    if (!moldura.current) return;
    const alvo = agoraMin !== null ? (agoraMin - inicio) * ESCALA - 120 : 0;
    moldura.current.scrollTo({ top: Math.max(0, alvo), behavior: "smooth" });
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  const horas: number[] = [];
  for (let m = inicio; m <= fim; m += 60) horas.push(m);

  return (
    <div className="ag-grade-moldura" ref={moldura}>
      <div className="ag-grade" style={{ gridTemplateColumns: `56px repeat(${colunas.length}, minmax(180px, 1fr))` }}>
        <div className="ag-canto" />
        {colunas.map((p) => {
          const meus = agendamentos.filter((a) => a.profissionalId === p.id && a.status !== "cancelado");
          return (
            <div key={p.id} className="ag-coluna-cabeca">
              <Avatar nome={p.nome} cor={p.cor} tamanho={30} foto={p.fotoUrl} />
              <div>
                <strong>{p.nome}</strong>
                <small>
                  {meus.length} atendimentos{janelasDoDia(b, p, data).length === 0 ? " · folga" : ""}
                </small>
              </div>
            </div>
          );
        })}

        <div className="ag-horas-col" style={{ height: altura, position: "relative" }}>
          {horas.map((m) => (
            <span key={m} className="ag-hora-rotulo" style={{ top: (m - inicio) * ESCALA }}>
              {m === inicio ? "" : horaDoMin(m)}
            </span>
          ))}
        </div>

        {colunas.map((p) => {
          const faixas = janelasDoDia(b, p, data);
          // áreas fora do expediente
          const fora: [number, number][] = [];
          let t = inicio;
          for (const f of faixas.map((x) => [minDoDia(x.inicio), minDoDia(x.fim)] as [number, number]).sort((a, c) => a[0] - c[0])) {
            if (f[0] > t) fora.push([t, f[0]]);
            t = Math.max(t, f[1]);
          }
          if (t < fim) fora.push([t, fim]);
          const vagos: number[] = [];
          for (const f of faixas) for (let m = Math.ceil(minDoDia(f.inicio) / 30) * 30; m + 30 <= minDoDia(f.fim); m += 30) vagos.push(m);
          const meus = agendamentos.filter((a) => a.profissionalId === p.id);
          const bloqueios = b.bloqueios.filter((x) => (x.profissionalId === p.id || !x.profissionalId) && x.inicio.slice(0, 10) === data);
          return (
            <div key={p.id} className="ag-coluna" style={{ height: altura, ["--pc" as string]: corDaPessoa(p.cor) }}>
              {horas.map((m) => (
                <span key={m} className="ag-linha-hora" style={{ top: (m - inicio) * ESCALA }} />
              ))}
              {horas.map((m) => (
                <span key={`m${m}`} className="ag-linha-meia" style={{ top: (m + 30 - inicio) * ESCALA }} />
              ))}
              {fora.map(([de, ate]) => (
                <span key={de} className="ag-fora" style={{ top: (de - inicio) * ESCALA, height: (ate - de) * ESCALA }} />
              ))}
              {vagos
                .filter((m) => agoraMin === null || m + 30 > agoraMin)
                .map((m) => (
                  <button
                    key={`v${m}`}
                    type="button"
                    className="ag-vago"
                    style={{ top: (m - inicio) * ESCALA + 1, height: 30 * ESCALA - 2 }}
                    onClick={() => onVago(p.id, horaDoMin(m))}
                    aria-label={`Agendar ${horaDoMin(m)} com ${p.nome}`}
                  >
                    <Icone nome="mais" tamanho={14} /> {horaDoMin(m)}
                  </button>
                ))}
              {bloqueios.map((bl) => {
                const de = Math.max(inicio, minDoDia(bl.inicio.slice(11)));
                const ate = Math.min(fim, minDoDia(bl.fim.slice(11)));
                return (
                  <button
                    key={bl.id}
                    type="button"
                    className="ag-bloqueio"
                    style={{ top: (de - inicio) * ESCALA + 1, height: (ate - de) * ESCALA - 2 }}
                    onClick={async () => {
                      const ok = await confirmar({ titulo: "Liberar este horário?", texto: `${bl.motivo || "Bloqueio"} · ${bl.inicio.slice(11)}–${bl.fim.slice(11)}`, confirmar: "Liberar" });
                      if (ok) mudar((x) => removerBloqueio(x, bl.id));
                    }}
                  >
                    <Icone nome="proibido" tamanho={14} />
                    {bl.motivo || "Bloqueado"}
                  </button>
                );
              })}
              {meus.map((a) => {
                const de = minDoDia(a.inicio.slice(11));
                const dur = difMin(a.inicio, a.fim);
                const h = Math.max(28, dur * ESCALA - 2);
                const c = b.clientes.find((x) => x.id === a.clienteId);
                const compacto = h < 46;
                return (
                  <button
                    key={a.id}
                    type="button"
                    className={`ag-bloco ${a.status}${compacto ? " compacto" : ""}`}
                    style={{ top: (de - inicio) * ESCALA + 1, height: h }}
                    onClick={() => abrir(a.id)}
                    title={`${a.inicio.slice(11)}–${a.fim.slice(11)} · ${c?.nome} · ${a.itens.map((i) => i.nome).join(" + ")}`}
                  >
                    {compacto ? (
                      <>
                        <span className="ag-bloco-hora">{a.inicio.slice(11)}</span>
                        <strong>{c?.nome}</strong>
                        {a.status === "pendente" && <Icone nome="ampulheta" tamanho={12} />}
                      </>
                    ) : (
                      <>
                        <span className="ag-bloco-hora">
                          {a.inicio.slice(11)}–{a.fim.slice(11)}
                          {a.status === "pendente" && <Icone nome="ampulheta" tamanho={12} />}
                          {a.status === "concluido" && <Icone nome="ok" tamanho={12} />}
                          {a.canal === "online" && <Icone nome="navegador" tamanho={12} />}
                        </span>
                        <strong>{c?.nome}</strong>
                        {h > 60 && <small>{a.itens.map((i) => i.nome).join(" + ")}</small>}
                      </>
                    )}
                  </button>
                );
              })}
              {agoraMin !== null && agoraMin >= inicio && agoraMin <= fim && <span className="ag-agora" style={{ top: (agoraMin - inicio) * ESCALA }} />}
            </div>
          );
        })}
        {agoraMin !== null && agoraMin >= inicio && agoraMin <= fim && (
          <span className="ag-agora-rotulo" style={{ position: "absolute", top: 50 + (agoraMin - inicio) * ESCALA }}>
            {momento.slice(11)}
          </span>
        )}
      </div>
    </div>
  );
}

function Semana({ b, data, hoje, filtro, onDia }: { b: Banco; data: string; hoje: string; filtro: (a: Agendamento) => boolean; onDia: (d: string) => void }) {
  const { abrir } = usePainel();
  const inicio = inicioDaSemana(data);
  const dias = Array.from({ length: 7 }, (_, i) => somarDias(inicio, i));
  return (
    <div className="ag-semana-grade">
      {dias.map((d) => {
        const lista = b.agendamentos.filter((a) => a.inicio.slice(0, 10) === d && filtro(a)).sort((a, c) => (a.inicio < c.inicio ? -1 : 1));
        const fechado = diaFechado(b, d);
        return (
          <div key={d} className={`ag-semana-col${d === hoje ? " hoje" : ""}`}>
            <header>
              <button type="button" onClick={() => onDia(d)} style={{ textAlign: "left" }}>
                <strong>{dataCurta(d)}</strong>
              </button>
              <span>{fechado ? "fechado" : lista.filter((a) => a.status !== "cancelado").length}</span>
            </header>
            <div className="ag-semana-itens">
              {lista.map((a) => {
                const c = b.clientes.find((x) => x.id === a.clienteId);
                const p = b.profissionais.find((x) => x.id === a.profissionalId);
                return (
                  <button key={a.id} type="button" className={`ag-semana-item ${a.status}`} style={{ ["--pc" as string]: corDaPessoa(p?.cor ?? 0) }} onClick={() => abrir(a.id)}>
                    <b>{a.inicio.slice(11)}</b>
                    <span>{c?.nome}</span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Dia avulso de atendimento: o negócio abre só nesta data (toda a equipe). */
function FolhaAbrirDia({ aberta, onFechar, data }: { aberta: boolean; onFechar: () => void; data: string }) {
  const { banco, mudar } = useLoja();
  const avisar = useAvisos();
  // sugere o último horário usado: quem abre um sábado por mês repete o mesmo
  const ultima = banco?.negocio.aberturas.slice().sort((a, c) => (a.data < c.data ? 1 : -1))[0];
  const [de, setDe] = useState(ultima?.inicio ?? "08:00");
  const [ate, setAte] = useState(ultima?.fim ?? "14:00");

  const salvar = () => {
    if (ate <= de) return avisar("O fim precisa ser depois do início.", "erro");
    mudar((b) => salvarNegocio(b, { aberturas: [...b.negocio.aberturas.filter((a) => a.data !== data), { data, inicio: de, fim: ate }] }));
    avisar("Dia aberto: as vagas já aparecem no site.");
    onFechar();
  };

  return (
    <Folha
      aberta={aberta}
      onFechar={onFechar}
      titulo="Abrir este dia"
      subtitulo={`${capitalizar(dataLonga(data))} — para quem não atende toda semana.`}
      rodape={
        <>
          <Botao variante="fantasma" onClick={onFechar}>
            Cancelar
          </Botao>
          <Botao variante="principal" onClick={salvar}>
            Abrir dia
          </Botao>
        </>
      }
    >
      <div className="ui-grade-campos duas" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <Campo rotulo="Das">
          <Entrada type="time" step={600} value={de} onChange={(e) => setDe(e.target.value)} />
        </Campo>
        <Campo rotulo="Até">
          <Entrada type="time" step={600} value={ate} onChange={(e) => setAte(e.target.value)} />
        </Campo>
      </div>
    </Folha>
  );
}

function FolhaBloqueio({ aberta, onFechar, data, equipe }: { aberta: boolean; onFechar: () => void; data: string; equipe: Profissional[] }) {
  const { mudar } = useLoja();
  const avisar = useAvisos();
  const [pro, setPro] = useState<string>("todos");
  const [dia, setDia] = useState(data);
  const [de, setDe] = useState("12:00");
  const [ate, setAte] = useState("13:00");
  const [diaTodo, setDiaTodo] = useState(false);
  const [motivo, setMotivo] = useState("");
  useEffect(() => setDia(data), [data, aberta]);

  const salvar = () => {
    const ini = juntar(dia, diaTodo ? "00:00" : de);
    const fim = juntar(dia, diaTodo ? "23:59" : ate);
    if (fim <= ini) return avisar("O fim precisa ser depois do início.", "erro");
    mudar((b) => salvarBloqueio(b, { id: novoId("bl"), profissionalId: pro === "todos" ? null : pro, inicio: ini, fim, motivo }));
    avisar("Horário bloqueado. Ninguém consegue marcar nele.");
    onFechar();
  };

  return (
    <Folha
      aberta={aberta}
      onFechar={onFechar}
      titulo="Bloquear horário"
      subtitulo="Folga, consulta, curso, manutenção — some do site na hora."
      rodape={
        <>
          <Botao variante="fantasma" onClick={onFechar}>
            Cancelar
          </Botao>
          <Botao variante="principal" onClick={salvar}>
            Bloquear
          </Botao>
        </>
      }
    >
      <div style={{ display: "grid", gap: 16 }}>
        {equipe.length > 1 && (
          <Campo rotulo="Quem">
            <select className="ui-entrada" value={pro} onChange={(e) => setPro(e.target.value)}>
              <option value="todos">O negócio inteiro</option>
              {equipe.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </Campo>
        )}
        <Campo rotulo="Dia">
          <Entrada type="date" value={dia} onChange={(e) => setDia(e.target.value)} />
        </Campo>
        <Interruptor ligado={diaTodo} onMudar={setDiaTodo} rotulo="O dia inteiro" mostrarRotulo />
        {!diaTodo && (
          <div className="ui-grade-campos duas" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <Campo rotulo="Das">
              <Entrada type="time" step={900} value={de} onChange={(e) => setDe(e.target.value)} />
            </Campo>
            <Campo rotulo="Até">
              <Entrada type="time" step={900} value={ate} onChange={(e) => setAte(e.target.value)} />
            </Campo>
          </div>
        )}
        <Campo rotulo="Motivo" opcional ajuda="Só a equipe vê.">
          <Entrada value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: dentista" />
        </Campo>
      </div>
    </Folha>
  );
}
