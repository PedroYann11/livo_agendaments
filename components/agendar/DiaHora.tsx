"use client";

// =====================================================================
// Calendário do mês + horários do dia escolhido. É o jeito do CLIENTE
// escolher (agendar e remarcar): primeiro enxerga o mês inteiro, com os
// dias que têm vaga em destaque; depois do toque no dia, os horários
// aparecem logo abaixo. A regra de vaga é uma só — lib/disponibilidade.
//
// O painel continua com a faixa de dias (SeletorHorario), mais rápida para
// quem marca vários horários seguidos — com o mesmo calendário (Mes) a um toque.
// =====================================================================

import { useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { Banco } from "@/lib/tipos";
import type { Vaga } from "@/lib/disponibilidade";
import { useVagas, type PedidoVagas } from "@/lib/dados/vagas";
import { Botao, Esqueleto } from "@/components/ui/basicos";
import { dataLonga, somarDias } from "@/lib/datas";
import { linkWhatsApp } from "@/lib/whatsapp";
import { Icone } from "@/components/ui/Icone";
import { capitalizar } from "@/components/vitrine/util";
import type { Escolha } from "./SeletorHorario";
import { Mes } from "./Mes";

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
  remarcando,
}: {
  banco: Banco;
  servicosIds: string[];
  profissionalId: string | null;
  agora: string;
  data: string | null;
  hora: string | null;
  onData: (d: string) => void;
  onHora: (e: Escolha) => void;
  remarcando?: PedidoVagas["remarcando"];
}) {
  const { porDia, erro, tentarDeNovo } = useVagas({ servicosIds, profissionalId, remarcando });
  const janela = banco.negocio.regras.janelaMaxDias;

  if (erro) {
    return (
      <div className="ag-sem-vaga">
        <Icone nome="info" tamanho={26} />
        <span>Não conseguimos carregar os horários agora.</span>
        <Botao variante="suave" onClick={tentarDeNovo}>
          Tentar de novo
        </Botao>
      </div>
    );
  }
  if (!porDia) {
    return (
      <div className="cal" aria-busy="true" style={{ display: "grid", gap: 12, marginTop: 16 }}>
        <Esqueleto altura={28} largura="50%" />
        <Esqueleto altura={250} raio={16} />
      </div>
    );
  }
  const primeiroLivre = [...porDia.keys()].sort()[0] ?? null;
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
  return <Calendario vagasPorDia={porDia} primeiroLivre={primeiroLivre} janela={janela} agora={agora} data={data} hora={hora} onData={onData} onHora={onHora} />;
}

function Calendario({
  vagasPorDia,
  primeiroLivre,
  janela,
  agora,
  data,
  hora,
  onData,
  onHora,
}: {
  vagasPorDia: Map<string, Vaga[]>;
  primeiroLivre: string;
  janela: number;
  agora: string;
  data: string | null;
  hora: string | null;
  onData: (d: string) => void;
  onHora: (e: Escolha) => void;
}) {
  const hoje = agora.slice(0, 10);
  const horarios = useRef<HTMLDivElement>(null);

  const escolherDia = (d: string) => {
    onData(d);
    // no celular os horários ficam abaixo da dobra: leva o olho até eles
    setTimeout(() => horarios.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
  };

  const vagas = data ? vagasPorDia.get(data) ?? [] : [];

  return (
    <div>
      <div style={{ marginTop: 16 }}>
        <Mes
          inicial={data ?? primeiroLivre}
          data={data}
          hoje={hoje}
          min={hoje}
          max={somarDias(hoje, janela)}
          legenda="dias com horário livre"
          onDia={escolherDia}
          sobre={(d) => {
            const qtd = vagasPorDia.get(d)?.length ?? 0;
            return { livre: qtd > 0, destaque: qtd > 0, rotulo: `${dataLonga(d)}: ${qtd ? `${qtd} horários livres` : "sem horários"}` };
          }}
        />
      </div>

      <div ref={horarios} className="cal-horarios">
        <AnimatePresence mode="wait" initial={false}>
          {data && vagas.length > 0 ? (
            <motion.div key={data} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.26, ease: SAIDA }}>
              <h2 className="cal-dia-titulo">{capitalizar(dataLonga(data))}</h2>
              <GradeHorarios vagas={vagas} hora={hora} onEscolher={(v) => onHora({ data, hora: v.hora, profissionalId: v.profissionalId })} />
            </motion.div>
          ) : null}
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
