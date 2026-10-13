"use client";

// =====================================================================
// Enviar fotos no painel: uma foto (a sua, a de alguém da equipe) ou a
// galeria do espaço. A foto é preparada e enviada na hora; o endereço só
// entra na página quando a pessoa salva (o rascunho das Configurações).
// =====================================================================

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useLoja } from "@/lib/dados/loja";
import { Icone } from "@/components/ui/Icone";
import { BotaoIcone, Interruptor } from "@/components/ui/basicos";
import { ErroFoto, enviarFoto, type PastaFoto } from "@/lib/fotos";
import { MAX_GALERIA } from "@/lib/padroes";

/**
 * O valor da última renderização. O que termina depois de um envio (alguns
 * segundos) usa os dados de agora — não os de quando começou, que podiam
 * desfazer o que a pessoa mudou nesse meio-tempo (a legenda, outra foto).
 */
function useAtual<T>(valor: T) {
  const ref = useRef(valor);
  useLayoutEffect(() => {
    ref.current = valor;
  });
  return ref;
}

function useEnvio(pasta: PastaFoto) {
  const { remoto, banco } = useLoja();
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const enviar = async (arquivo: File): Promise<string | null> => {
    setErro(null);
    setEnviando(true);
    try {
      return await enviarFoto({ remoto, negocioId: banco!.negocio.id, pasta, arquivo });
    } catch (e) {
      setErro(e instanceof ErroFoto ? e.message : "Não deu para enviar a foto. Tente de novo.");
      return null;
    } finally {
      setEnviando(false);
    }
  };
  return { enviar, enviando, erro };
}

/** Uma foto: prévia, enviar/trocar e remover. */
export function CampoFoto({
  url,
  pasta,
  onMudar,
  formato = "retrato",
  rotulo = "Enviar foto",
  vazio,
}: {
  url: string | null;
  pasta: PastaFoto;
  onMudar: (url: string | null) => void;
  /** retrato: 4:5, cantos arredondados · redondo: a foto da equipe */
  formato?: "retrato" | "redondo";
  rotulo?: string;
  /** o que aparece sem foto (ex.: as iniciais na cor da pessoa) */
  vazio?: ReactNode;
}) {
  const { enviar, enviando, erro } = useEnvio(pasta);
  const mudar = useAtual(onMudar);
  return (
    <div className="cf-foto">
      <div className={`cf-foto-previa ${formato}${enviando ? " enviando" : ""}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {url ? <img src={url} alt="" /> : (vazio ?? <Icone nome="imagem" tamanho={formato === "redondo" ? 20 : 26} />)}
        {enviando && <Icone nome="carregando" tamanho={22} className="ui-girando" />}
      </div>
      <div className="cf-foto-acoes">
        <label className={`ui-botao ui-botao-secundario ui-botao-m${enviando ? " desligado" : ""}`}>
          <Icone nome="imagem" tamanho={18} /> {enviando ? "Enviando…" : url ? "Trocar foto" : rotulo}
          <input
            type="file"
            accept="image/*"
            hidden
            disabled={enviando}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              const nova = await enviar(f);
              if (nova) mudar.current(nova);
            }}
          />
        </label>
        {url && !enviando && (
          <button type="button" className="ui-botao ui-botao-fantasma ui-botao-m" onClick={() => onMudar(null)}>
            Remover
          </button>
        )}
        {erro && (
          <span className="ui-campo-erro" role="alert">
            {erro}
          </span>
        )}
      </div>
    </div>
  );
}

/** As fotos do espaço: até 6, na ordem em que aparecem na página. */
export function EditorGaleria({ fotos, onMudar }: { fotos: string[]; onMudar: (fotos: string[]) => void }) {
  const { enviar, enviando, erro } = useEnvio("galeria");
  const cabe = MAX_GALERIA - fotos.length;
  const mover = (i: number, d: number) => {
    const nova = [...fotos];
    [nova[i], nova[i + d]] = [nova[i + d], nova[i]];
    onMudar(nova);
  };
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div className="cf-galeria">
        {fotos.map((url, i) => (
          <div key={url} className="cf-galeria-item">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={`Foto ${i + 1}`} />
            <div className="cf-galeria-botoes">
              {i > 0 && <BotaoIcone icone="esquerda" rotulo={`Mover a foto ${i + 1} para antes`} tamanho={15} onClick={() => mover(i, -1)} />}
              {i < fotos.length - 1 && <BotaoIcone icone="direita" rotulo={`Mover a foto ${i + 1} para depois`} tamanho={15} onClick={() => mover(i, 1)} />}
              <BotaoIcone icone="apagar" rotulo={`Remover a foto ${i + 1}`} tamanho={15} onClick={() => onMudar(fotos.filter((x) => x !== url))} />
            </div>
          </div>
        ))}
        {cabe > 0 && (
          <label className={`cf-galeria-mais${enviando ? " enviando" : ""}`}>
            <Icone nome={enviando ? "carregando" : "mais"} tamanho={22} className={enviando ? "ui-girando" : undefined} />
            <span>{enviando ? "Enviando…" : "Adicionar"}</span>
            <input
              type="file"
              accept="image/*"
              multiple
              hidden
              disabled={enviando}
              onChange={async (e) => {
                const escolhidas = [...(e.target.files ?? [])].slice(0, cabe);
                e.target.value = "";
                let lista = fotos;
                for (const f of escolhidas) {
                  const nova = await enviar(f);
                  if (!nova) break;
                  lista = [...lista, nova];
                  onMudar(lista);
                }
              }}
            />
          </label>
        )}
      </div>
      <small style={{ color: "var(--c-texto-3)", fontSize: 12.5 }}>
        {fotos.length} de {MAX_GALERIA}
      </small>
      {erro && (
        <span className="ui-campo-erro" role="alert">
          {erro}
        </span>
      )}
    </div>
  );
}

/** "Tirar o fundo" de uma foto (topo ou Sobre): recorta no navegador e envia o recorte. */
export function TirarFundo({ url, semFundo, onMudar }: { url: string; semFundo: string | null; onMudar: (semFundo: string | null) => void }) {
  const { remoto, banco } = useLoja();
  const [etapa, setEtapa] = useState<"parado" | "recortando" | "enviando">("parado");
  const [erro, setErro] = useState<string | null>(null);
  const ocupado = etapa !== "parado";
  const mudar = useAtual(onMudar);
  const fotoAtual = useAtual(url);

  const recortar = async () => {
    const origem = url;
    setErro(null);
    setEtapa("recortando");
    try {
      const { tirarFundo } = await import("@/lib/recorte");
      const blob = await tirarFundo(origem);
      // a foto foi trocada enquanto recortava: este recorte já não serve
      if (fotoAtual.current !== origem) return;
      if (!blob) {
        setErro("Não achei uma pessoa nessa foto. Tente uma em que você apareça de frente.");
        return;
      }
      setEtapa("enviando");
      const { enviarRecorte } = await import("@/lib/fotos");
      const recorte = await enviarRecorte({ remoto, negocioId: banco!.negocio.id, blob });
      if (fotoAtual.current === origem) mudar.current(recorte);
    } catch (e) {
      setErro(e instanceof ErroFoto ? e.message : "Não deu para tirar o fundo. Confira a internet e tente de novo.");
    } finally {
      setEtapa("parado");
    }
  };

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <Interruptor
        ligado={!!semFundo || ocupado}
        onMudar={(v) => (v ? void recortar() : onMudar(null))}
        rotulo="Tirar o fundo"
        mostrarRotulo
        desabilitado={ocupado}
      />
      {ocupado && (
        <span className="cf-recorte-estado" role="status">
          <Icone nome="carregando" tamanho={16} className="ui-girando" />
          {etapa === "recortando" ? "Tirando o fundo… (na primeira vez demora um pouco mais)" : "Enviando…"}
        </span>
      )}
      {semFundo && !ocupado && (
        <span className="cf-recorte-previa">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={semFundo} alt="A foto sem o fundo" />
        </span>
      )}
      {erro && (
        <span className="ui-campo-erro" role="alert">
          {erro}
        </span>
      )}
    </div>
  );
}
