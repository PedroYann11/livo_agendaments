"use client";

// Editor de horário semanal: um interruptor por dia e quantos intervalos
// quiser (manhã + tarde = intervalo de almoço, sem gambiarra).

import type { Semana } from "@/lib/tipos";
import { Interruptor, BotaoIcone, Botao } from "@/components/ui/basicos";
import { NOMES_DIAS } from "@/lib/datas";

const ORDEM = [1, 2, 3, 4, 5, 6, 0];

export function EditorSemana({ valor, onMudar }: { valor: Semana; onMudar: (s: Semana) => void }) {
  const mudarDia = (d: number, faixas: Semana[number]) => onMudar({ ...valor, [d]: faixas });
  return (
    <div className="pn-semana">
      {ORDEM.map((d) => {
        const faixas = valor[d] ?? [];
        const aberto = faixas.length > 0;
        return (
          <div key={d} className="pn-dia-linha">
            <label>
              <Interruptor
                ligado={aberto}
                rotulo={NOMES_DIAS[d]}
                onMudar={(v) => mudarDia(d, v ? [{ inicio: "09:00", fim: "18:00" }] : [])}
              />
              {NOMES_DIAS[d].replace("-feira", "").replace(/^./, (x) => x.toUpperCase())}
            </label>
            {aberto ? (
              <div className="pn-faixas">
                {faixas.map((f, i) => (
                  <div key={i} className="pn-faixa">
                    <input type="time" step={900} value={f.inicio} aria-label="Início" onChange={(e) => mudarDia(d, faixas.map((x, j) => (j === i ? { ...x, inicio: e.target.value } : x)))} />
                    <span>às</span>
                    <input type="time" step={900} value={f.fim} aria-label="Fim" onChange={(e) => mudarDia(d, faixas.map((x, j) => (j === i ? { ...x, fim: e.target.value } : x)))} />
                    {faixas.length > 1 ? (
                      <BotaoIcone icone="fechar" rotulo="Remover intervalo" tamanho={16} onClick={() => mudarDia(d, faixas.filter((_, j) => j !== i))} />
                    ) : (
                      <Botao
                        variante="fantasma"
                        tamanho="p"
                        icone="mais"
                        onClick={() => {
                          const ultimo = faixas.at(-1)!;
                          mudarDia(d, [{ inicio: ultimo.inicio, fim: "12:00" }, { inicio: "13:00", fim: ultimo.fim > "13:00" ? ultimo.fim : "18:00" }]);
                        }}
                      >
                        Almoço
                      </Botao>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <span className="pn-fechado">Fechado</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
