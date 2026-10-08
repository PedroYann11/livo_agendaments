"use client";

// =====================================================================
// Faixa de dias + horários livres — o jeito do PAINEL escolher (novo
// agendamento, encaixe, remarcar). O cliente usa o calendário do mês
// (DiaHora). A regra de vaga é uma só — lib/disponibilidade.
// =====================================================================

import { useEffect, useMemo, useRef } from "react";
import { motion } from "motion/react";
import type { Banco } from "@/lib/tipos";
import { horariosDisponiveis, diaFechado, type Vaga } from "@/lib/disponibilidade";
import { NOMES_DIAS_CURTOS, NOMES_MESES, dataCurta, diaDaSemana, somarDias } from "@/lib/datas";
import { Icone } from "@/components/ui/Icone";
import { Botao } from "@/components/ui/basicos";
import { GradeHorarios } from "./DiaHora";

export type Escolha = { data: string; hora: string; profissionalId: string };

export function SeletorHorario({
  banco,
  servicosIds,
  profissionalId,
  agora,
  data,
  hora,
  onData,
  onHora,
  ignorarAgendamentoId,
  encaixe = false,
  dias: totalDias,
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
  encaixe?: boolean;
  dias?: number;
}) {
  const hoje = agora.slice(0, 10);
  const quantos = totalDias ?? Math.min(45, banco.negocio.regras.janelaMaxDias + 1);
  const dias = useMemo(() => Array.from({ length: quantos }, (_, i) => somarDias(hoje, i)), [hoje, quantos]);
  const base = useMemo(
    () => ({ servicosIds, profissionalId, agora, ignorarAgendamentoId, ignorarRegras: encaixe }),
    [servicosIds, profissionalId, agora, ignorarAgendamentoId, encaixe],
  );

  const vagasPorDia = useMemo(() => {
    const r: Record<string, Vaga[]> = {};
    for (const d of dias) r[d] = horariosDisponiveis(banco, { ...base, data: d });
    return r;
  }, [banco, base, dias]);

  // escolhe sozinho o primeiro dia com vaga
  useEffect(() => {
    if (data && vagasPorDia[data]?.length) return;
    if (data && !vagasPorDia[data]) return;
    const primeiro = dias.find((d) => vagasPorDia[d]?.length);
    if (primeiro && !data) onData(primeiro);
  }, [data, dias, vagasPorDia, onData]);

  const faixa = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!data) return;
    const el = faixa.current?.querySelector<HTMLElement>(`[data-dia="${data}"]`);
    el?.scrollIntoView({ behavior: "smooth", inline: "nearest", block: "nearest" });
  }, [data]);

  const vagas = data ? vagasPorDia[data] ?? [] : [];
  const proximoComVaga = data ? dias.find((d) => d > data && vagasPorDia[d]?.length) : null;
  const fechado = data ? diaFechado(banco, data) : null;
  const mesVisivel = data ?? hoje;

  return (
    <div>
      <div className="ag-mes">
        <strong>
          {NOMES_MESES[Number(mesVisivel.slice(5, 7)) - 1]} {mesVisivel.slice(0, 4)}
        </strong>
      </div>
      <div className="ag-dias" ref={faixa} role="listbox" aria-label="Dias">
        {dias.map((d) => {
          const qtd = vagasPorDia[d]?.length ?? 0;
          const ativo = d === data;
          return (
            <button
              key={d}
              type="button"
              data-dia={d}
              role="option"
              aria-selected={ativo}
              className={`ag-dia${ativo ? " ativo" : ""}`}
              disabled={!qtd && !ativo}
              onClick={() => onData(d)}
              aria-label={`${dataCurta(d)}: ${qtd ? `${qtd} horários` : "sem horários"}`}
            >
              {ativo && <motion.span layoutId="ag-dia" className="ag-dia-fundo" transition={{ type: "spring", stiffness: 480, damping: 38 }} />}
              <small>{d === hoje ? "hoje" : NOMES_DIAS_CURTOS[diaDaSemana(d)]}</small>
              <b>{Number(d.slice(8))}</b>
              <i />
            </button>
          );
        })}
      </div>

      <div style={{ marginTop: 14 }}>
        {data && vagas.length === 0 ? (
          <div className="ag-sem-vaga">
            <Icone nome="agendaX" tamanho={26} />
            <span>{fechado ? `Fechado: ${fechado}.` : "Nenhum horário livre neste dia."}</span>
            {proximoComVaga && (
              <Botao variante="suave" iconeDepois="avancar" onClick={() => onData(proximoComVaga)}>
                Próximo dia com vaga: {dataCurta(proximoComVaga)}
              </Botao>
            )}
          </div>
        ) : (
          <motion.div key={data} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1] }}>
            <GradeHorarios vagas={vagas} hora={hora} onEscolher={(v) => data && onHora({ data, hora: v.hora, profissionalId: v.profissionalId })} />
          </motion.div>
        )}
      </div>
    </div>
  );
}
