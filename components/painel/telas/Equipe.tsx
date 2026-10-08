"use client";

// Equipe: quem atende, o que faz, quando trabalha e quanto ganha.
// Profissional ≠ login: o dono pode operar a agenda de alguém sem acesso,
// e a recepção pode ter acesso sem ser profissional.

import { useState } from "react";
import { motion } from "motion/react";
import { useBanco, useLoja } from "@/lib/dados/loja";
import { Cabecalho } from "../Cabecalho";
import { EditorSemana } from "../EditorSemana";
import { Passo } from "./Servicos";
import { Icone } from "@/components/ui/Icone";
import { Avatar, Botao, BotaoIcone, Campo, Entrada, EstadoVazio, Interruptor, Medidor, Selo, Texto } from "@/components/ui/basicos";
import { Folha } from "@/components/ui/Folha";
import { useAvisos, useConfirmar } from "@/components/ui/Avisos";
import type { Papel, Profissional } from "@/lib/tipos";
import { profissionalNovo, removerBloqueio, salvarProfissional } from "@/lib/dados/acoes";
import { porProfissional } from "@/lib/metricas";
import { brl, numero } from "@/lib/formato";
import { dataCurta, inicioDoMes } from "@/lib/datas";
import { PALETA, corDaPessoa } from "@/lib/paleta";
import { NOME_PAPEL } from "@/lib/sessao";

export function Equipe() {
  const b = useBanco();
  const { agora, mudar } = useLoja();
  const confirmar = useConfirmar();
  const [editar, setEditar] = useState<Profissional | null>(null);
  const hoje = agora().slice(0, 10);
  const numeros = porProfissional(b, inicioDoMes(hoje), hoje);
  const equipe = b.profissionais.slice().sort((a, c) => Number(c.ativo) - Number(a.ativo) || a.ordem - c.ordem);
  const folgas = b.bloqueios.filter((x) => x.fim.slice(0, 10) >= hoje).sort((a, c) => (a.inicio < c.inicio ? -1 : 1));

  const horasSemana = (p: Profissional) =>
    Object.values(p.horario)
      .flat()
      .reduce((s, f) => s + (Number(f.fim.slice(0, 2)) * 60 + Number(f.fim.slice(3)) - Number(f.inicio.slice(0, 2)) * 60 - Number(f.inicio.slice(3))), 0) / 60;

  return (
    <div className="pn-pagina">
      <Cabecalho
        titulo="Equipe"
        texto={`${b.profissionais.filter((p) => p.ativo).length} profissionais ativos`}
        acoes={
          <Botao variante="principal" icone="clienteMais" onClick={() => setEditar(profissionalNovo(b))}>
            Adicionar profissional
          </Botao>
        }
      />

      <div className="pn-grade g3">
        {equipe.map((p, i) => {
          const nr = numeros.find((x) => x.profissional.id === p.id);
          return (
            <motion.button
              key={p.id}
              type="button"
              className="pn-cartao"
              style={{ textAlign: "left", padding: 18, display: "grid", gap: 14, opacity: p.ativo ? 1 : 0.55 }}
              onClick={() => setEditar(p)}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: p.ativo ? 1 : 0.55, y: 0 }}
              transition={{ delay: i * 0.05, duration: 0.35 }}
              whileHover={{ y: -2 }}
            >
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <Avatar nome={p.nome} cor={p.cor} tamanho={48} foto={p.fotoUrl} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <strong style={{ display: "block", fontSize: 16, fontWeight: 650 }}>{p.nome}</strong>
                  <small style={{ color: "var(--c-texto-2)" }}>{p.cargo || "Profissional"}</small>
                </div>
                {!p.ativo && <Selo>Inativo</Selo>}
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <Selo icone="servicos">{p.servicosIds.length} serviços</Selo>
                <Selo icone="relogio">{numero(Math.round(horasSemana(p)))}h/semana</Selo>
                {b.negocio.modulos.comissoes && p.comissaoPct > 0 && <Selo icone="percentual">{p.comissaoPct}% comissão</Selo>}
                {p.acesso ? <Selo tom="marca" icone="cadeado">{NOME_PAPEL[p.acesso.papel]}</Selo> : <Selo>Sem acesso ao painel</Selo>}
              </div>
              {nr && p.ativo && (
                <div style={{ display: "grid", gap: 6 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--c-texto-2)" }}>
                    <span>Ocupação no mês</span>
                    <b style={{ color: "var(--c-texto)" }}>{Math.round(nr.ocupacao * 100)}%</b>
                  </div>
                  <Medidor valor={nr.ocupacao} rotulo="Ocupação" />
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--c-texto-2)" }}>
                    <span>{nr.atendimentos} atendimentos</span>
                    <span>{brl(nr.faturamento)}</span>
                  </div>
                </div>
              )}
            </motion.button>
          );
        })}
      </div>

      <div className="pn-cartao" style={{ marginTop: 16 }}>
        <div className="pn-cartao-cabeca">
          <h2>
            <Icone nome="proibido" tamanho={18} /> Folgas e bloqueios
          </h2>
        </div>
        <p className="pn-cartao-sub" style={{ padding: "0 18px" }}>
          Para bloquear um horário, use “Bloquear horário” na Agenda.
        </p>
        <div className="pn-lista" style={{ marginTop: 8 }}>
          {folgas.length === 0 && <EstadoVazio icone="agenda" titulo="Nenhuma folga marcada" />}
          {folgas.map((f) => {
            const p = b.profissionais.find((x) => x.id === f.profissionalId);
            return (
              <div key={f.id} className="pn-linha">
                <span className="pn-barra-cor" style={{ background: p ? corDaPessoa(p.cor) : "var(--c-texto-3)" }} />
                <span className="pn-linha-info">
                  <strong>{p?.nome ?? "O negócio inteiro"}</strong>
                  <small>
                    {dataCurta(f.inicio.slice(0, 10))}, {f.inicio.slice(11)}–{f.fim.slice(11)} · {f.motivo || "Bloqueado"}
                  </small>
                </span>
                <BotaoIcone
                  icone="apagar"
                  rotulo="Remover"
                  onClick={async () => {
                    const ok = await confirmar({ titulo: "Remover este bloqueio?", texto: "O horário volta a ficar disponível no site.", confirmar: "Remover" });
                    if (ok) mudar((x) => removerBloqueio(x, f.id));
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>

      <EditorProfissional profissional={editar} onFechar={() => setEditar(null)} />
    </div>
  );
}

function EditorProfissional({ profissional, onFechar }: { profissional: Profissional | null; onFechar: () => void }) {
  const { banco, mudar } = useLoja();
  const avisar = useAvisos();
  const [p, setP] = useState<Profissional | null>(profissional);
  const [ultimo, setUltimo] = useState<Profissional | null>(null);
  if (profissional !== ultimo) {
    setUltimo(profissional);
    setP(profissional);
  }
  if (!banco) return null;
  const novo = profissional && !banco.profissionais.some((x) => x.id === profissional.id);

  const salvar = () => {
    if (!p) return;
    if (!p.nome.trim()) return avisar("Escreva o nome.", "erro");
    if (p.acesso && !/^\S+@\S+\.\S+$/.test(p.acesso.email)) return avisar("Confira o e-mail de acesso.", "erro");
    mudar((x) => salvarProfissional(x, { ...p, nome: p.nome.trim() }));
    avisar(novo ? `${p.nome} entrou na equipe.` : "Salvo.");
    onFechar();
  };

  return (
    <Folha
      aberta={!!profissional}
      onFechar={onFechar}
      titulo={novo ? "Novo profissional" : p?.nome ?? ""}
      largura={540}
      rodape={
        <Botao variante="principal" onClick={salvar}>
          Salvar
        </Botao>
      }
    >
      {p && (
        <div style={{ display: "grid", gap: 4 }}>
          <div className="pn-secao-form">
            <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
              <Avatar nome={p.nome || "?"} cor={p.cor} tamanho={56} />
              <div className="pn-cores">
                {PALETA.map((c, i) => (
                  <button key={c} type="button" className="pn-cor" style={{ background: c, width: 28, height: 28 }} aria-pressed={p.cor === i} aria-label={`Cor ${i + 1}`} onClick={() => setP({ ...p, cor: i })} />
                ))}
              </div>
            </div>
            <div className="ui-grade-campos duas">
              <Campo rotulo="Nome">
                <Entrada value={p.nome} onChange={(e) => setP({ ...p, nome: e.target.value })} />
              </Campo>
              <Campo rotulo="Cargo" opcional>
                <Entrada value={p.cargo} onChange={(e) => setP({ ...p, cargo: e.target.value })} placeholder="Ex.: Barbeiro" />
              </Campo>
            </div>
            <Campo rotulo="Apresentação" opcional ajuda="Aparece na sua página, na seção Equipe.">
              <Texto rows={2} value={p.bio} onChange={(e) => setP({ ...p, bio: e.target.value })} />
            </Campo>
            <Interruptor ligado={p.ativo} onMudar={(v) => setP({ ...p, ativo: v })} rotulo="Atendendo (aparece no site e na agenda)" mostrarRotulo />
          </div>

          <div className="pn-secao-form">
            <h3>Serviços que faz</h3>
            <div className="pn-checks" style={{ maxHeight: 240, overflowY: "auto" }}>
              {banco.servicos
                .filter((s) => s.ativo)
                .map((s) => (
                  <label key={s.id} className="pn-check">
                    <input
                      type="checkbox"
                      checked={p.servicosIds.includes(s.id)}
                      onChange={(e) => setP({ ...p, servicosIds: e.target.checked ? [...p.servicosIds, s.id] : p.servicosIds.filter((x) => x !== s.id) })}
                    />
                    <span>{s.nome}</span>
                  </label>
                ))}
            </div>
          </div>

          <div className="pn-secao-form">
            <h3>Horário de trabalho</h3>
            <p>É este horário que abre vagas no site. Folgas pontuais vão em “Bloquear horário”.</p>
            <EditorSemana valor={p.horario} onMudar={(h) => setP({ ...p, horario: h })} />
          </div>

          {banco.negocio.modulos.comissoes && (
            <div className="pn-secao-form">
              <h3>Comissão</h3>
              <Campo rotulo="Percentual sobre os atendimentos concluídos" ajuda="Em pacote, a base é o valor de uma sessão.">
                <Passo valor={p.comissaoPct} passo={5} min={0} max={100} formatar={(v) => `${v}%`} onMudar={(v) => setP({ ...p, comissaoPct: v })} />
              </Campo>
            </div>
          )}

          <div className="pn-secao-form">
            <h3>Acesso ao painel</h3>
            <Interruptor
              ligado={!!p.acesso}
              onMudar={(v) => setP({ ...p, acesso: v ? { email: "", papel: "professional" } : null })}
              rotulo="Pode entrar no painel"
              mostrarRotulo
            />
            {p.acesso && (
              <div className="ui-grade-campos duas">
                <Campo rotulo="E-mail">
                  <Entrada type="email" value={p.acesso.email} onChange={(e) => setP({ ...p, acesso: { ...p.acesso!, email: e.target.value } })} />
                </Campo>
                <Campo rotulo="O que pode ver" ajuda={p.acesso.papel === "professional" ? "Só a própria agenda e os próprios clientes." : p.acesso.papel === "reception" ? "Agenda de todos, clientes e mensagens. Sem financeiro." : "Tudo."}>
                  <select className="ui-entrada" value={p.acesso.papel} onChange={(e) => setP({ ...p, acesso: { ...p.acesso!, papel: e.target.value as Papel } })} disabled={p.acesso.papel === "owner"}>
                    {(["professional", "reception", "admin", ...(p.acesso.papel === "owner" ? ["owner"] : [])] as Papel[]).map((x) => (
                      <option key={x} value={x}>
                        {NOME_PAPEL[x]}
                      </option>
                    ))}
                  </select>
                </Campo>
              </div>
            )}
          </div>
        </div>
      )}
    </Folha>
  );
}
