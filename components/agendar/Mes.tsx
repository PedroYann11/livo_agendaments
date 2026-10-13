"use client";

// =====================================================================
// Calendário de um mês, para escolher um dia com um toque. Serve a três
// lugares, com a mesma cara:
//   - cliente (DiaHora): os dias com horário livre em destaque;
//   - painel › Novo agendamento / remarcar: idem, para pular a faixa;
//   - painel › Agenda: qualquer dia, com os dias de atendimento em
//     destaque e um ponto nos que têm agendamento — para ir direto a
//     uma data distante.
// Quem usa decide, dia a dia, se o dia pode ser tocado e se fica em
// destaque (`sobre`).
// =====================================================================

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { NOMES_MESES, diaDaSemana, fimDoMes, inicioDoMes, somarDias, somarMeses } from "@/lib/datas";
import { Icone } from "@/components/ui/Icone";
import { capitalizar } from "@/components/vitrine/util";

const SEMANA = ["D", "S", "T", "Q", "Q", "S", "S"];
const SAIDA = [0.23, 1, 0.32, 1] as const;

export type SobreODia = {
  /** pode ser tocado */
  livre: boolean;
  /** em destaque (tem horário livre / tem agendamento) */
  destaque: boolean;
  /** o que o leitor de tela diz do dia */
  rotulo: string;
  /** um ponto embaixo do número (Agenda: tem agendamento) */
  ponto?: boolean;
};

export function Mes({
  inicial,
  data,
  hoje,
  min,
  max,
  sobre,
  onDia,
  legenda,
}: {
  /** o mês que abre (qualquer dia dele) */
  inicial: string;
  data: string | null;
  hoje: string;
  /** até onde dá para ir (meses fora ficam com a seta apagada) */
  min?: string;
  max?: string;
  sobre: (d: string) => SobreODia;
  onDia: (d: string) => void;
  legenda?: string;
}) {
  const [mes, setMes] = useState(() => inicioDoMes(inicial));
  const [direcao, setDirecao] = useState(1);
  const podeVoltar = !min || mes > inicioDoMes(min);
  const podeAvancar = !max || mes < inicioDoMes(max);
  const trocarMes = (passo: number) => {
    setDirecao(passo);
    setMes((m) => somarMeses(m, passo));
  };
  const vazios = diaDaSemana(mes);
  const total = Number(fimDoMes(mes).slice(8));
  const dias = Array.from({ length: total }, (_, i) => somarDias(mes, i));

  return (
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
            const s = sobre(d);
            const ativo = d === data;
            return (
              <button
                key={d}
                type="button"
                className={`cal-dia${s.destaque ? " livre" : ""}${ativo ? " ativo" : ""}${d === hoje ? " hoje" : ""}`}
                disabled={!s.livre && !ativo}
                aria-pressed={ativo}
                aria-label={s.rotulo}
                onClick={() => onDia(d)}
              >
                {ativo && <motion.span layoutId="cal-dia" className="cal-dia-fundo" transition={{ type: "spring", stiffness: 520, damping: 38 }} />}
                {Number(d.slice(8))}
                {s.ponto && <i className="cal-ponto" aria-hidden="true" />}
              </button>
            );
          })}
        </motion.div>
      </AnimatePresence>
      {legenda && (
        <p className="cal-legenda">
          <i /> {legenda}
        </p>
      )}
    </div>
  );
}
