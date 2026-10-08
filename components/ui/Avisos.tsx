"use client";

// Origem: livo@d74d591 · components/ui/Avisos.tsx + Dialogo.tsx
// Toasts que entram e saem pelo mesmo lado, e confirmação sem confirm() nativo.

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Icone } from "./Icone";
import { Botao } from "./basicos";

type TipoAviso = "ok" | "erro" | "info";
type Aviso = { id: number; tipo: TipoAviso; texto: string; acao?: { rotulo: string; fazer: () => void } };
type Avisar = (texto: string, tipo?: TipoAviso, acao?: Aviso["acao"]) => void;

type Pergunta = {
  titulo: string;
  texto?: string;
  confirmar: string;
  perigo?: boolean;
  resolver: (ok: boolean) => void;
};
type Confirmar = (p: Omit<Pergunta, "resolver">) => Promise<boolean>;

const AvisosCtx = createContext<Avisar>(() => {});
const DialogoCtx = createContext<Confirmar>(async () => false);

export function Provedores({ children }: { children: ReactNode }) {
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [pergunta, setPergunta] = useState<Pergunta | null>(null);
  const seq = useRef(0);

  const avisar = useCallback<Avisar>((texto, tipo = "ok", acao) => {
    const id = ++seq.current;
    setAvisos((a) => [...a.slice(-2), { id, tipo, texto, acao }]);
    setTimeout(() => setAvisos((a) => a.filter((x) => x.id !== id)), acao ? 6000 : 3200);
  }, []);

  const confirmar = useCallback<Confirmar>(
    (p) => new Promise<boolean>((resolver) => setPergunta({ ...p, resolver })),
    [],
  );

  const responder = (ok: boolean) => {
    pergunta?.resolver(ok);
    setPergunta(null);
  };

  return (
    <AvisosCtx.Provider value={avisar}>
      <DialogoCtx.Provider value={confirmar}>
        {children}
        <div className="ui-avisos" aria-live="polite">
          <AnimatePresence initial={false}>
            {avisos.map((a) => (
              <motion.div
                key={a.id}
                layout
                className={`ui-aviso ui-aviso-${a.tipo}`}
                initial={{ opacity: 0, y: 16, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 16, scale: 0.96 }}
                transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
              >
                <Icone nome={a.tipo === "erro" ? "alerta" : a.tipo === "info" ? "info" : "okCirculo"} tamanho={18} peso="fill" />
                <span>{a.texto}</span>
                {a.acao && (
                  <button
                    type="button"
                    onClick={() => {
                      a.acao!.fazer();
                      setAvisos((x) => x.filter((y) => y.id !== a.id));
                    }}
                  >
                    {a.acao.rotulo}
                  </button>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
        <AnimatePresence>
          {pergunta && (
            <div className="ui-dialogo-raiz">
              <motion.div className="ui-folha-veu" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => responder(false)} />
              <motion.div
                role="alertdialog"
                aria-modal="true"
                aria-label={pergunta.titulo}
                className="ui-dialogo"
                initial={{ opacity: 0, scale: 0.96, y: 8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
              >
                <h2>{pergunta.titulo}</h2>
                {pergunta.texto && <p>{pergunta.texto}</p>}
                <div className="ui-dialogo-acoes">
                  <Botao variante="fantasma" onClick={() => responder(false)}>
                    Voltar
                  </Botao>
                  <Botao variante={pergunta.perigo ? "perigo" : "principal"} onClick={() => responder(true)} autoFocus>
                    {pergunta.confirmar}
                  </Botao>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </DialogoCtx.Provider>
    </AvisosCtx.Provider>
  );
}

export function useAvisos(): Avisar {
  return useContext(AvisosCtx);
}

export function useConfirmar(): Confirmar {
  return useContext(DialogoCtx);
}
