"use client";

// =====================================================================
// Configurações — "toda informação editável está no painel" (skill
// painel-adm). O dono muda a página, as cores, os horários e as regras
// sem programador. Alterações do negócio ficam num rascunho com barra de
// "salvar" — nada muda no site antes de ele confirmar.
// =====================================================================

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import QRCode from "qrcode";
import { useBanco, useLoja } from "@/lib/dados/loja";
import { usePainel } from "../PainelRaiz";
import { Cabecalho } from "../Cabecalho";
import { EditorSemana } from "../EditorSemana";
import { Passo } from "./Servicos";
import { Icone, type NomeIcone } from "@/components/ui/Icone";
import { Botao, BotaoCopiar, BotaoIcone, Campo, Entrada, Estrelas, Interruptor, Segmentado, Selo, Texto } from "@/components/ui/basicos";
import { useAvisos, useConfirmar } from "@/components/ui/Avisos";
import type { Cupom, Negocio, Pele } from "@/lib/tipos";
import { removerCupom, salvarCupom, salvarDepoimento, salvarNegocio } from "@/lib/dados/acoes";
import { MODULOS, NICHOS, modulosDoNicho } from "@/lib/padroes";
import { buscarCep, buscarFeriados, type Feriado } from "@/lib/feriados";
import { capitalizar } from "@/components/vitrine/util";
import { contraste, hexValido, misturar, textoSobre } from "@/lib/cor";
import { dataBr, dataCurta } from "@/lib/datas";
import { centavosParaReais, formatarValorCampo, mascaraCep, mascaraTelefone } from "@/lib/masks";
import { brl } from "@/lib/formato";
import { novoId } from "@/lib/id";
import { sair } from "@/lib/sessao";

type Secao = "pagina" | "aparencia" | "funcionamento" | "regras" | "contato" | "pagamentos" | "modulos" | "promocoes" | "avaliacoes" | "conta";

const SECOES: { id: Secao; rotulo: string; icone: NomeIcone }[] = [
  { id: "pagina", rotulo: "Minha página", icone: "pagina" },
  { id: "aparencia", rotulo: "Aparência", icone: "paleta" },
  { id: "funcionamento", rotulo: "Funcionamento", icone: "relogio" },
  { id: "regras", rotulo: "Regras de agendamento", icone: "ajustes" },
  { id: "contato", rotulo: "Contato e endereço", icone: "local" },
  { id: "pagamentos", rotulo: "Pix, sinal e meta", icone: "pix" },
  { id: "modulos", rotulo: "Funções", icone: "grade" },
  { id: "promocoes", rotulo: "Cupons", icone: "cupom" },
  { id: "avaliacoes", rotulo: "Avaliações", icone: "estrela" },
  { id: "conta", rotulo: "Conta", icone: "cliente" },
];

const CORES = [
  "#9a4a2b", "#b4471f", "#c2410c", "#d4a24c", "#a16207", "#2f6b58", "#1f5c4b", "#0f766e",
  "#155e75", "#1e4fa3", "#3b3fb6", "#5b2a86", "#86198f", "#be185d", "#7a1f3d", "#2f3437",
];

const PELES: { id: Pele; nome: string; fonte: string; descricao: string }[] = [
  { id: "beleza", nome: "Elegante", fonte: "var(--f-beleza)", descricao: "Serifa fina, tons quentes. Clínicas, estética, salão." },
  { id: "barbearia", nome: "Marcante", fonte: "var(--f-barbearia)", descricao: "Escura, condensada, forte. Barbearias e tatuagem." },
  { id: "delicada", nome: "Delicada", fonte: "var(--f-delicada)", descricao: "Arredondada e leve. Unhas, cílios, sobrancelha." },
  { id: "generica", nome: "Neutra", fonte: "var(--f-sans)", descricao: "Limpa e sóbria. Saúde, consultórios, serviços." },
];

export function Configuracoes() {
  const b = useBanco();
  const { mudar } = useLoja();
  const avisar = useAvisos();
  const params = useSearchParams();
  const router = useRouter();
  const secao = (params.get("s") as Secao) ?? "pagina";
  const [rascunho, setRascunho] = useState<Negocio>(b.negocio);
  const [base, setBase] = useState(b.negocio);
  if (base !== b.negocio && JSON.stringify(rascunho) === JSON.stringify(base)) {
    setBase(b.negocio);
    setRascunho(b.negocio);
  }
  const sujo = JSON.stringify(rascunho) !== JSON.stringify(b.negocio);
  const ir = (s: Secao) => router.replace(`/painel/configuracoes?s=${s}`, { scroll: false });
  const muda = (p: Partial<Negocio>) => setRascunho((r) => ({ ...r, ...p }));

  return (
    <div className="pn-pagina">
      <Cabecalho titulo="Configurações" texto="Tudo o que aparece para o cliente, você muda aqui." />
      <div className="cf-layout">
        <nav className="cf-menu" aria-label="Seções">
          {SECOES.map((s) => (
            <button key={s.id} type="button" aria-current={secao === s.id} onClick={() => ir(s.id)}>
              <Icone nome={s.icone} tamanho={18} />
              {s.rotulo}
            </button>
          ))}
        </nav>
        <div style={{ minWidth: 0 }}>
          <AnimatePresence mode="wait">
            <motion.div key={secao} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
              {secao === "pagina" && <SecaoPagina n={rascunho} muda={muda} />}
              {secao === "aparencia" && <SecaoAparencia n={rascunho} muda={muda} />}
              {secao === "funcionamento" && <SecaoFuncionamento n={rascunho} muda={muda} />}
              {secao === "regras" && <SecaoRegras n={rascunho} muda={muda} />}
              {secao === "contato" && <SecaoContato n={rascunho} muda={muda} />}
              {secao === "pagamentos" && <SecaoPagamentos n={rascunho} muda={muda} />}
              {secao === "modulos" && <SecaoModulos n={rascunho} muda={muda} />}
              {secao === "promocoes" && <SecaoCupons />}
              {secao === "avaliacoes" && <SecaoAvaliacoes />}
              {secao === "conta" && <SecaoConta />}
            </motion.div>
          </AnimatePresence>
          <AnimatePresence>
            {sujo && (
              <motion.div className="cf-salvar" initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 30, opacity: 0 }} transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}>
                <span>Alterações não salvas</span>
                <span style={{ display: "flex", gap: 6 }}>
                  <Botao variante="fantasma" tamanho="p" onClick={() => setRascunho(b.negocio)}>
                    Descartar
                  </Botao>
                  <Botao
                    variante="principal"
                    tamanho="p"
                    onClick={() => {
                      mudar((x) => salvarNegocio(x, rascunho));
                      avisar("Salvo. Sua página já está atualizada.");
                    }}
                  >
                    Salvar
                  </Botao>
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

type PropsSecao = { n: Negocio; muda: (p: Partial<Negocio>) => void };

function Bloco({ titulo, texto, children }: { titulo: string; texto?: string; children: React.ReactNode }) {
  return (
    <div className="pn-cartao" style={{ marginBottom: 14 }}>
      <div className="pn-cartao-cabeca">
        <h2>{titulo}</h2>
      </div>
      {texto && (
        <p className="pn-cartao-sub" style={{ padding: "0 18px" }}>
          {texto}
        </p>
      )}
      <div className="pn-cartao-corpo" style={{ display: "grid", gap: 16 }}>
        {children}
      </div>
    </div>
  );
}

function SecaoPagina({ n, muda }: PropsSecao) {
  const [qr, setQr] = useState<string | null>(null);
  const [destaque, setDestaque] = useState("");
  const [origem, setOrigem] = useState("");
  useEffect(() => setOrigem(window.location.origin), []);
  const link = `${origem}/${n.slug}`;
  useEffect(() => {
    if (!origem) return;
    QRCode.toDataURL(link, { margin: 1, width: 480, color: { dark: "#111111", light: "#ffffff" } }).then(setQr).catch(() => setQr(null));
  }, [link, origem]);

  return (
    <>
      <Bloco titulo="Seu link de agendamento" texto="Coloque na bio do Instagram, no status do WhatsApp e imprima o QR Code para o balcão.">
        <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {qr && <img src={qr} alt="QR Code do link" width={112} height={112} style={{ borderRadius: 12, border: "1px solid var(--c-linha)" }} />}
          <div style={{ display: "grid", gap: 10, flex: 1, minWidth: 220 }}>
            <code style={{ fontFamily: "var(--f-mono)", fontSize: 14, padding: "10px 12px", borderRadius: 10, background: "var(--c-sutil)", wordBreak: "break-all" }}>{link}</code>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <BotaoCopiar texto={link} rotulo="Copiar link" />
              {qr && (
                <a className="ui-botao ui-botao-secundario ui-botao-m" href={qr} download={`qrcode-${n.slug}.png`}>
                  <Icone nome="pix" tamanho={18} /> Baixar QR Code
                </a>
              )}
              <a className="ui-botao ui-botao-fantasma ui-botao-m" href={`/${n.slug}`} target="_blank" rel="noopener noreferrer">
                <Icone nome="abrir" tamanho={18} /> Abrir
              </a>
            </div>
          </div>
        </div>
      </Bloco>
      <Bloco titulo="Textos da página">
        <Campo rotulo="Nome do negócio">
          <Entrada value={n.nome} onChange={(e) => muda({ nome: e.target.value })} />
        </Campo>
        <Campo rotulo="Frase de destaque" ajuda="O título grande do topo. Curta e com a sua cara.">
          <Entrada value={n.tagline} onChange={(e) => muda({ tagline: e.target.value })} maxLength={60} placeholder="Ex.: Pele lisa, cuidado de verdade." />
        </Campo>
        <Campo rotulo="Descrição" ajuda="Aparece embaixo do título e no Google.">
          <Texto rows={2} value={n.descricao} onChange={(e) => muda({ descricao: e.target.value })} maxLength={200} />
        </Campo>
        <Campo rotulo="Sobre" opcional ajuda="A história do negócio, na seção Sobre.">
          <Texto rows={4} value={n.sobre} onChange={(e) => muda({ sobre: e.target.value })} />
        </Campo>
        <Campo rotulo="Diferenciais" ajuda="Selos que aparecem no topo (ex.: Material descartável).">
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {n.destaques.map((d) => (
              <span key={d} className="pn-ficha" style={{ paddingRight: 4 }}>
                {d}
                <BotaoIcone icone="fechar" rotulo={`Remover ${d}`} tamanho={14} onClick={() => muda({ destaques: n.destaques.filter((x) => x !== d) })} />
              </span>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Entrada value={destaque} onChange={(e) => setDestaque(e.target.value)} placeholder="Novo diferencial" />
            <Botao
              variante="secundario"
              disabled={!destaque.trim()}
              onClick={() => {
                muda({ destaques: [...n.destaques, destaque.trim()] });
                setDestaque("");
              }}
            >
              Adicionar
            </Botao>
          </div>
        </Campo>
      </Bloco>
      <Bloco titulo="Aviso no topo" texto="Promoção, férias, mudança de endereço — aparece em destaque na página.">
        <Interruptor ligado={n.aviso.ativo} onMudar={(v) => muda({ aviso: { ...n.aviso, ativo: v } })} rotulo="Mostrar aviso" mostrarRotulo />
        <Entrada value={n.aviso.texto} onChange={(e) => muda({ aviso: { ...n.aviso, texto: e.target.value } })} placeholder="Ex.: 15% off no laser de axilas em outubro" disabled={!n.aviso.ativo} />
      </Bloco>
      <Bloco titulo="Símbolo" texto="Quadrado, de preferência. Aparece no topo da página e no painel.">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "center" }}>
          <span className={`pn-negocio-simbolo${n.logoUrl ? " com-imagem" : ""}`} style={{ width: 64, height: 64, borderRadius: 16, fontSize: 26 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {n.logoUrl ? <img src={n.logoUrl} alt="" /> : n.nome.charAt(0)}
          </span>
          <label className="ui-botao ui-botao-secundario ui-botao-m" style={{ cursor: "pointer" }}>
            <Icone nome="imagem" tamanho={18} /> Escolher imagem
            <input type="file" accept="image/*" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (f) muda({ logoUrl: await reduzirImagem(f, 256, true) }); }} />
          </label>
          {n.logoUrl && (
            <Botao variante="fantasma" onClick={() => muda({ logoUrl: null })}>
              Remover
            </Botao>
          )}
        </div>
      </Bloco>
      <Bloco titulo="Logo com o nome" texto="Aparece grande no começo da sua página. PNG com fundo transparente fica melhor.">
        <div style={{ display: "grid", gap: 12, justifyItems: "start" }}>
          {n.logoCompletoUrl && (
            <span style={{ display: "grid", placeItems: "center", padding: 14, borderRadius: 14, background: n.tema.fundo, border: "1px solid var(--c-linha)" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={n.logoCompletoUrl} alt="" style={{ maxWidth: 220, maxHeight: 120, objectFit: "contain" }} />
            </span>
          )}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            <label className="ui-botao ui-botao-secundario ui-botao-m" style={{ cursor: "pointer" }}>
              <Icone nome="imagem" tamanho={18} /> Escolher imagem
              <input type="file" accept="image/*" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (f) muda({ logoCompletoUrl: await reduzirImagem(f, 720, false) }); }} />
            </label>
            {n.logoCompletoUrl && (
              <Botao variante="fantasma" onClick={() => muda({ logoCompletoUrl: null })}>
                Remover
              </Botao>
            )}
          </div>
        </div>
      </Bloco>
    </>
  );
}

/**
 * Reduz a imagem no navegador antes de guardar (ideia de livo/lib/image.ts).
 * Quadrada: recorta o centro. Inteira: mantém a proporção, limitada a `lado`
 * de largura. PNG e WebP continuam PNG, para não perder a transparência.
 */
async function reduzirImagem(file: File, lado: number, quadrada: boolean): Promise<string> {
  const url = URL.createObjectURL(file);
  const img = await new Promise<HTMLImageElement>((ok, erro) => {
    const i = new Image();
    i.onload = () => ok(i);
    i.onerror = erro;
    i.src = url;
  });
  const c = document.createElement("canvas");
  const ctx = c.getContext("2d")!;
  if (quadrada) {
    const menor = Math.min(img.width, img.height);
    c.width = lado;
    c.height = lado;
    ctx.drawImage(img, (img.width - menor) / 2, (img.height - menor) / 2, menor, menor, 0, 0, lado, lado);
  } else {
    const escala = Math.min(1, lado / img.width);
    c.width = Math.round(img.width * escala);
    c.height = Math.round(img.height * escala);
    ctx.drawImage(img, 0, 0, c.width, c.height);
  }
  URL.revokeObjectURL(url);
  const transparente = file.type === "image/png" || file.type === "image/webp";
  return transparente ? c.toDataURL("image/png") : c.toDataURL("image/jpeg", 0.86);
}

function SecaoAparencia({ n, muda }: PropsSecao) {
  const t = n.tema;
  const escura = contraste(t.fundo, "#ffffff") > 4;
  const mudaTema = (p: Partial<Negocio["tema"]>) => muda({ tema: { ...t, ...p } });
  const leitura = contraste(t.marca, t.sobreMarca);
  return (
    <div className="pn-grade g-21">
      <div>
        <Bloco titulo="Estilo da página" texto="Muda as letras, os cantos e a arte do topo. As cores você escolhe abaixo.">
          <div className="cf-peles">
            {PELES.map((p) => (
              <button key={p.id} type="button" className="cf-pele" aria-pressed={n.pele === p.id} onClick={() => muda({ pele: p.id })} title={p.descricao}>
                <span className="cf-pele-amostra" style={{ background: p.id === "barbearia" ? "#141311" : t.fundo, color: p.id === "barbearia" ? "#efe8dc" : t.texto }}>
                  <b style={{ fontFamily: p.fonte, fontWeight: p.id === "barbearia" ? 800 : 400, textTransform: p.id === "barbearia" ? "uppercase" : "none" }}>Agende</b>
                  <i style={{ background: t.marca, borderRadius: p.id === "barbearia" ? 3 : 8 }} />
                </span>
                <span>{p.nome}</span>
              </button>
            ))}
          </div>
          <small style={{ color: "var(--c-texto-2)" }}>{PELES.find((p) => p.id === n.pele)?.descricao}</small>
        </Bloco>
        <Bloco titulo="Cor da marca" texto="Botões, destaques e a cor do seu painel.">
          <div className="pn-cores">
            {CORES.map((c) => (
              <button key={c} type="button" className="pn-cor" style={{ background: c }} aria-pressed={t.marca === c} aria-label={c} onClick={() => mudaTema({ marca: c, sobreMarca: textoSobre(c) })}>
                {t.marca === c && <Icone nome="ok" tamanho={16} peso="bold" />}
              </button>
            ))}
            <label className="pn-cor-livre" title="Outra cor">
              <input type="color" value={t.marca} onChange={(e) => mudaTema({ marca: e.target.value, sobreMarca: textoSobre(e.target.value) })} />
            </label>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span className="ui-botao ui-botao-m" style={{ background: t.marca, color: t.sobreMarca }}>
              Agendar horário
            </span>
            <Segmentado
              rotulo="Texto do botão"
              tamanho="p"
              valor={t.sobreMarca === "#ffffff" ? "claro" : "escuro"}
              onMudar={(v) => mudaTema({ sobreMarca: v === "claro" ? "#ffffff" : "#111111" })}
              opcoes={[
                { id: "claro", rotulo: "Texto claro" },
                { id: "escuro", rotulo: "Texto escuro" },
              ]}
            />
            {leitura < 4.5 && <Selo tom="atencao" icone="aviso">Pouco contraste</Selo>}
          </div>
        </Bloco>
        <Bloco titulo="Fundo">
          <div className="pn-cores">
            {[
              { fundo: "#f6f5f2", superficie: "#ffffff", texto: "#1c1c20", textoSuave: "#5f5f69", nome: "Neutro" },
              { fundo: "#f5ede4", superficie: "#fffaf4", texto: "#2a1b14", textoSuave: "#76604f", nome: "Creme" },
              { fundo: "#fbf6f2", superficie: "#ffffff", texto: "#22302a", textoSuave: "#66766f", nome: "Rosado" },
              { fundo: "#eef3f6", superficie: "#ffffff", texto: "#14212b", textoSuave: "#5a6874", nome: "Azulado" },
              { fundo: "#121110", superficie: "#1d1b18", texto: "#efe8dc", textoSuave: "#a89e8f", nome: "Escuro" },
            ].map((f) => (
              <button
                key={f.nome}
                type="button"
                className="pn-cor"
                style={{ background: `linear-gradient(135deg, ${f.fundo} 50%, ${f.superficie} 50%)`, width: 44, height: 44, color: f.texto }}
                aria-pressed={t.fundo === f.fundo}
                title={f.nome}
                onClick={() => mudaTema({ fundo: f.fundo, superficie: f.superficie, texto: f.texto, textoSuave: f.textoSuave })}
              >
                {t.fundo === f.fundo && <Icone nome="ok" tamanho={16} peso="bold" />}
              </button>
            ))}
          </div>
          <Campo rotulo="Cor de apoio" opcional ajuda="Usada em detalhes da arte do topo.">
            <div className="pn-cores">
              <label className="pn-cor-livre">
                <input type="color" value={hexValido(t.acento) ? t.acento : "#c9a46a"} onChange={(e) => mudaTema({ acento: e.target.value })} />
              </label>
              <span className="pn-cor" style={{ background: t.acento }} />
              <Botao variante="fantasma" tamanho="p" onClick={() => mudaTema({ acento: misturar(t.marca, escura ? "#ffffff" : "#f0c08a", 0.5) })}>
                Sugerir
              </Botao>
            </div>
          </Campo>
        </Bloco>
      </div>
      <div>
        <div style={{ position: "sticky", top: 20 }}>
          <p style={{ fontSize: 13, color: "var(--c-texto-2)", marginBottom: 8 }}>Prévia ao vivo · atualiza ao salvar</p>
          <div className="cf-previa">
            <iframe src={`/${n.slug}`} title="Prévia da página" />
          </div>
        </div>
      </div>
    </div>
  );
}

function SecaoFuncionamento({ n, muda }: PropsSecao) {
  const avisar = useAvisos();
  const [novaData, setNovaData] = useState("");
  const [novoRotulo, setNovoRotulo] = useState("");
  const [feriados, setFeriados] = useState<Feriado[] | null>(null);
  const [fonte, setFonte] = useState("");
  const { agora } = useLoja();
  const hoje = agora().slice(0, 10);
  const lista = n.datasEspeciais.slice().sort((a, b) => (a.data < b.data ? -1 : 1));
  const avulsos = n.aberturas.filter((a) => a.data >= hoje).sort((a, b) => (a.data < b.data ? -1 : 1));
  const [novoAvulso, setNovoAvulso] = useState({ data: "", inicio: avulsos.at(-1)?.inicio ?? "08:00", fim: avulsos.at(-1)?.fim ?? "14:00" });
  return (
    <>
      <Bloco titulo="Horário de funcionamento" texto="Os dias fixos da semana. As vagas vêm do horário de cada profissional, em Equipe. Se você não atende toda semana, deixe tudo fechado e use os dias avulsos abaixo.">
        <EditorSemana valor={n.horario} onMudar={(h) => muda({ horario: h })} />
      </Bloco>
      <Bloco titulo="Dias avulsos de atendimento" texto="Para quem atende só em algumas datas (ex.: um sábado por mês). Abre o dia escolhido, no horário escolhido, para toda a equipe.">
        <div className="pn-lista" style={{ margin: "0 -18px" }}>
          {avulsos.length === 0 && <p style={{ padding: "0 18px", color: "var(--c-texto-3)", fontSize: 14 }}>Nenhum dia avulso marcado.</p>}
          {avulsos.map((a) => (
            <div key={a.data} className="pn-linha">
              <Icone nome="agendaOk" />
              <span className="pn-linha-info">
                <strong>{capitalizar(dataCurta(a.data))}</strong>
                <small>
                  {a.inicio}–{a.fim}
                </small>
              </span>
              <BotaoIcone icone="apagar" rotulo="Remover" onClick={() => muda({ aberturas: n.aberturas.filter((x) => x.data !== a.data) })} />
            </div>
          ))}
        </div>
        <div className="ui-grade-campos duas">
          <Entrada type="date" min={hoje} value={novoAvulso.data} onChange={(e) => setNovoAvulso({ ...novoAvulso, data: e.target.value })} />
          <div style={{ display: "flex", gap: 8 }}>
            <Entrada type="time" step={600} value={novoAvulso.inicio} onChange={(e) => setNovoAvulso({ ...novoAvulso, inicio: e.target.value })} aria-label="Das" />
            <Entrada type="time" step={600} value={novoAvulso.fim} onChange={(e) => setNovoAvulso({ ...novoAvulso, fim: e.target.value })} aria-label="Até" />
            <Botao
              variante="secundario"
              disabled={!novoAvulso.data || novoAvulso.fim <= novoAvulso.inicio}
              onClick={() => {
                muda({ aberturas: [...n.aberturas.filter((x) => x.data !== novoAvulso.data), { ...novoAvulso }] });
                setNovoAvulso({ ...novoAvulso, data: "" });
              }}
            >
              Abrir
            </Botao>
          </div>
        </div>
      </Bloco>
      <Bloco titulo="Feriados e dias fechados" texto="Nesses dias ninguém consegue marcar.">
        <div className="pn-lista" style={{ margin: "0 -18px" }}>
          {lista.length === 0 && <p style={{ padding: "0 18px", color: "var(--c-texto-3)", fontSize: 14 }}>Nenhuma data marcada.</p>}
          {lista.map((d) => (
            <div key={d.data} className="pn-linha" style={{ opacity: d.data < hoje ? 0.5 : 1 }}>
              <Icone nome="agendaX" />
              <span className="pn-linha-info">
                <strong>{d.rotulo || "Fechado"}</strong>
                <small>{dataCurta(d.data)} {d.data.slice(0, 4)}</small>
              </span>
              <BotaoIcone icone="apagar" rotulo="Remover" onClick={() => muda({ datasEspeciais: n.datasEspeciais.filter((x) => x.data !== d.data) })} />
            </div>
          ))}
        </div>
        <div className="ui-grade-campos duas">
          <Entrada type="date" value={novaData} onChange={(e) => setNovaData(e.target.value)} />
          <div style={{ display: "flex", gap: 8 }}>
            <Entrada value={novoRotulo} onChange={(e) => setNovoRotulo(e.target.value)} placeholder="Motivo (ex.: Férias)" />
            <Botao
              variante="secundario"
              disabled={!novaData}
              onClick={() => {
                muda({ datasEspeciais: [...n.datasEspeciais.filter((x) => x.data !== novaData), { data: novaData, rotulo: novoRotulo.trim() || "Fechado" }] });
                setNovaData("");
                setNovoRotulo("");
              }}
            >
              Adicionar
            </Botao>
          </div>
        </div>
        <div style={{ display: "grid", gap: 10 }}>
          <Botao
            variante="suave"
            icone="calendario"
            onClick={async () => {
              const ano = Number(hoje.slice(0, 4));
              const [a, c] = await Promise.all([buscarFeriados(ano), buscarFeriados(ano + 1)]);
              setFeriados([...a.feriados, ...c.feriados].filter((f) => f.data >= hoje).slice(0, 14));
              setFonte(a.fonte === "brasilapi" ? "BrasilAPI" : "calendário oficial (cálculo local)");
            }}
          >
            Buscar feriados nacionais
          </Botao>
          {feriados && (
            <div style={{ display: "grid", gap: 4 }}>
              <small style={{ color: "var(--c-texto-3)" }}>Fonte: {fonte}. Toque para fechar no dia.</small>
              {feriados.map((f) => {
                const marcado = n.datasEspeciais.some((x) => x.data === f.data);
                return (
                  <label key={f.data} className="pn-check">
                    <input
                      type="checkbox"
                      checked={marcado}
                      onChange={(e) => {
                        muda({ datasEspeciais: e.target.checked ? [...n.datasEspeciais, { data: f.data, rotulo: f.nome }] : n.datasEspeciais.filter((x) => x.data !== f.data) });
                        if (e.target.checked) avisar(`${f.nome} marcado como fechado.`, "info");
                      }}
                    />
                    <span>{f.nome}</span>
                    <small>
                      {dataBr(f.data)}
                      {f.tipo === "facultativo" ? " · facultativo" : ""}
                    </small>
                  </label>
                );
              })}
            </div>
          )}
        </div>
      </Bloco>
    </>
  );
}

function SecaoRegras({ n, muda }: PropsSecao) {
  const r = n.regras;
  const mudaR = (p: Partial<Negocio["regras"]>) => muda({ regras: { ...r, ...p } });
  return (
    <Bloco titulo="Como o cliente agenda" texto="As regras valem para o link. No painel, você sempre pode encaixar.">
      <div className="ui-grade-campos duas">
        <Campo rotulo="Horários de quanto em quanto" ajuda="15 min deixa a agenda mais cheia, sem buracos.">
          <select className="ui-entrada" value={r.intervaloSlotsMin} onChange={(e) => mudaR({ intervaloSlotsMin: Number(e.target.value) })}>
            {[10, 15, 20, 30, 45, 60].map((v) => (
              <option key={v} value={v}>
                A cada {v} min
              </option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Antecedência mínima" ajuda="Evita marcação em cima da hora.">
          <Passo valor={r.antecedenciaMinHoras} passo={1} min={0} max={72} formatar={(v) => (v ? `${v}h antes` : "pode ser já")} onMudar={(v) => mudaR({ antecedenciaMinHoras: v })} />
        </Campo>
        <Campo rotulo="Até quantos dias à frente">
          <Passo valor={r.janelaMaxDias} passo={5} min={5} max={180} formatar={(v) => `${v} dias`} onMudar={(v) => mudaR({ janelaMaxDias: v })} />
        </Campo>
        <Campo rotulo="Cancelar ou remarcar pelo link até">
          <Passo valor={r.cancelamentoAteHoras} passo={1} min={0} max={72} formatar={(v) => (v ? `${v}h antes` : "a qualquer hora")} onMudar={(v) => mudaR({ cancelamentoAteHoras: v })} />
        </Campo>
      </div>
      <div>
        <div className="pn-opcao">
          <div>
            <strong>Eu aprovo cada agendamento</strong>
            <small>Desligado, o horário já entra confirmado. Ligado, entra “a confirmar”.</small>
          </div>
          <Interruptor ligado={r.confirmacao === "manual"} onMudar={(v) => mudaR({ confirmacao: v ? "manual" : "automatica" })} rotulo="Aprovação manual" />
        </div>
        <div className="pn-opcao">
          <div>
            <strong>Cliente escolhe o profissional</strong>
            <small>Desligado, o sistema distribui entre a equipe.</small>
          </div>
          <Interruptor ligado={r.escolherProfissional} onMudar={(v) => mudaR({ escolherProfissional: v })} rotulo="Escolher profissional" />
        </div>
        <div className="pn-opcao">
          <div>
            <strong>Vários serviços no mesmo horário</strong>
            <small>Ex.: corte + barba — o tempo é somado.</small>
          </div>
          <Interruptor ligado={r.multiplosServicos} onMudar={(v) => mudaR({ multiplosServicos: v })} rotulo="Vários serviços" />
        </div>
      </div>
      <Campo rotulo="Fuso horário">
        <select className="ui-entrada" value={r.fuso} onChange={(e) => mudaR({ fuso: e.target.value })}>
          {[
            ["America/Fortaleza", "Nordeste (Fortaleza, Recife, Salvador)"],
            ["America/Sao_Paulo", "Brasília (SP, RJ, MG, Sul)"],
            ["America/Belem", "Pará e Amapá"],
            ["America/Manaus", "Amazonas, MT, MS, RO, RR"],
            ["America/Rio_Branco", "Acre"],
            ["America/Noronha", "Fernando de Noronha"],
          ].map(([v, t]) => (
            <option key={v} value={v}>
              {t}
            </option>
          ))}
        </select>
      </Campo>
    </Bloco>
  );
}

function SecaoContato({ n, muda }: PropsSecao) {
  const e = n.endereco;
  const mudaE = (p: Partial<Negocio["endereco"]>) => muda({ endereco: { ...e, ...p } });
  const [buscando, setBuscando] = useState(false);
  return (
    <>
      <Bloco titulo="Contato">
        <div className="ui-grade-campos duas">
          <Campo rotulo="WhatsApp do negócio" ajuda="Onde o cliente fala com você.">
            <Entrada inputMode="tel" value={mascaraTelefone(n.contato.whatsapp)} onChange={(x) => muda({ contato: { ...n.contato, whatsapp: x.target.value.replace(/\D/g, "") } })} icone="whatsapp" />
          </Campo>
          <Campo rotulo="Instagram" opcional>
            <Entrada value={n.contato.instagram} onChange={(x) => muda({ contato: { ...n.contato, instagram: x.target.value.replace(/^@/, "") } })} placeholder="seunegocio" icone="instagram" />
          </Campo>
          <Campo rotulo="E-mail" opcional>
            <Entrada type="email" value={n.contato.email} onChange={(x) => muda({ contato: { ...n.contato, email: x.target.value } })} />
          </Campo>
          <Campo rotulo="Telefone fixo" opcional>
            <Entrada inputMode="tel" value={mascaraTelefone(n.contato.telefone)} onChange={(x) => muda({ contato: { ...n.contato, telefone: x.target.value.replace(/\D/g, "") } })} />
          </Campo>
        </div>
      </Bloco>
      <Bloco titulo="Endereço" texto="Vira o botão “Como chegar” e vai no lembrete.">
        <div className="ui-grade-campos duas">
          <Campo rotulo="CEP" ajuda={buscando ? "Buscando endereço…" : "Preenche o resto sozinho."}>
            <Entrada
              inputMode="numeric"
              value={mascaraCep(e.cep)}
              onChange={async (x) => {
                const cep = mascaraCep(x.target.value);
                mudaE({ cep });
                if (cep.replace(/\D/g, "").length === 8) {
                  setBuscando(true);
                  const r = await buscarCep(cep);
                  setBuscando(false);
                  if (r) muda({ endereco: { ...e, cep, rua: r.rua || e.rua, bairro: r.bairro || e.bairro, cidade: r.cidade, uf: r.uf } });
                }
              }}
            />
          </Campo>
          <Campo rotulo="Rua">
            <Entrada value={e.rua} onChange={(x) => mudaE({ rua: x.target.value })} />
          </Campo>
          <Campo rotulo="Número">
            <Entrada value={e.numero} onChange={(x) => mudaE({ numero: x.target.value })} />
          </Campo>
          <Campo rotulo="Complemento" opcional>
            <Entrada value={e.complemento} onChange={(x) => mudaE({ complemento: x.target.value })} />
          </Campo>
          <Campo rotulo="Bairro">
            <Entrada value={e.bairro} onChange={(x) => mudaE({ bairro: x.target.value })} />
          </Campo>
          <Campo rotulo="Cidade / UF">
            <div style={{ display: "flex", gap: 8 }}>
              <Entrada value={e.cidade} onChange={(x) => mudaE({ cidade: x.target.value })} />
              <Entrada value={e.uf} onChange={(x) => mudaE({ uf: x.target.value.toUpperCase().slice(0, 2) })} style={{ width: 64 }} />
            </div>
          </Campo>
        </div>
        <Campo rotulo="Ponto de referência" opcional>
          <Entrada value={e.referencia} onChange={(x) => mudaE({ referencia: x.target.value })} />
        </Campo>
      </Bloco>
    </>
  );
}

function SecaoPagamentos({ n, muda }: PropsSecao) {
  const b = useBanco();
  return (
    <>
      <Bloco titulo="Chave Pix" texto="Usada no sinal e no comprovante. Sem chave, o Pix não aparece para o cliente.">
        <Campo rotulo="Chave">
          <Entrada value={n.pix.chave} onChange={(e) => muda({ pix: { ...n.pix, chave: e.target.value } })} placeholder="CPF, CNPJ, e-mail, telefone ou chave aleatória" icone="pix" />
        </Campo>
        <div className="ui-grade-campos duas">
          <Campo rotulo="Nome do recebedor">
            <Entrada value={n.pix.nome} onChange={(e) => muda({ pix: { ...n.pix, nome: e.target.value } })} />
          </Campo>
          <Campo rotulo="Cidade">
            <Entrada value={n.pix.cidade} onChange={(e) => muda({ pix: { ...n.pix, cidade: e.target.value } })} />
          </Campo>
        </div>
      </Bloco>
      {n.modulos.sinal && (
        <Bloco titulo="Sinal para garantir o horário" texto="O cliente paga uma parte por Pix ao marcar. Reduz falta em serviço longo.">
          <Campo rotulo="Percentual do sinal">
            <Passo valor={n.sinal.percentual} passo={5} min={5} max={100} formatar={(v) => `${v}%`} onMudar={(v) => muda({ sinal: { ...n.sinal, percentual: v } })} />
          </Campo>
          <div className="pn-checks">
            {b.servicos
              .filter((s) => s.ativo)
              .map((s) => (
                <label key={s.id} className="pn-check">
                  <input
                    type="checkbox"
                    checked={n.sinal.servicosIds.includes(s.id)}
                    onChange={(e) => muda({ sinal: { ...n.sinal, servicosIds: e.target.checked ? [...n.sinal.servicosIds, s.id] : n.sinal.servicosIds.filter((x) => x !== s.id) } })}
                  />
                  <span>{s.nome}</span>
                  <small>sinal de {brl((s.preco * n.sinal.percentual) / 100)}</small>
                </label>
              ))}
          </div>
        </Bloco>
      )}
      <Bloco titulo="Meta de faturamento do mês" texto="Aparece no Início e no Financeiro, com o quanto falta.">
        <Entrada inputMode="numeric" value={formatarValorCampo(n.metaMensal)} onChange={(e) => muda({ metaMensal: centavosParaReais(e.target.value) })} icone="dinheiro" />
      </Bloco>
    </>
  );
}

function SecaoModulos({ n, muda }: PropsSecao) {
  const confirmar = useConfirmar();
  return (
    <>
      <Bloco titulo="Tipo de negócio" texto="Ao trocar, sugerimos as funções que costumam fazer sentido. Você ajusta depois.">
        <select
          className="ui-entrada"
          value={n.nicho}
          onChange={async (e) => {
            const nicho = e.target.value as Negocio["nicho"];
            const ok = await confirmar({ titulo: "Aplicar as funções sugeridas?", texto: "As funções abaixo são ligadas ou desligadas conforme o tipo de negócio.", confirmar: "Aplicar" });
            muda(ok ? { nicho, modulos: modulosDoNicho(nicho) } : { nicho });
          }}
        >
          {NICHOS.map((x) => (
            <option key={x.id} value={x.id}>
              {x.nome}
            </option>
          ))}
        </select>
      </Bloco>
      <Bloco titulo="Funções" texto="Cada negócio usa o que precisa. Desligar esconde a função — os dados ficam guardados.">
        <div>
          {MODULOS.map((m) => (
            <div key={m.id} className="pn-opcao">
              <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                <span className="ini-atencao-icone" style={{ width: 36, height: 36, background: n.modulos[m.id] ? "var(--c-marca-sutil)" : "var(--c-sutil)", color: n.modulos[m.id] ? "var(--c-marca-tinta)" : "var(--c-texto-3)" }}>
                  <Icone nome={m.icone as NomeIcone} tamanho={18} />
                </span>
                <div>
                  <strong>{m.nome}</strong>
                  <small>{m.descricao}</small>
                </div>
              </div>
              <Interruptor ligado={n.modulos[m.id]} onMudar={(v) => muda({ modulos: { ...n.modulos, [m.id]: v } })} rotulo={m.nome} />
            </div>
          ))}
        </div>
      </Bloco>
    </>
  );
}

function SecaoCupons() {
  const b = useBanco();
  const { mudar } = useLoja();
  const avisar = useAvisos();
  const [novo, setNovo] = useState<Cupom>({ id: novoId("cp"), codigo: "", tipo: "percentual", valor: 10, ativo: true, validoAte: null, usos: 0 });
  return (
    <Bloco titulo="Cupons de desconto" texto="O cliente digita o código ao agendar pelo link.">
      <div className="pn-lista" style={{ margin: "0 -18px" }}>
        {b.cupons.map((c) => (
          <div key={c.id} className="pn-linha">
            <Icone nome="cupom" />
            <span className="pn-linha-info">
              <strong style={{ fontFamily: "var(--f-mono)" }}>{c.codigo}</strong>
              <small>
                {c.tipo === "percentual" ? `${c.valor}% de desconto` : `${brl(c.valor)} de desconto`} · usado {c.usos}×
              </small>
            </span>
            <Interruptor ligado={c.ativo} onMudar={(v) => mudar((x) => salvarCupom(x, { ...c, ativo: v }))} rotulo="Ativo" />
            <BotaoIcone icone="apagar" rotulo="Apagar" onClick={() => mudar((x) => removerCupom(x, c.id))} />
          </div>
        ))}
      </div>
      <div className="ui-grade-campos duas">
        <Entrada value={novo.codigo} onChange={(e) => setNovo({ ...novo, codigo: e.target.value.toUpperCase().replace(/\s/g, "") })} placeholder="CÓDIGO" />
        <div style={{ display: "flex", gap: 8 }}>
          <select className="ui-entrada" style={{ width: 110 }} value={novo.tipo} onChange={(e) => setNovo({ ...novo, tipo: e.target.value as Cupom["tipo"] })}>
            <option value="percentual">%</option>
            <option value="valor">R$</option>
          </select>
          <Entrada inputMode="numeric" value={String(novo.valor)} onChange={(e) => setNovo({ ...novo, valor: Number(e.target.value.replace(/\D/g, "")) || 0 })} />
          <Botao
            variante="principal"
            disabled={!novo.codigo || !novo.valor}
            onClick={() => {
              if (b.cupons.some((c) => c.codigo === novo.codigo)) return avisar("Já existe um cupom com esse código.", "erro");
              mudar((x) => salvarCupom(x, novo));
              setNovo({ ...novo, id: novoId("cp"), codigo: "" });
            }}
          >
            Criar
          </Botao>
        </div>
      </div>
    </Bloco>
  );
}

function SecaoAvaliacoes() {
  const b = useBanco();
  const { mudar } = useLoja();
  const lista = b.depoimentos.slice().sort((a, c) => Number(a.visivel) - Number(c.visivel) || (a.data > c.data ? -1 : 1));
  return (
    <Bloco titulo="Avaliações dos clientes" texto="Chegam pelo link depois do atendimento. Só aparecem na página depois que você aprova.">
      <div className="pn-lista" style={{ margin: "0 -18px" }}>
        {lista.map((d) => (
          <div key={d.id} className="pn-linha" style={{ alignItems: "flex-start" }}>
            <div className="pn-linha-info" style={{ display: "grid", gap: 4 }}>
              <span style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <strong style={{ display: "inline" }}>{d.nome}</strong>
                <Estrelas nota={d.nota} />
                {!d.visivel && <Selo tom="atencao">Aguardando aprovação</Selo>}
              </span>
              <span style={{ fontSize: 14, whiteSpace: "normal" }}>“{d.texto}”</span>
              <small>
                {d.servico} · {dataBr(d.data)}
              </small>
            </div>
            <Interruptor ligado={d.visivel} onMudar={(v) => mudar((x) => salvarDepoimento(x, { ...d, visivel: v }))} rotulo="Mostrar na página" />
          </div>
        ))}
      </div>
    </Bloco>
  );
}

function SecaoConta() {
  const { sessao } = usePainel();
  return (
    <>
      <Bloco titulo="Sua conta">
        <div style={{ display: "grid", gap: 6, fontSize: 14 }}>
          <span>
            <b>{sessao.nome}</b> · {sessao.email}
          </span>
          <span style={{ color: "var(--c-texto-2)" }}>
            Conta conectada à Livo.
          </span>
        </div>
        <Botao variante="secundario" icone="sair" onClick={() => sair()}>
          Sair
        </Botao>
      </Bloco>
    </>
  );
}
