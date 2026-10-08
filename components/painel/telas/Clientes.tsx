"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useBanco, useLoja } from "@/lib/dados/loja";
import { usePainel } from "../PainelRaiz";
import { Cabecalho } from "../Cabecalho";
import { Icone } from "@/components/ui/Icone";
import { Avatar, Botao, Busca, Campo, Entrada, EstadoVazio, Interruptor, Selo, Texto } from "@/components/ui/basicos";
import { Folha, useTelaLarga } from "@/components/ui/Folha";
import { useAvisos } from "@/components/ui/Avisos";
import type { Agendamento, Banco, Cliente } from "@/lib/tipos";
import { acharClientePorTelefone, novoCliente, salvarCliente } from "@/lib/dados/acoes";
import { aniversarioEntre, dataBr, dataCurta, haQuanto, inicioDoMes, fimDoMes, somarDias } from "@/lib/datas";
import { brl, normalizar, numero } from "@/lib/formato";
import { capitalizarNome, mascaraTelefone, telefoneValido } from "@/lib/masks";
import { clientesParaRetorno, realizado } from "@/lib/metricas";

export type Resumido = { visitas: number; gasto: number; faltas: number; ultima: string | null; proxima: Agendamento | null };

export function resumirClientes(b: Banco, agora: string): Map<string, Resumido> {
  const m = new Map<string, Resumido>();
  for (const c of b.clientes) m.set(c.id, { visitas: 0, gasto: 0, faltas: 0, ultima: null, proxima: null });
  for (const a of b.agendamentos) {
    const r = m.get(a.clienteId);
    if (!r) continue;
    if (a.status === "concluido") {
      r.visitas++;
      r.gasto += realizado(a);
      if (!r.ultima || a.inicio > r.ultima) r.ultima = a.inicio;
    } else if (a.status === "faltou") r.faltas++;
    else if ((a.status === "confirmado" || a.status === "pendente") && a.inicio >= agora && (!r.proxima || a.inicio < r.proxima.inicio)) r.proxima = a;
  }
  return m;
}

type Filtro = "todos" | "marcados" | "aniversario" | "retorno" | "faltosos" | "novos" | "vip";

export function Clientes() {
  const b = useBanco();
  const { agora } = useLoja();
  const { novo } = usePainel();
  const router = useRouter();
  const larga = useTelaLarga(900);
  const momento = agora();
  const hoje = momento.slice(0, 10);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [ordem, setOrdem] = useState<"recentes" | "nome" | "gasto" | "visitas">("recentes");
  const [limite, setLimite] = useState(40);
  const [editar, setEditar] = useState<Cliente | null>(null);

  const resumo = useMemo(() => resumirClientes(b, momento), [b, momento]);
  const retorno = useMemo(() => new Set(b.negocio.modulos.retorno ? clientesParaRetorno(b, hoje).map((r) => r.cliente.id) : []), [b, hoje]);

  const filtros: { id: Filtro; rotulo: string; teste: (c: Cliente, r: Resumido) => boolean }[] = [
    { id: "todos", rotulo: "Todos", teste: () => true },
    { id: "marcados", rotulo: "Com horário marcado", teste: (_, r) => !!r.proxima },
    { id: "novos", rotulo: "Novos (30 dias)", teste: (c) => c.criadoEm.slice(0, 10) >= somarDias(hoje, -30) },
    ...(b.negocio.modulos.aniversarios ? [{ id: "aniversario" as const, rotulo: "Aniversário no mês", teste: (c: Cliente) => !!c.nascimento && aniversarioEntre(c.nascimento, inicioDoMes(hoje), fimDoMes(hoje)) }] : []),
    ...(b.negocio.modulos.retorno ? [{ id: "retorno" as const, rotulo: "Hora de voltar", teste: (c: Cliente) => retorno.has(c.id) }] : []),
    { id: "faltosos", rotulo: "Faltaram 2+ vezes", teste: (_, r) => r.faltas >= 2 },
    { id: "vip", rotulo: "VIP", teste: (c) => c.tags.includes("VIP") },
  ];

  const lista = useMemo(() => {
    const q = normalizar(busca);
    const digitos = busca.replace(/\D/g, "");
    const f = filtros.find((x) => x.id === filtro)!;
    const r = b.clientes.filter((c) => {
      const res = resumo.get(c.id)!;
      if (!f.teste(c, res)) return false;
      if (!q) return true;
      return normalizar(c.nome).includes(q) || (digitos.length >= 3 && c.telefone.includes(digitos)) || c.tags.some((t) => normalizar(t).includes(q));
    });
    return r.sort((x, y) => {
      const a = resumo.get(x.id)!;
      const c = resumo.get(y.id)!;
      if (ordem === "nome") return x.nome.localeCompare(y.nome, "pt-BR");
      if (ordem === "gasto") return c.gasto - a.gasto;
      if (ordem === "visitas") return c.visitas - a.visitas;
      return (c.ultima ?? y.criadoEm) > (a.ultima ?? x.criadoEm) ? 1 : -1;
    });
  }, [b.clientes, busca, filtro, ordem, resumo]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => setLimite(40), [busca, filtro]);

  const exportar = () => {
    const linhas = [["Nome", "Telefone", "E-mail", "Nascimento", "Visitas", "Gasto total", "Última visita", "Etiquetas", "Observações"]];
    for (const c of lista) {
      const r = resumo.get(c.id)!;
      linhas.push([c.nome, mascaraTelefone(c.telefone), c.email, c.nascimento ? dataBr(c.nascimento) : "", String(r.visitas), r.gasto.toFixed(2).replace(".", ","), r.ultima ? dataBr(r.ultima.slice(0, 10)) : "", c.tags.join(", "), c.observacoes]);
    }
    const csv = "﻿" + linhas.map((l) => l.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `clientes-${b.negocio.slug}-${hoje}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const novosMes = b.clientes.filter((c) => c.criadoEm.slice(0, 7) === hoje.slice(0, 7)).length;

  return (
    <div className="pn-pagina">
      <Cabecalho
        titulo="Clientes"
        texto={`${numero(b.clientes.length)} clientes · ${novosMes} novos este mês`}
        acoes={
          <>
            <Link href="/painel/clientes/importar" className="ui-botao ui-botao-secundario ui-botao-m">
              <Icone nome="enviarArquivo" tamanho={18} /> Importar
            </Link>
            <Botao variante="principal" icone="clienteMais" onClick={() => setEditar(novoCliente({ nome: "", telefone: "" }, momento))}>
              Novo cliente
            </Botao>
          </>
        }
      />

      <div className="pn-filtros">
        <Busca valor={busca} onMudar={setBusca} placeholder="Nome, telefone ou etiqueta" />
        <select className="ui-entrada" style={{ width: "auto", height: 42 }} value={ordem} onChange={(e) => setOrdem(e.target.value as typeof ordem)} aria-label="Ordenar">
          <option value="recentes">Mais recentes</option>
          <option value="nome">Nome (A–Z)</option>
          <option value="gasto">Quem mais gastou</option>
          <option value="visitas">Mais visitas</option>
        </select>
        <Botao variante="fantasma" icone="planilha" onClick={exportar}>
          Exportar
        </Botao>
      </div>
      <div className="pn-fichas" style={{ marginBottom: 14 }}>
        {filtros.map((f) => (
          <button key={f.id} type="button" className="pn-ficha" aria-pressed={filtro === f.id} onClick={() => setFiltro(f.id)}>
            {f.rotulo}
            {f.id !== "todos" && <span style={{ opacity: 0.7 }}>{b.clientes.filter((c) => f.teste(c, resumo.get(c.id)!)).length}</span>}
          </button>
        ))}
      </div>

      <div className="pn-cartao">
        {lista.length === 0 ? (
          <EstadoVazio
            icone="clientes"
            titulo={b.clientes.length ? "Ninguém encontrado" : "Sua base de clientes começa aqui"}
            texto={b.clientes.length ? "Tente outro nome ou filtro." : "Importe a lista do celular ou de uma planilha em um minuto."}
            acao={
              !b.clientes.length && (
                <Link href="/painel/clientes/importar" className="ui-botao ui-botao-principal ui-botao-m">
                  Importar clientes
                </Link>
              )
            }
          />
        ) : larga ? (
          <div className="pn-rolagem-x">
            <table className="pn-tabela">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Última visita</th>
                  <th>Próximo horário</th>
                  <th className="num">Visitas</th>
                  <th className="num">Gasto</th>
                  <th>Etiquetas</th>
                </tr>
              </thead>
              <tbody>
                {lista.slice(0, limite).map((c) => {
                  const r = resumo.get(c.id)!;
                  return (
                    <tr key={c.id} className="clicavel" onClick={() => router.push(`/painel/clientes/${c.id}`)}>
                      <td>
                        <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          <Avatar nome={c.nome} tamanho={34} />
                          <span>
                            <strong style={{ display: "block", fontWeight: 600 }}>{c.nome}</strong>
                            <small style={{ color: "var(--c-texto-2)" }}>{mascaraTelefone(c.telefone)}</small>
                          </span>
                        </span>
                      </td>
                      <td style={{ color: "var(--c-texto-2)" }}>{r.ultima ? haQuanto(r.ultima.slice(0, 10), hoje) : "—"}</td>
                      <td>
                        {r.proxima ? (
                          <Selo tom="marca" icone="agenda">
                            {dataCurta(r.proxima.inicio.slice(0, 10))}, {r.proxima.inicio.slice(11)}
                          </Selo>
                        ) : (
                          <Botao
                            variante="fantasma"
                            tamanho="p"
                            icone="mais"
                            onClick={(e) => {
                              e.stopPropagation();
                              novo({ clienteId: c.id });
                            }}
                          >
                            Agendar
                          </Botao>
                        )}
                      </td>
                      <td className="num">
                        {r.visitas}
                        {r.faltas > 0 && <small style={{ color: "var(--critico)", marginLeft: 6 }}>{r.faltas}✕</small>}
                      </td>
                      <td className="num">{brl(r.gasto)}</td>
                      <td>
                        <span style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                          {c.tags.map((t) => (
                            <Selo key={t}>{t}</Selo>
                          ))}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="pn-lista">
            {lista.slice(0, limite).map((c) => {
              const r = resumo.get(c.id)!;
              return (
                <Link key={c.id} href={`/painel/clientes/${c.id}`} className="pn-linha">
                  <Avatar nome={c.nome} tamanho={40} />
                  <span className="pn-linha-info">
                    <strong>{c.nome}</strong>
                    <small>
                      {r.proxima ? `Marcado: ${dataCurta(r.proxima.inicio.slice(0, 10))}, ${r.proxima.inicio.slice(11)}` : r.ultima ? `Última visita ${haQuanto(r.ultima.slice(0, 10), hoje)}` : mascaraTelefone(c.telefone)}
                    </small>
                  </span>
                  <span className="pn-linha-lado">
                    <b>{brl(r.gasto).replace(",00", "")}</b>
                    {r.visitas} visitas
                  </span>
                </Link>
              );
            })}
          </div>
        )}
        {lista.length > limite && (
          <div style={{ padding: 14, textAlign: "center", borderTop: "1px solid var(--c-linha)" }}>
            <Botao variante="fantasma" onClick={() => setLimite((l) => l + 60)}>
              Mostrar mais ({lista.length - limite})
            </Botao>
          </div>
        )}
      </div>

      <FormCliente cliente={editar} onFechar={() => setEditar(null)} onSalvo={(c) => router.push(`/painel/clientes/${c.id}`)} />
    </div>
  );
}

export function FormCliente({ cliente, onFechar, onSalvo }: { cliente: Cliente | null; onFechar: () => void; onSalvo?: (c: Cliente) => void }) {
  const { banco, mudar } = useLoja();
  const avisar = useAvisos();
  const [c, setC] = useState<Cliente | null>(cliente);
  const [tags, setTags] = useState("");
  const [erro, setErro] = useState<Record<string, string>>({});
  useEffect(() => {
    setC(cliente);
    setTags(cliente?.tags.join(", ") ?? "");
    setErro({});
  }, [cliente]);
  const novo = cliente && !banco?.clientes.some((x) => x.id === cliente.id);

  const salvar = () => {
    if (!c || !banco) return;
    const e: Record<string, string> = {};
    if (c.nome.trim().length < 2) e.nome = "Escreva o nome.";
    if (!telefoneValido(c.telefone)) e.telefone = "Telefone com DDD.";
    const outro = acharClientePorTelefone(banco, c.telefone);
    if (outro && outro.id !== c.id) e.telefone = `Este número já é de ${outro.nome}.`;
    setErro(e);
    if (Object.keys(e).length) return;
    const final = { ...c, nome: capitalizarNome(c.nome), tags: tags.split(",").map((t) => t.trim()).filter(Boolean) };
    mudar((b) => salvarCliente(b, final));
    avisar(novo ? "Cliente cadastrado." : "Alterações salvas.");
    onFechar();
    onSalvo?.(final);
  };

  return (
    <Folha
      aberta={!!cliente}
      onFechar={onFechar}
      titulo={novo ? "Novo cliente" : "Editar cliente"}
      rodape={
        <>
          <Botao variante="fantasma" onClick={onFechar}>
            Cancelar
          </Botao>
          <Botao variante="principal" onClick={salvar}>
            Salvar
          </Botao>
        </>
      }
    >
      {c && (
        <div style={{ display: "grid", gap: 16 }}>
          <Campo rotulo="Nome completo" erro={erro.nome}>
            <Entrada value={c.nome} onChange={(e) => setC({ ...c, nome: e.target.value })} />
          </Campo>
          <div className="ui-grade-campos duas">
            <Campo rotulo="WhatsApp" erro={erro.telefone}>
              <Entrada inputMode="tel" value={mascaraTelefone(c.telefone)} onChange={(e) => setC({ ...c, telefone: e.target.value })} />
            </Campo>
            <Campo rotulo="Nascimento" opcional>
              <Entrada type="date" value={c.nascimento ?? ""} onChange={(e) => setC({ ...c, nascimento: e.target.value || null })} />
            </Campo>
          </div>
          <Campo rotulo="E-mail" opcional>
            <Entrada type="email" value={c.email} onChange={(e) => setC({ ...c, email: e.target.value })} />
          </Campo>
          <Campo rotulo="Etiquetas" opcional ajuda="Separe por vírgula. Ex.: VIP, pele sensível">
            <Entrada value={tags} onChange={(e) => setTags(e.target.value)} />
          </Campo>
          <Campo rotulo="Observações" opcional ajuda="Só a equipe vê.">
            <Texto value={c.observacoes} onChange={(e) => setC({ ...c, observacoes: e.target.value })} />
          </Campo>
          <Interruptor ligado={c.consentimentoWhats} onMudar={(v) => setC({ ...c, consentimentoWhats: v })} rotulo="Aceita receber lembretes e novidades pelo WhatsApp" mostrarRotulo />
        </div>
      )}
    </Folha>
  );
}
