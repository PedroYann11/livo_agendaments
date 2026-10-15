"use client";

// =====================================================================
// "Concluir o dia": no fim de um dia cheio (a DepiLED atende 15–20
// clientes num sábado), fechar uma por uma cansa — e o que não é
// concluído não entra no faturamento, no Financeiro nem na ficha da
// cliente. Aqui é de uma vez: cada cliente com a forma de pagamento (ou
// "Faltou"), e um atalho para mudar todas juntas.
// =====================================================================

import { useState } from "react";
import { useLoja } from "@/lib/dados/loja";
import { Icone } from "@/components/ui/Icone";
import { Botao } from "@/components/ui/basicos";
import { Folha } from "@/components/ui/Folha";
import { useAvisos } from "@/components/ui/Avisos";
import { FORMAS } from "./DetalheAgendamento";
import { concluirDia, valorAReceber } from "@/lib/dados/acoes";
import type { Agendamento, Banco, FormaPagamento } from "@/lib/tipos";
import { dataLonga, horaDe } from "@/lib/datas";
import { brl } from "@/lib/formato";
import { capitalizar } from "@/components/vitrine/util";

type Escolha = FormaPagamento | "faltou";

/** Os horários do dia que já terminaram e ainda esperam ser concluídos. */
export function emAbertoNoDia(doDia: Agendamento[], momento: string): Agendamento[] {
  return doDia.filter((a) => (a.status === "confirmado" || a.status === "pendente") && a.fim <= momento);
}

export function FaixaConcluirDia({ quantos, onAbrir }: { quantos: number; onAbrir: () => void }) {
  return (
    <div className="cd-faixa">
      <Icone nome="okCirculo" tamanho={20} />
      <span>
        {quantos === 1 ? "1 atendimento já passou e ainda não foi concluído." : `${quantos} atendimentos já passaram e ainda não foram concluídos.`}
      </span>
      <Botao variante="principal" tamanho="p" onClick={onAbrir}>
        Concluir o dia
      </Botao>
    </div>
  );
}

export function FolhaConcluirDia({ b, data, ags, onFechar }: { b: Banco; data: string; ags: Agendamento[]; onFechar: () => void }) {
  const { mudar, agora } = useLoja();
  const avisar = useAvisos();
  const formaPadrao = (a: Agendamento, f: FormaPagamento): Escolha => (a.pacoteClienteId ? "pacote" : f);
  const [todas, setTodas] = useState<FormaPagamento>("pix");
  const [escolhas, setEscolhas] = useState<Record<string, Escolha>>(() => Object.fromEntries(ags.map((a) => [a.id, formaPadrao(a, "pix")])));

  const mudarTodas = (f: FormaPagamento) => {
    setTodas(f);
    // quem foi marcada como falta continua falta; o resto passa para a forma nova
    setEscolhas((e) => Object.fromEntries(ags.map((a) => [a.id, e[a.id] === "faltou" ? "faltou" : formaPadrao(a, f)])));
  };

  const vieram = ags.filter((a) => escolhas[a.id] !== "faltou");
  const total = vieram.reduce((s, a) => s + valorAReceber(a), 0);
  const faltas = ags.length - vieram.length;

  const concluir = () => {
    mudar((x) => concluirDia(x, ags.map((a) => ({ id: a.id, forma: escolhas[a.id] })), agora()));
    avisar(
      `Dia concluído · ${vieram.length} ${vieram.length === 1 ? "atendimento" : "atendimentos"} · ${brl(total)}${faltas ? ` · ${faltas} ${faltas === 1 ? "falta" : "faltas"}` : ""}`,
    );
    onFechar();
  };

  return (
    <Folha
      aberta
      onFechar={onFechar}
      titulo="Concluir o dia"
      subtitulo={capitalizar(dataLonga(data))}
      largura={520}
      rodape={
        <>
          <Botao variante="fantasma" onClick={onFechar}>
            Voltar
          </Botao>
          <Botao variante="principal" icone="okCirculo" onClick={concluir} disabled={!ags.length}>
            Concluir {vieram.length} · {brl(total)}
          </Botao>
        </>
      }
    >
      <div style={{ display: "grid", gap: 18 }}>
        {/* botões não podem ficar dentro de <label>: o primeiro herdaria o texto do rótulo */}
        <div className="ui-campo">
          <span className="ui-campo-rotulo" id="cd-todas">
            Todas pagaram com
          </span>
          <div className="dt-formas" role="group" aria-labelledby="cd-todas">
            {FORMAS.filter((f) => f.id !== "pacote").map((f) => (
              <button key={f.id} type="button" className="dt-forma" aria-pressed={todas === f.id} onClick={() => mudarTodas(f.id)}>
                <Icone nome={f.icone} tamanho={18} />
                {f.rotulo}
              </button>
            ))}
          </div>
          <span className="ui-campo-ajuda">Depois, ajuste só quem foi diferente — ou marque quem faltou.</span>
        </div>

        <div className="cd-lista">
          {ags.map((a) => {
            const c = b.clientes.find((x) => x.id === a.clienteId);
            const faltou = escolhas[a.id] === "faltou";
            return (
              <div key={a.id} className={`cd-linha${faltou ? " faltou" : ""}`}>
                <span className="pn-hora">{horaDe(a.inicio)}</span>
                <span className="cd-info">
                  <strong>{c?.nome ?? "Cliente"}</strong>
                  <small>
                    {a.itens.map((i) => i.nome).join(" + ")} · {a.pacoteClienteId ? "pacote" : brl(valorAReceber(a))}
                  </small>
                </span>
                <select
                  className="ui-entrada"
                  aria-label={`${c?.nome ?? "Cliente"}: como pagou`}
                  value={escolhas[a.id]}
                  onChange={(e) => setEscolhas((x) => ({ ...x, [a.id]: e.target.value as Escolha }))}
                >
                  {FORMAS.filter((f) => f.id !== "pacote" || a.pacoteClienteId).map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.rotulo}
                    </option>
                  ))}
                  <option value="faltou">Faltou</option>
                </select>
              </div>
            );
          })}
        </div>
      </div>
    </Folha>
  );
}
