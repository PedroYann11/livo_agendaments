"use client";

// =====================================================================
// Gráficos do painel — SVG próprio, sem biblioteca.
//
// Regras da skill de visualização de dados aplicadas aqui:
//   · barras ≤ 24px, ponta de 4px arredondada, base reta;
//   · grade de 1px, sólida, recessiva; um eixo só;
//   · texto nunca na cor da série; legenda sempre que há 2+ séries;
//   · dica ao passar o mouse/dedo em toda marca;
//   · cor segue a entidade (profissional = mesma cor em todo lugar).
// =====================================================================

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { motion } from "motion/react";
import { SEQUENCIAL } from "@/lib/paleta";

function useLargura<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

function passoBonito(max: number): number {
  if (max <= 0) return 1;
  const bruto = max / 4;
  const pot = 10 ** Math.floor(Math.log10(bruto));
  const n = bruto / pot;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * pot;
}

type Dica = { x: number; y: number; conteudo: ReactNode } | null;

export type Coluna = { rotulo: string; dica: string; valores: { valor: number; cor: string; nome: string }[] };

/** Colunas por período (empilhadas quando há mais de uma série). */
export function Colunas({
  dados,
  altura = 220,
  formatar,
  rotuloACada = 1,
}: {
  dados: Coluna[];
  altura?: number;
  formatar: (n: number) => string;
  rotuloACada?: number;
}) {
  const [ref, w] = useLargura<HTMLDivElement>();
  const [dica, setDica] = useState<Dica>(null);
  const esq = 44;
  const base = altura - 24;
  const max = Math.max(1, ...dados.map((d) => d.valores.reduce((s, v) => s + v.valor, 0)));
  const passo = passoBonito(max);
  const topo = Math.ceil(max / passo) * passo;
  const banda = dados.length ? (w - esq) / dados.length : 0;
  const larg = Math.max(3, Math.min(24, banda * 0.62));
  const y = (v: number) => base - (v / topo) * (base - 8);
  const ticks = Array.from({ length: Math.round(topo / passo) + 1 }, (_, i) => i * passo);

  return (
    <div ref={ref} style={{ position: "relative" }} onPointerLeave={() => setDica(null)}>
      {w > 0 && (
        <svg className="gf" width={w} height={altura} role="img" aria-label="Gráfico de colunas">
          {ticks.map((t) => (
            <g key={t}>
              <line className="gf-grade" x1={esq} x2={w} y1={y(t)} y2={y(t)} />
              <text x={esq - 8} y={y(t) + 4} textAnchor="end">
                {formatar(t)}
              </text>
            </g>
          ))}
          {dados.map((d, i) => {
            const cx = esq + banda * i + banda / 2;
            let acumulado = 0;
            return (
              <g key={i}>
                <rect
                  x={esq + banda * i}
                  y={0}
                  width={banda}
                  height={base}
                  fill="transparent"
                  onPointerEnter={() =>
                    setDica({
                      x: cx,
                      y: y(d.valores.reduce((s, v) => s + v.valor, 0)),
                      conteudo: (
                        <>
                          <small>{d.dica}</small>
                          {d.valores
                            .filter((v) => v.valor > 0)
                            .map((v) => (
                              <div key={v.nome}>
                                {d.valores.length > 1 && <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: v.cor, marginRight: 6 }} />}
                                {d.valores.length > 1 ? `${v.nome}: ` : ""}
                                <b>{formatar(v.valor)}</b>
                              </div>
                            ))}
                        </>
                      ),
                    })
                  }
                />
                {d.valores.map((v, j) => {
                  if (v.valor <= 0) return null;
                  const y0 = y(acumulado);
                  acumulado += v.valor;
                  const y1 = y(acumulado);
                  const h = Math.max(1, y0 - y1 - (j > 0 ? 2 : 0));
                  const ultimo = d.valores.slice(j + 1).every((x) => x.valor <= 0);
                  const r = ultimo ? Math.min(4, larg / 2, h) : 0;
                  return (
                    <path
                      key={v.nome}
                      className="gf-col"
                      d={`M${cx - larg / 2},${y1 + h} V${y1 + r} Q${cx - larg / 2},${y1} ${cx - larg / 2 + r},${y1} H${cx + larg / 2 - r} Q${cx + larg / 2},${y1} ${cx + larg / 2},${y1 + r} V${y1 + h} Z`}
                      fill={v.cor}
                      style={{ animationDelay: `${Math.min(i * 12, 400)}ms` }}
                    />
                  );
                })}
                {i % rotuloACada === 0 && (
                  <text x={cx} y={altura - 6} textAnchor="middle">
                    {d.rotulo}
                  </text>
                )}
              </g>
            );
          })}
          <line x1={esq} x2={w} y1={base} y2={base} stroke="#d9d7d0" />
        </svg>
      )}
      {dica && (
        <div className="gf-dica" style={{ left: dica.x, top: dica.y }}>
          {dica.conteudo}
        </div>
      )}
    </div>
  );
}

/** Ranking em barras horizontais. Rótulo à esquerda, valor na ponta. */
export function BarrasH({
  dados,
  formatar,
}: {
  dados: { rotulo: string; valor: number; cor: string; detalhe?: string }[];
  formatar: (n: number) => string;
}) {
  const max = Math.max(1, ...dados.map((d) => d.valor));
  return (
    <div className="gf-barras-h">
      {dados.map((d, i) => (
        <div key={d.rotulo} className="gf-barra-h" title={d.detalhe}>
          <span>{d.rotulo}</span>
          <b>{formatar(d.valor)}</b>
          <div className="gf-barra-h-trilho">
            <motion.div
              className="gf-barra-h-cheio"
              style={{ background: d.cor, width: `${(d.valor / max) * 100}%` }}
              initial={{ scaleX: 0 }}
              whileInView={{ scaleX: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: i * 0.04, ease: [0.23, 1, 0.32, 1] }}
            />
          </div>
          {d.detalhe && <small style={{ gridColumn: "1 / -1", color: "var(--c-texto-3)", fontSize: 12, marginTop: -2 }}>{d.detalhe}</small>}
        </div>
      ))}
    </div>
  );
}

/** Dia da semana × hora. Sequencial de um tom só: claro = vazio, escuro = cheio. */
export function MapaCalor({ dias, horas, valores }: { dias: string[]; horas: number[]; valores: number[][] }) {
  const max = Math.max(1, ...valores.flat());
  const [dica, setDica] = useState<string | null>(null);
  return (
    <div>
      <div className="gf-calor" style={{ gridTemplateColumns: `34px repeat(${horas.length}, minmax(0, 1fr))` }} onPointerLeave={() => setDica(null)}>
        <span />
        {horas.map((h) => (
          <span key={h} style={{ textAlign: "center" }}>
            {h % 2 === 0 ? `${h}h` : ""}
          </span>
        ))}
        {dias.map((d, i) => (
          <div key={d} style={{ display: "contents" }}>
            <span style={{ alignSelf: "center" }}>{d}</span>
            {horas.map((h, j) => {
              const v = valores[i][j];
              const nivel = v === 0 ? 0 : Math.min(SEQUENCIAL.length - 1, 1 + Math.floor((v / max) * (SEQUENCIAL.length - 2)));
              return (
                <span
                  key={h}
                  className="gf-calor-celula"
                  style={{ background: v === 0 ? "#f1efea" : SEQUENCIAL[nivel] }}
                  onPointerEnter={() => setDica(`${d}, ${h}h: ${v} atendimento${v === 1 ? "" : "s"}`)}
                  title={`${d}, ${h}h: ${v}`}
                />
              );
            })}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12, gap: 12, flexWrap: "wrap" }}>
        <small style={{ color: "var(--c-texto-2)", minHeight: 18 }}>{dica ?? "Passe o dedo sobre um quadrado"}</small>
        <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--c-texto-3)" }}>
          vazio
          {SEQUENCIAL.slice(1).map((c) => (
            <i key={c} style={{ width: 14, height: 10, borderRadius: 2, background: c, display: "inline-block" }} />
          ))}
          cheio
        </span>
      </div>
    </div>
  );
}

/** Barra 100% empilhada, com legenda e valores — para partes de um todo. */
export function Pilha({ partes, formatar }: { partes: { nome: string; valor: number; cor: string }[]; formatar: (n: number) => string }) {
  const total = partes.reduce((s, p) => s + p.valor, 0) || 1;
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div className="gf-pilha" role="img" aria-label={partes.map((p) => `${p.nome} ${Math.round((p.valor / total) * 100)}%`).join(", ")}>
        {partes
          .filter((p) => p.valor > 0)
          .map((p, i) => (
            <motion.span
              key={p.nome}
              style={{ background: p.cor, width: `${(p.valor / total) * 100}%` }}
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08 }}
              title={`${p.nome}: ${formatar(p.valor)}`}
            />
          ))}
      </div>
      <div className="gf-legenda" style={{ display: "grid", gap: 6 }}>
        {partes.map((p) => (
          <span key={p.nome} style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <i style={{ background: p.cor }} />
              {p.nome}
            </span>
            <span style={{ color: "var(--c-texto)", fontVariantNumeric: "tabular-nums" }}>
              {formatar(p.valor)} <span style={{ color: "var(--c-texto-3)" }}>· {Math.round((p.valor / total) * 100)}%</span>
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

/** Linha acumulada do mês contra a meta (linha de referência fina). */
export function Acumulado({
  pontos,
  meta,
  formatar,
  cor,
}: {
  pontos: { rotulo: string; valor: number | null }[];
  meta: number;
  formatar: (n: number) => string;
  cor: string;
}) {
  const [ref, w] = useLargura<HTMLDivElement>();
  const [dica, setDica] = useState<Dica>(null);
  const altura = 200;
  const esq = 48;
  const base = altura - 22;
  const validos = pontos.filter((p) => p.valor !== null) as { rotulo: string; valor: number }[];
  const max = Math.max(meta, ...validos.map((p) => p.valor), 1);
  const passo = passoBonito(max);
  const topo = Math.ceil(max / passo) * passo;
  const x = (i: number) => esq + (pontos.length > 1 ? (i / (pontos.length - 1)) * (w - esq - 8) : 0);
  const y = (v: number) => base - (v / topo) * (base - 10);
  const linha = validos.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.valor)}`).join(" ");
  const area = validos.length ? `${linha} L${x(validos.length - 1)},${base} L${x(0)},${base} Z` : "";
  const ticks = Array.from({ length: Math.round(topo / passo) + 1 }, (_, i) => i * passo);
  const ultimo = validos.at(-1);

  return (
    <div ref={ref} style={{ position: "relative" }} onPointerLeave={() => setDica(null)}>
      {w > 0 && (
        <svg
          className="gf"
          width={w}
          height={altura}
          onPointerMove={(e) => {
            const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
            const i = Math.round(((e.clientX - r.left - esq) / (w - esq - 8)) * (pontos.length - 1));
            const p = validos[Math.max(0, Math.min(validos.length - 1, i))];
            if (p) setDica({ x: x(validos.indexOf(p)), y: y(p.valor), conteudo: <><small>até {p.rotulo}</small><b>{formatar(p.valor)}</b></> });
          }}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line className="gf-grade" x1={esq} x2={w} y1={y(t)} y2={y(t)} />
              <text x={esq - 8} y={y(t) + 4} textAnchor="end">
                {formatar(t)}
              </text>
            </g>
          ))}
          {meta > 0 && (
            <g>
              <line x1={esq} x2={w} y1={y(meta)} y2={y(meta)} stroke="#17171a" strokeWidth={1} />
              <text x={w - 4} y={y(meta) - 6} textAnchor="end" style={{ fill: "var(--c-texto)", fontWeight: 600 }}>
                meta {formatar(meta)}
              </text>
            </g>
          )}
          <path d={area} fill={cor} className="gf-area" />
          <path d={linha} pathLength={1} fill="none" stroke={cor} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" className="gf-traco" />
          {ultimo && <circle cx={x(validos.length - 1)} cy={y(ultimo.valor)} r={4.5} fill={cor} stroke="#fff" strokeWidth={2} />}
          {pontos.map((p, i) =>
            i % Math.ceil(pontos.length / 6) === 0 ? (
              <text key={i} x={x(i)} y={altura - 4} textAnchor="middle">
                {p.rotulo}
              </text>
            ) : null,
          )}
          {dica && <line x1={dica.x} x2={dica.x} y1={8} y2={base} stroke="#c9c7c0" />}
        </svg>
      )}
      {dica && (
        <div className="gf-dica" style={{ left: dica.x, top: dica.y }}>
          {dica.conteudo}
        </div>
      )}
    </div>
  );
}

/** Mini linha para dentro de um número. */
export function Faisca({ valores, cor, largura = 96, altura = 28 }: { valores: number[]; cor: string; largura?: number; altura?: number }) {
  const max = Math.max(1, ...valores);
  const min = Math.min(0, ...valores);
  const x = (i: number) => (valores.length > 1 ? (i / (valores.length - 1)) * (largura - 4) + 2 : 0);
  const y = (v: number) => altura - 3 - ((v - min) / (max - min || 1)) * (altura - 6);
  const d = valores.map((v, i) => `${i ? "L" : "M"}${x(i)},${y(v)}`).join(" ");
  return (
    <svg width={largura} height={altura} aria-hidden="true">
      <path d={d} fill="none" stroke="#b9b7b0" strokeWidth={1.5} strokeLinejoin="round" />
      {valores.length > 0 && <circle cx={x(valores.length - 1)} cy={y(valores.at(-1)!)} r={3} fill={cor} />}
    </svg>
  );
}
