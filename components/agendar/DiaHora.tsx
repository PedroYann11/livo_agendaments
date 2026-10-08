"use client";

// =====================================================================
// Calendário do mês + horários do dia escolhido. É o jeito do CLIENTE
// escolher (agendar e remarcar): primeiro enxerga o mês inteiro, com os
// dias que têm vaga em destaque; depois do toque no dia, os horários
// aparecem logo abaixo. A regra de vaga é uma só — lib/disponibilidade.
//
// O painel continua com a faixa de dias (SeletorHorario), mais rápida para
// quem marca vários horários seguidos.
// =====================================================================

import { useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { Banco } from "@/lib/tipos";
import { horariosDisponiveis, type Vaga } from "@/lib/disponibilidade";
import { NOMES_MESES, dataLonga, diaDaSemana, fimDoMes, inicioDoMes, somarDias, somarMeses } from "@/lib/datas";
import { linkWhatsApp } from "@/lib/whatsapp";
import { Icone } from "@/components/ui/Icone";
import { capitalizar } from "@/components/vitrine/util";
import type { Escolha } from "./SeletorHorario";

const SEMANA = ["D", "S", "T", "Q", "Q", "S", "S"];
const SAIDA = [0.23, 1, 0.32, 1] as const;

export function DiaHora({
  banco,
  servicosIds,
  profissionalId,
  agora,
  data,
  hora,
  onData,
  onHora,
  ignorarAgendamentoId,
}: {
  banco: Banco;
  servicosIds: string[];
  profissionalId: string | null;
  agora: string;
  data: string | null;
  hora: string | null;
  onData: (d: string) => void;
  onHora: (e: Escolha) => void;
  ignorarAgendamentoId?: string;
}) {
  const hoje = agora.slice(0, 10);
  const janela = banco.negocio.regras.janelaMaxDias;
  const ultimo = somarDias(hoje, janela);

  const vagasPorDia = useMemo(() => {
    const r = new Map<string, Vaga[]>();
    for (let i = 0; i <= janela; i++) {
      const d = somarDias(hoje, i);
      r.set(d, horariosDisponiveis(banco, { servicosIds, profissionalId, agora, data: d, ignorarAgendamentoId }));
    }
    return r;
  }, [banco, servicosIds, profissionalId, agora, hoje, janela, ignorarAgendamentoId]);

  const primeiroLivre = [...vagasPorDia.entries()].find(([, v]) => v.length)?.[0] ?? null;
  const [mes, setMes] = useState(() => inicioDoMes(data ?? primeiroLivre ?? hoje));
  const [direcao, setDirecao] = useState(1);
  const horarios = useRef<HTMLDivElement>(null);

  const podeVoltar = mes > inicioDoMes(hoje);
  const podeAvancar = mes < inicioDoMes(ultimo);
  const trocarMes = (passo: number) => {
    setDirecao(passo);
    setMes((m) => somarMeses(m, passo));
  };

  const escolherDia = (d: string) => {
    onData(d);
    // no celular os horários ficam abaixo da dobra: leva o olho até eles
    setTimeout(() => horarios.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
  };

  if (!primeiroLivre) {
    const zap = banco.negocio.contato.whatsapp;
    return (
      <div className="ag-sem-vaga">
        <Icone nome="agendaX" tamanho={26} />
        <span>Sem horários livres nos próximos {janela} dias.</span>
        {zap && (
          <a className="ui-botao ui-botao-suave ui-botao-m" href={linkWhatsApp(zap, `Olá, ${banco.negocio.nome}! Queria marcar um horário.`)} target="_blank" rel="noopener noreferrer">
            <Icone nome="whatsapp" tamanho={18} /> Falar no WhatsApp
          </a>
        )}
      </div>
    );
  }

  const vazios = diaDaSemana(mes);
  const total = Number(fimDoMes(mes).slice(8));
  const dias = Array.from({ length: total }, (_, i) => somarDias(mes, i));
  const vagas = data ? vagasPorDia.get(data) ?? [] : [];

  return (
    <div>
      <div className="cal">
        <div className="cal-topo">
          <button type="button" className="ui-botao-icone" aria-label="Mês anterior" disabled={!podeVoltar} onClick={() => trocarMes(-1)}>
            <Icone nome="esquerda" />
          </button>
          <strong aria-live="polite">
            {capitalizar(NOMES_MESES[Number(mes.slice(5, 7)) - 1])} {mes.slice(0, 4)}
          </strong>
          <button type="button" className="ui-botao-icone" aria-label="Próximo mês" disabled={!podeAvancar} onClick={() => trocarMes(1)}>
            <Icone nome="direita" />
          </button>
        </div>
        <div className="cal-semana" aria-hidden="true">
          {SEMANA.map((d, i) => (
            <span key={i}>{d}</span>
          ))}
        </div>
        <AnimatePresence mode="wait" initial={false} custom={direcao}>
          <motion.div
            key={mes}
            className="cal-grade"
            role="grid"
            aria-label="Dias do mês"
            custom={direcao}
            variants={{ entra: (d: number) => ({ opacity: 0, x: d * 28 }), fica: { opacity: 1, x: 0 }, sai: (d: number) => ({ opacity: 0, x: d * -28 }) }}
            initial="entra"
            animate="fica"
            exit="sai"
            transition={{ duration: 0.22, ease: SAIDA }}
          >
            {Array.from({ length: vazios }, (_, i) => (
              <span key={`v${i}`} />
            ))}
            {dias.map((d) => {
              const qtd = vagasPorDia.get(d)?.length ?? 0;
              const ativo = d === data;
              return (
                <button
                  key={d}
                  type="button"
                  className={`cal-dia${qtd ? " livre" : ""}${ativo ? " ativo" : ""}${d === hoje ? " hoje" : ""}`}
                  disabled={!qtd}
                  aria-pressed={ativo}
                  aria-label={`${dataLonga(d)}: ${qtd ? `${qtd} horários livres` : "sem horários"}`}
                  onClick={() => escolherDia(d)}
                >
                  {ativo && <motion.span layoutId="cal-dia" className="cal-dia-fundo" transition={{ type: "spring", stiffness: 520, damping: 38 }} />}
                  {Number(d.slice(8))}
                </button>
              );
            })}
          </motion.div>
        </AnimatePresence>
        <p className="cal-legenda">
          <i /> dias com horário livre
        </p>
      </div>

      <div ref={horarios} className="cal-horarios">
        <AnimatePresence mode="wait" initial={false}>
          {data && vagas.length > 0 ? (
            <motion.div key={data} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.26, ease: SAIDA }}>
              <h2 className="cal-dia-titulo">{capitalizar(dataLonga(data))}</h2>
              <GradeHorarios vagas={vagas} hora={hora} onEscolher={(v) => onHora({ data, hora: v.hora, profissionalId: v.profissionalId })} />
            </motion.div>
          ) : (
            <motion.p key="dica" className="cal-dica" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              Toque num dia para ver os horários.
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

const PERIODOS = [
  { nome: "Manhã", filtro: (h: string) => h < "12:00" },
  { nome: "Tarde", filtro: (h: string) => h >= "12:00" && h < "18:00" },
  { nome: "Noite", filtro: (h: string) => h >= "18:00" },
];

/** Os horários livres de um dia, por período. Serve ao cliente e ao painel. */
export function GradeHorarios({ vagas, hora, onEscolher }: { vagas: Vaga[]; hora: string | null; onEscolher: (v: Vaga) => void }) {
  return (
    <>
      {PERIODOS.map((p) => {
        const lista = vagas.filter((v) => p.filtro(v.hora));
        if (!lista.length) return null;
        return (
          <div className="ag-periodo" key={p.nome}>
            <h4>
              <Icone nome="relogio" tamanho={15} />
              {p.nome}
              <span style={{ fontWeight: 450 }}>· {lista.length}</span>
            </h4>
            <div className="ag-horas">
              {lista.map((v) => {
                const ativo = v.hora === hora;
                return (
                  <button key={v.hora} type="button" className={`ag-hora${ativo ? " ativo" : ""}`} aria-pressed={ativo} onClick={() => onEscolher(v)}>
                    {ativo && <motion.span layoutId="ag-hora" className="ag-hora-fundo" transition={{ type: "spring", stiffness: 520, damping: 34 }} />}
                    {v.hora}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </>
  );
}
