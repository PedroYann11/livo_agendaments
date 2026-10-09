"use client";

// =====================================================================
// As vagas de toda a janela de agendamento, dia a dia.
//
// Na página pública com banco, quem responde é o banco (`vagas_publicas`):
// a mesma conta que valida a gravação. No painel e no modo local, o motor
// do navegador (lib/disponibilidade) sobre o Banco completo — as duas
// contas são conferidas uma contra a outra em supabase/tests/paridade.
// =====================================================================

import { useEffect, useMemo, useState } from "react";
import { horariosDisponiveis, type Vaga } from "../disponibilidade";
import { somarDias } from "../datas";
import { useLoja } from "./loja";
import { vagasDaJanela } from "./remoto";

export type PedidoVagas = {
  servicosIds: string[];
  profissionalId: string | null;
  /** remarcação: o próprio horário não conta como ocupado */
  remarcando?: { id: string; token: string };
};

export type Vagas = {
  /** null = ainda perguntando */
  porDia: Map<string, Vaga[]> | null;
  erro: boolean;
  tentarDeNovo: () => void;
};

export function useVagas(p: PedidoVagas): Vagas {
  const { banco, agora, remoto, modo, slug } = useLoja();
  const peloBanco = remoto && modo === "publico";
  const chave = JSON.stringify([slug, p.servicosIds, p.profissionalId, p.remarcando?.token ?? null]);
  const [tentativa, setTentativa] = useState(0);
  const [resposta, setResposta] = useState<{ chave: string; porDia: Map<string, Vaga[]> | null; erro: boolean } | null>(null);

  const local = useMemo(() => {
    if (peloBanco || !banco) return null;
    const r = new Map<string, Vaga[]>();
    if (!p.servicosIds.length) return r;
    const momento = agora();
    const hoje = momento.slice(0, 10);
    for (let i = 0; i <= banco.negocio.regras.janelaMaxDias; i++) {
      const data = somarDias(hoje, i);
      const v = horariosDisponiveis(banco, {
        servicosIds: p.servicosIds,
        profissionalId: p.profissionalId,
        agora: momento,
        data,
        ignorarAgendamentoId: p.remarcando?.id,
      });
      if (v.length) r.set(data, v);
    }
    return r;
    // a chave já resume o pedido
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peloBanco, banco, chave, agora]);

  useEffect(() => {
    if (!peloBanco) return;
    if (!p.servicosIds.length) {
      setResposta({ chave, porDia: new Map(), erro: false });
      return;
    }
    let vivo = true;
    vagasDaJanela(slug, p.servicosIds, p.profissionalId, p.remarcando?.token)
      .then((porDia) => vivo && setResposta({ chave, porDia, erro: false }))
      .catch(() => vivo && setResposta({ chave, porDia: null, erro: true }));
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peloBanco, chave, tentativa]);

  if (!peloBanco) return { porDia: local, erro: false, tentarDeNovo: () => {} };
  const atual = resposta?.chave === chave ? resposta : null;
  return { porDia: atual?.porDia ?? null, erro: !!atual?.erro, tentarDeNovo: () => setTentativa((t) => t + 1) };
}
