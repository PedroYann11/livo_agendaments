"use client";

// =====================================================================
// Novo agendamento pelo painel — telefone tocou, cliente no balcão, encaixe.
//
// Mesma regra de vaga do site (lib/disponibilidade). A diferença do painel:
// pode ENCAIXAR fora da antecedência mínima, e cadastra o cliente na hora.
// =====================================================================

import { useEffect, useMemo, useState } from "react";
import { useLoja } from "@/lib/dados/loja";
import type { Banco, Cliente } from "@/lib/tipos";
import { Folha } from "@/components/ui/Folha";
import { Icone } from "@/components/ui/Icone";
import { Avatar, Botao, BotaoIcone, Busca, Campo, Entrada, Interruptor, Texto } from "@/components/ui/basicos";
import { useAvisos } from "@/components/ui/Avisos";
import { SeletorHorario, type Escolha } from "@/components/agendar/SeletorHorario";
import { criarAgendamento, registrarMensagem } from "@/lib/dados/acoes";
import { profissionaisAptos } from "@/lib/disponibilidade";
import { brl, duracao, normalizar, primeiroNome } from "@/lib/formato";
import { apenasDigitos, mascaraTelefone, telefoneValido } from "@/lib/masks";
import { dataCurta } from "@/lib/datas";
import { linkWhatsApp, mensagemPara } from "@/lib/whatsapp";
import { corDaPessoa } from "@/lib/paleta";

export type PreNovo = {
  clienteId?: string;
  profissionalId?: string;
  data?: string;
  hora?: string;
  servicoId?: string;
};

export function NovoAgendamento({ pre, onFechar, onCriado }: { pre: PreNovo | null; onFechar: () => void; onCriado: (id: string) => void }) {
  const { banco } = useLoja();
  return (
    <Folha aberta={!!pre && !!banco} onFechar={onFechar} titulo="Novo agendamento" largura={520}>
      {pre && banco && <Formulario b={banco} pre={pre} onFechar={onFechar} onCriado={onCriado} />}
    </Folha>
  );
}

function Formulario({ b, pre, onFechar, onCriado }: { b: Banco; pre: PreNovo; onFechar: () => void; onCriado: (id: string) => void }) {
  const { mudar, agora } = useLoja();
  const avisar = useAvisos();
  const [cliente, setCliente] = useState<Cliente | null>(pre.clienteId ? b.clientes.find((c) => c.id === pre.clienteId) ?? null : null);
  const [busca, setBusca] = useState("");
  const [novoCliente, setNovoCliente] = useState<{ nome: string; telefone: string } | null>(null);
  const [servicos, setServicos] = useState<string[]>(pre.servicoId ? [pre.servicoId] : []);
  const [profissional, setProfissional] = useState<string | null>(pre.profissionalId ?? null);
  const [encaixe, setEncaixe] = useState(false);
  const [data, setData] = useState<string | null>(pre.data ?? null);
  const [escolha, setEscolha] = useState<Escolha | null>(null);
  const [observacao, setObservacao] = useState("");
  const [buscaServico, setBuscaServico] = useState("");

  const ativos = b.servicos.filter((s) => s.ativo).sort((a, c) => a.ordem - c.ordem);
  const visiveis = buscaServico ? ativos.filter((s) => normalizar(s.nome).includes(normalizar(buscaServico))) : ativos;
  const aptos = profissionaisAptos(b, servicos);
  const profValido = profissional && aptos.some((p) => p.id === profissional) ? profissional : null;

  useEffect(() => {
    if (profissional && servicos.length && !aptos.some((p) => p.id === profissional)) setProfissional(null);
  }, [servicos]); // eslint-disable-line react-hooks/exhaustive-deps

  // horário vindo de um clique na agenda: tenta usar direto
  useEffect(() => {
    if (pre.hora && pre.data && servicos.length && !escolha) {
      setEscolha({ data: pre.data, hora: pre.hora, profissionalId: pre.profissionalId ?? "" });
    }
  }, [servicos]); // eslint-disable-line react-hooks/exhaustive-deps

  const resultados = useMemo(() => {
    const q = normalizar(busca);
    if (!q) return [];
    const digitos = apenasDigitos(busca);
    return b.clientes
      .filter((c) => normalizar(c.nome).includes(q) || (digitos.length >= 3 && c.telefone.includes(digitos)))
      .slice(0, 6);
  }, [b.clientes, busca]);

  const escolhidos = servicos.map((id) => b.servicos.find((s) => s.id === id)!).filter(Boolean);
  const total = escolhidos.reduce((s, x) => s + x.preco, 0);
  const tempo = escolhidos.reduce((s, x) => s + x.duracaoMin, 0);
  const clientePronto = cliente || (novoCliente && novoCliente.nome.trim().length > 2 && telefoneValido(novoCliente.telefone));

  const salvar = (enviarWhats: boolean) => {
    if (!escolha || !clientePronto) return;
    const momento = agora();
    const r = criarAgendamento(b, {
      servicosIds: servicos,
      profissionalId: escolha.profissionalId || profValido,
      data: escolha.data,
      hora: escolha.hora,
      canal: "painel",
      agora: momento,
      cliente: cliente ? { id: cliente.id, nome: cliente.nome, telefone: cliente.telefone } : { nome: novoCliente!.nome, telefone: novoCliente!.telefone },
      observacao,
      encaixe: true,
    });
    if (!r.ok) {
      avisar(r.motivo, "erro");
      setEscolha(null);
      return;
    }
    let banco = r.banco;
    const c = banco.clientes.find((x) => x.id === r.valor.clienteId)!;
    if (enviarWhats) {
      window.open(linkWhatsApp(c.telefone, mensagemPara(banco, "confirmacao", c, r.valor, window.location.origin)), "_blank", "noopener");
      banco = registrarMensagem(banco, "confirmacao", c.id, r.valor.id, momento);
    }
    mudar(() => banco);
    avisar(`${primeiroNome(c.nome)} agendada para ${dataCurta(escolha.data)}, ${escolha.hora}.`, "ok", { rotulo: "Ver", fazer: () => onCriado(r.valor.id) });
    onFechar();
  };

  return (
    <div style={{ display: "grid", gap: 22 }}>
      <section style={{ display: "grid", gap: 8 }}>
        <span className="ui-campo-rotulo">Cliente</span>
        {cliente ? (
          <div className="na-escolhido">
            <Avatar nome={cliente.nome} tamanho={36} />
            <div>
              <strong style={{ display: "block", fontSize: 14.5 }}>{cliente.nome}</strong>
              <small style={{ color: "var(--c-texto-2)" }}>{mascaraTelefone(cliente.telefone)}</small>
            </div>
            <BotaoIcone icone="fechar" rotulo="Trocar cliente" onClick={() => setCliente(null)} />
          </div>
        ) : novoCliente ? (
          <div style={{ display: "grid", gap: 10, padding: 12, borderRadius: 12, background: "var(--c-sutil)" }}>
            <div className="ui-grade-campos duas">
              <Campo rotulo="Nome">
                <Entrada value={novoCliente.nome} onChange={(e) => setNovoCliente({ ...novoCliente, nome: e.target.value })} autoFocus />
              </Campo>
              <Campo rotulo="WhatsApp">
                <Entrada inputMode="tel" value={mascaraTelefone(novoCliente.telefone)} onChange={(e) => setNovoCliente({ ...novoCliente, telefone: e.target.value })} placeholder="(88) 9 9999-9999" />
              </Campo>
            </div>
            <Botao variante="fantasma" tamanho="p" icone="voltar" onClick={() => setNovoCliente(null)}>
              Buscar cliente cadastrado
            </Botao>
          </div>
        ) : (
          <div>
            <Busca valor={busca} onMudar={setBusca} placeholder="Nome ou telefone" />
            {busca && (
              <div className="na-resultados">
                {resultados.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="na-cliente"
                    onClick={() => {
                      setCliente(c);
                      setBusca("");
                    }}
                  >
                    <Avatar nome={c.nome} tamanho={32} />
                    <span>
                      <strong>{c.nome}</strong>
                      <small>{mascaraTelefone(c.telefone)}</small>
                    </span>
                  </button>
                ))}
                <button
                  type="button"
                  className="na-cliente"
                  onClick={() => setNovoCliente({ nome: /\d/.test(busca) ? "" : busca, telefone: /\d/.test(busca) ? busca : "" })}
                >
                  <span className="ui-avatar" style={{ width: 32, height: 32, background: "var(--c-marca-sutil)", color: "var(--c-marca-tinta)" }}>
                    <Icone nome="clienteMais" tamanho={16} />
                  </span>
                  <span>
                    <strong>Cadastrar “{busca}”</strong>
                    <small>Cliente novo</small>
                  </span>
                </button>
              </div>
            )}
          </div>
        )}
      </section>

      <section style={{ display: "grid", gap: 8 }}>
        <span className="ui-campo-rotulo">
          Serviços {escolhidos.length > 0 && <em style={{ fontStyle: "normal", color: "var(--c-texto-3)", fontWeight: 450 }}>· {duracao(tempo)} · {brl(total)}</em>}
        </span>
        {ativos.length > 10 && <Busca valor={buscaServico} onMudar={setBuscaServico} placeholder="Filtrar serviços" />}
        <div className="na-servicos">
          {visiveis.map((s) => {
            const on = servicos.includes(s.id);
            return (
              <button
                key={s.id}
                type="button"
                className="na-servico"
                aria-pressed={on}
                onClick={() => {
                  setEscolha(null);
                  setServicos((x) => (on ? x.filter((y) => y !== s.id) : [...x, s.id]));
                }}
              >
                {s.nome} <small>{duracao(s.duracaoMin)}</small>
              </button>
            );
          })}
        </div>
      </section>

      {servicos.length > 0 && (
        <section style={{ display: "grid", gap: 8 }}>
          <span className="ui-campo-rotulo">Profissional</span>
          <div className="na-servicos">
            <button type="button" className="na-servico" aria-pressed={!profValido} onClick={() => { setProfissional(null); setEscolha(null); }}>
              Qualquer um
            </button>
            {aptos.map((p) => (
              <button
                key={p.id}
                type="button"
                className="na-servico"
                aria-pressed={profValido === p.id}
                onClick={() => {
                  setProfissional(p.id);
                  setEscolha(null);
                }}
              >
                <span className="ag-ponto-pro" style={{ background: corDaPessoa(p.cor) }} />
                {primeiroNome(p.nome)}
              </button>
            ))}
          </div>
          {!aptos.length && <small style={{ color: "var(--critico)" }}>Ninguém da equipe faz todos estes serviços juntos.</small>}
        </section>
      )}

      {servicos.length > 0 && aptos.length > 0 && (
        <section style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <span className="ui-campo-rotulo">Dia e horário</span>
            <Interruptor ligado={encaixe} onMudar={setEncaixe} rotulo="Encaixe" mostrarRotulo />
          </div>
          {encaixe && <small style={{ color: "var(--c-texto-2)", marginTop: -4 }}>Encaixe ignora a antecedência mínima e a janela do site.</small>}
          {escolha && pre.hora && escolha.hora === pre.hora && escolha.data === pre.data ? (
            <div className="na-escolhido">
              <Icone nome="relogio" />
              <div>
                <strong style={{ display: "block", fontSize: 14.5 }}>
                  {dataCurta(escolha.data)}, {escolha.hora}
                </strong>
                <small style={{ color: "var(--c-texto-2)" }}>Horário que você tocou na agenda</small>
              </div>
              <Botao variante="fantasma" tamanho="p" onClick={() => setEscolha(null)}>
                Trocar
              </Botao>
            </div>
          ) : (
            <SeletorHorario
              banco={b}
              servicosIds={servicos}
              profissionalId={profValido}
              agora={agora()}
              data={data}
              hora={escolha && escolha.data === data ? escolha.hora : null}
              onData={setData}
              onHora={setEscolha}
              encaixe={encaixe}
              dias={60}
            />
          )}
        </section>
      )}

      <Campo rotulo="Observação" opcional>
        <Texto rows={2} value={observacao} onChange={(e) => setObservacao(e.target.value)} placeholder="Ex.: prefere a sala 2" />
      </Campo>

      <div style={{ display: "grid", gap: 8, position: "sticky", bottom: -24, background: "var(--c-superficie)", padding: "12px 0 4px" }}>
        <Botao variante="principal" tamanho="g" disabled={!escolha || !clientePronto || !servicos.length} onClick={() => salvar(true)} icone="whatsapp">
          Agendar e enviar confirmação
        </Botao>
        <Botao variante="secundario" disabled={!escolha || !clientePronto || !servicos.length} onClick={() => salvar(false)}>
          Só agendar
        </Botao>
      </div>
    </div>
  );
}
