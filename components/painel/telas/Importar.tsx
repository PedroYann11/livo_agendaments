"use client";

// =====================================================================
// Importar clientes — o caminho para o dono trazer a base que já tem.
//
// Três portas, uma prévia: arquivo (.csv da planilha ou .vcf dos contatos
// do celular), ou colar (da planilha, do WhatsApp, do bloco de notas).
// Nada é gravado antes de o dono ver a prévia e os problemas linha a linha.
// =====================================================================

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useBanco, useLoja } from "@/lib/dados/loja";
import { Cabecalho } from "../Cabecalho";
import { Icone } from "@/components/ui/Icone";
import { Botao, Campo, Entrada, Interruptor, Segmentado, Selo, Texto } from "@/components/ui/basicos";
import { SeloAnimado } from "@/components/agendar/Confirmado";
import {
  ROTULOS_CAMPO,
  adivinharCampo,
  aplicarMapeamento,
  deContatos,
  lerListaSolta,
  lerTabela,
  lerVcard,
  marcarRepetidos,
  temCabecalho,
  type CampoDestino,
  type LinhaImportada,
} from "@/lib/importar";
import { importarClientes } from "@/lib/dados/acoes";
import { escolherContatos, limparSufixoDoNegocio, podeEscolherContatos } from "@/lib/contatos";
import { mascaraTelefone } from "@/lib/masks";
import { dataBr } from "@/lib/datas";
import { numero } from "@/lib/formato";

type Etapa = "origem" | "colunas" | "previa" | "feito";

export function Importar() {
  const b = useBanco();
  const { mudar, agora } = useLoja();
  const [etapa, setEtapa] = useState<Etapa>("origem");
  const [modo, setModo] = useState<"arquivo" | "colar">("arquivo");
  const [texto, setTexto] = useState("");
  const [tabela, setTabela] = useState<string[][]>([]);
  const [mapa, setMapa] = useState<CampoDestino[]>([]);
  const [cabecalho, setCabecalho] = useState(true);
  const [linhasProntas, setLinhasProntas] = useState<LinhaImportada[] | null>(null);
  const [etiqueta, setEtiqueta] = useState(`Importado ${dataBr(agora().slice(0, 10))}`);
  const [importados, setImportados] = useState(0);
  const [nomeArquivo, setNomeArquivo] = useState("");
  const arquivo = useRef<HTMLInputElement>(null);

  const existentes = useMemo(() => new Set(b.clientes.map((c) => c.telefone)), [b.clientes]);

  const processar = (conteudo: string, nome = "") => {
    setNomeArquivo(nome);
    if (/BEGIN:VCARD/i.test(conteudo)) {
      setLinhasProntas(lerVcard(conteudo));
      setEtapa("previa");
      return;
    }
    const t = lerTabela(conteudo);
    const colunasDeVerdade = Math.max(0, ...t.map((l) => l.length));
    if (colunasDeVerdade <= 1) {
      setLinhasProntas(lerListaSolta(conteudo));
      setEtapa("previa");
      return;
    }
    const cab = temCabecalho(t);
    setTabela(t);
    setCabecalho(cab);
    const primeira = t[0] ?? [];
    setMapa(
      primeira.map((celula, i) => {
        if (cab) return adivinharCampo(celula);
        const amostra = t.slice(0, 5).map((l) => l[i] ?? "");
        if (amostra.some((x) => x.replace(/\D/g, "").length >= 10)) return "telefone";
        if (amostra.some((x) => x.includes("@"))) return "email";
        if (amostra.some((x) => /^\d{1,2}\/\d{1,2}/.test(x))) return "nascimento";
        if (i === 0) return "nome";
        return "ignorar";
      }),
    );
    setLinhasProntas(null);
    setEtapa("colunas");
  };

  const nomeNegocio = b.negocio.nome;
  const linhas = useMemo(() => {
    const base = linhasProntas ?? (tabela.length ? aplicarMapeamento(tabela, mapa, cabecalho) : []);
    // "Maria Cliente DepiLED" (como ficou salvo no celular) entra como "Maria"
    const limpas = base.map((l) => ({ ...l, nome: limparSufixoDoNegocio(l.nome, nomeNegocio) }));
    return marcarRepetidos(limpas, existentes);
  }, [linhasProntas, tabela, mapa, cabecalho, existentes, nomeNegocio]);
  const boas = linhas.filter((l) => !l.problema);

  const importar = () => {
    mudar((x) => importarClientes(x, boas, agora(), etiqueta.trim() || undefined));
    setImportados(boas.length);
    setEtapa("feito");
  };

  const baixarModelo = () => {
    const csv = "﻿Nome;Telefone;E-mail;Nascimento;Observações\r\nMaria da Silva;(88) 9 9999-0000;maria@email.com;15/03/1990;Pele sensível\r\n";
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "modelo-clientes.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="pn-pagina" style={{ maxWidth: 920 }}>
      <div style={{ paddingTop: 16 }}>
        <Link href="/painel/clientes" className="pn-link">
          <Icone nome="voltar" tamanho={16} /> Clientes
        </Link>
      </div>
      <Cabecalho titulo="Importar clientes" texto="Traga a lista que você já tem. Nada é gravado antes de você conferir." />

      <AnimatePresence mode="wait">
        {etapa === "origem" && (
          <motion.div key="origem" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.25 }} style={{ display: "grid", gap: 14 }}>
            {podeEscolherContatos() && (
              <Botao
                variante="principal"
                icone="contatos"
                onClick={async () => {
                  try {
                    const escolhidos = await escolherContatos(b.negocio.nome, true);
                    if (!escolhidos.length) return;
                    setNomeArquivo("Contatos do celular");
                    setLinhasProntas(deContatos(escolhidos));
                    setEtapa("previa");
                  } catch {
                    // fechou a lista sem escolher
                  }
                }}
              >
                Escolher contatos do celular
              </Botao>
            )}
            <Segmentado
              rotulo="Origem"
              valor={modo}
              onMudar={setModo}
              opcoes={[
                { id: "arquivo", rotulo: "Enviar arquivo", icone: "enviarArquivo" },
                { id: "colar", rotulo: "Colar lista", icone: "copiar" },
              ]}
            />
            {modo === "arquivo" ? (
              <div className="pn-cartao" style={{ padding: 24, display: "grid", gap: 14, justifyItems: "center", textAlign: "center", borderStyle: "dashed", borderWidth: 2 }}>
                <span className="ui-vazio-icone">
                  <Icone nome="planilha" tamanho={26} />
                </span>
                <strong style={{ fontSize: 16 }}>Planilha (.csv) ou contatos do celular (.vcf)</strong>
                <p style={{ color: "var(--c-texto-2)", fontSize: 14, maxWidth: "52ch" }}>
                  No Excel ou Google Planilhas: <b>Arquivo → Salvar como / Fazer download → CSV</b>. No celular: <b>Contatos → Exportar</b> gera um arquivo .vcf.
                </p>
                <input
                  ref={arquivo}
                  type="file"
                  accept=".csv,.txt,.tsv,.vcf,text/csv,text/vcard"
                  hidden
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    const buf = await f.arrayBuffer();
                    let conteudo = new TextDecoder("utf-8").decode(buf);
                    // planilha salva no Excel brasileiro costuma vir em Windows-1252
                    if (conteudo.includes("�")) conteudo = new TextDecoder("windows-1252").decode(buf);
                    processar(conteudo, f.name);
                  }}
                />
                <Botao variante="principal" icone="enviarArquivo" onClick={() => arquivo.current?.click()}>
                  Escolher arquivo
                </Botao>
                <button type="button" className="pn-link" onClick={baixarModelo}>
                  Baixar planilha modelo
                </button>
              </div>
            ) : (
              <div className="pn-cartao pn-cartao-corpo" style={{ display: "grid", gap: 12 }}>
                <Campo rotulo="Cole aqui" ajuda="Copie as linhas da planilha (com as colunas), ou uma pessoa por linha: “Maria Souza 88 99999-0000”.">
                  <Texto rows={10} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={"Maria Souza\t(88) 9 9999-0000\nJoão Lima - 88 98888-1111"} style={{ fontFamily: "var(--f-mono), monospace", fontSize: 13 }} />
                </Campo>
                <Botao variante="principal" disabled={!texto.trim()} onClick={() => processar(texto)} iconeDepois="avancar">
                  Continuar
                </Botao>
              </div>
            )}
          </motion.div>
        )}

        {etapa === "colunas" && (
          <motion.div key="colunas" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.25 }} style={{ display: "grid", gap: 14 }}>
            <div className="pn-cartao">
              <div className="pn-cartao-cabeca">
                <h2>
                  <Icone nome="lista" tamanho={18} /> O que é cada coluna?
                </h2>
                <Interruptor ligado={cabecalho} onMudar={setCabecalho} rotulo="1ª linha é título" mostrarRotulo />
              </div>
              <p className="pn-cartao-sub" style={{ padding: "0 18px" }}>
                {nomeArquivo || "Lista colada"} · {numero(tabela.length - (cabecalho ? 1 : 0))} linhas
              </p>
              <div className="pn-rolagem-x" style={{ marginTop: 12 }}>
                <table className="pn-tabela">
                  <thead>
                    <tr>
                      {mapa.map((m, i) => (
                        <th key={i} style={{ minWidth: 160 }}>
                          <select
                            className="ui-entrada"
                            style={{ height: 36, fontSize: 13, textTransform: "none", letterSpacing: 0, fontWeight: 560 }}
                            value={m}
                            onChange={(e) => setMapa((x) => x.map((y, j) => (j === i ? (e.target.value as CampoDestino) : y)))}
                          >
                            {(Object.keys(ROTULOS_CAMPO) as CampoDestino[]).map((k) => (
                              <option key={k} value={k}>
                                {ROTULOS_CAMPO[k]}
                              </option>
                            ))}
                          </select>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tabela.slice(0, 6).map((l, i) => (
                      <tr key={i} style={cabecalho && i === 0 ? { color: "var(--c-texto-3)", fontStyle: "italic" } : undefined}>
                        {mapa.map((m, j) => (
                          <td key={j} style={{ opacity: m === "ignorar" ? 0.4 : 1, whiteSpace: "nowrap" }}>
                            {l[j]}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "space-between" }}>
              <Botao variante="fantasma" icone="voltar" onClick={() => setEtapa("origem")}>
                Voltar
              </Botao>
              <Botao variante="principal" iconeDepois="avancar" disabled={!mapa.includes("nome") || !mapa.includes("telefone")} onClick={() => setEtapa("previa")}>
                Ver prévia
              </Botao>
            </div>
            {(!mapa.includes("nome") || !mapa.includes("telefone")) && <small style={{ color: "var(--critico)" }}>Marque qual coluna é o Nome e qual é o Telefone.</small>}
          </motion.div>
        )}

        {etapa === "previa" && (
          <motion.div key="previa" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.25 }} style={{ display: "grid", gap: 14 }}>
            <div className="pn-kpis k3">
              <div className="pn-cartao pn-kpi">
                <span className="pn-kpi-rotulo">Prontos para entrar</span>
                <span className="pn-kpi-valor" style={{ color: "var(--bom)" }}>
                  {boas.length}
                </span>
              </div>
              <div className="pn-cartao pn-kpi">
                <span className="pn-kpi-rotulo">Já cadastrados ou repetidos</span>
                <span className="pn-kpi-valor">{linhas.filter((l) => l.problema?.includes("cadastrado") || l.problema?.includes("repetido")).length}</span>
              </div>
              <div className="pn-cartao pn-kpi">
                <span className="pn-kpi-rotulo">Com problema</span>
                <span className="pn-kpi-valor" style={{ color: "var(--critico)" }}>
                  {linhas.filter((l) => l.problema && !l.problema.includes("cadastrado") && !l.problema.includes("repetido")).length}
                </span>
              </div>
            </div>
            <div className="pn-cartao">
              <div className="pn-rolagem-x" style={{ maxHeight: 420, overflowY: "auto" }}>
                <table className="pn-tabela">
                  <thead>
                    <tr>
                      <th>Nome</th>
                      <th>Telefone</th>
                      <th>Nascimento</th>
                      <th>Situação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {linhas.slice(0, 300).map((l, i) => (
                      <tr key={i} style={l.problema ? { color: "var(--c-texto-3)" } : undefined}>
                        <td>{l.nome || "—"}</td>
                        <td style={{ whiteSpace: "nowrap" }}>{l.telefone ? mascaraTelefone(l.telefone) : "—"}</td>
                        <td>{l.nascimento ? dataBr(l.nascimento) : ""}</td>
                        <td>{l.problema ? <Selo tom={l.problema.includes("cadastrado") ? "neutro" : "critico"}>{l.problema}</Selo> : <Selo tom="bom" icone="ok">entra</Selo>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <Campo rotulo="Etiqueta para os importados" opcional ajuda="Ajuda a achar esse grupo depois — ou a mandar uma mensagem só para eles.">
              <Entrada value={etiqueta} onChange={(e) => setEtiqueta(e.target.value)} icone="etiqueta" />
            </Campo>
            <div style={{ display: "flex", gap: 8, justifyContent: "space-between" }}>
              <Botao variante="fantasma" icone="voltar" onClick={() => setEtapa(linhasProntas ? "origem" : "colunas")}>
                Voltar
              </Botao>
              <Botao variante="principal" tamanho="g" icone="clienteMais" disabled={!boas.length} onClick={importar}>
                Importar {boas.length} {boas.length === 1 ? "cliente" : "clientes"}
              </Botao>
            </div>
          </motion.div>
        )}

        {etapa === "feito" && (
          <motion.div key="feito" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3 }} className="pn-cartao" style={{ padding: 32, textAlign: "center", display: "grid", justifyItems: "center", gap: 10 }}>
            <SeloAnimado />
            <h2 style={{ fontSize: 22, fontWeight: 680, letterSpacing: "-0.02em" }}>{importados} clientes importados</h2>
            <p style={{ color: "var(--c-texto-2)" }}>Eles já aparecem na busca do agendamento e na lista de clientes.</p>
            <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap", justifyContent: "center" }}>
              <Link href="/painel/clientes" className="ui-botao ui-botao-principal ui-botao-m">
                Ver clientes
              </Link>
              <Botao variante="secundario" onClick={() => { setEtapa("origem"); setTexto(""); setTabela([]); setLinhasProntas(null); }}>
                Importar mais
              </Botao>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
