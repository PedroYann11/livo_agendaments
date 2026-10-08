"use client";

// A tela que o cliente vê depois de marcar. É o momento de "deu certo" —
// o único lugar do fluxo com uma celebração (o check que se desenha).

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import QRCode from "qrcode";
import { useLoja } from "@/lib/dados/loja";
import type { Agendamento, Banco } from "@/lib/tipos";
import { Icone } from "@/components/ui/Icone";
import { Botao, BotaoCopiar } from "@/components/ui/basicos";
import { brl, duracao, primeiroNome } from "@/lib/formato";
import { dataLonga, dataDe, horaDe } from "@/lib/datas";
import { baixarIcs, gerarIcs, linkGoogleAgenda } from "@/lib/ics";
import { enderecoTexto, linkWhatsApp } from "@/lib/whatsapp";
import { gerarPixCopiaECola } from "@/lib/pix";
import { capitalizar } from "@/components/vitrine/util";

const SAIDA = [0.23, 1, 0.32, 1] as const;

export function SeloAnimado({ espera = false }: { espera?: boolean }) {
  return (
    <motion.div
      className={`ok-selo${espera ? " espera" : ""}`}
      initial={{ scale: 0.6, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 260, damping: 18 }}
    >
      <motion.span className="ok-anel" initial={{ scale: 0.8, opacity: 0.9 }} animate={{ scale: 1.5, opacity: 0 }} transition={{ duration: 1.1, ease: SAIDA, delay: 0.2 }} />
      <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
        {espera ? (
          <motion.path
            d="M22 10v12l8 5"
            stroke="currentColor"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.6, delay: 0.25, ease: SAIDA }}
          />
        ) : (
          <motion.path
            d="M11 23.5l7 7L33 15"
            stroke="currentColor"
            strokeWidth="3.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.55, delay: 0.25, ease: SAIDA }}
          />
        )}
      </svg>
    </motion.div>
  );
}

export function dadosIcs(b: Banco, ag: Agendamento) {
  return {
    uid: ag.id,
    titulo: `${ag.itens.map((i) => i.nome).join(" + ")} · ${b.negocio.nome}`,
    descricao: `Gerenciar: ${typeof window !== "undefined" ? window.location.origin : ""}/${b.negocio.slug}/a/${ag.token}`,
    local: enderecoTexto(b),
    inicio: ag.inicio,
    fim: ag.fim,
    fuso: b.negocio.regras.fuso,
  };
}

export function Confirmado({ ag }: { ag: Agendamento }) {
  const { banco, slug } = useLoja();
  const [qr, setQr] = useState<string | null>(null);
  const b = banco!;
  const n = b.negocio;
  const pro = b.profissionais.find((p) => p.id === ag.profissionalId);
  const cliente = b.clientes.find((c) => c.id === ag.clienteId);
  const espera = ag.status === "pendente";
  const duracaoMin = ag.itens.reduce((s, i) => s + i.duracaoMin, 0);
  const pix =
    ag.sinal && !ag.sinal.pago && n.pix.chave
      ? gerarPixCopiaECola({ chave: n.pix.chave, nome: n.pix.nome || n.nome, cidade: n.pix.cidade || n.endereco.cidade, valor: ag.sinal.valor, txid: ag.token.toUpperCase() })
      : null;

  useEffect(() => {
    if (!pix) return;
    QRCode.toDataURL(pix, { margin: 0, width: 260, color: { dark: "#111111", light: "#ffffff" } }).then(setQr).catch(() => setQr(null));
  }, [pix]);

  const precisaFicha =
    n.modulos.anamnese &&
    ag.itens.some((i) => {
      const s = b.servicos.find((x) => x.id === i.servicoId);
      return s?.fichaId && !b.fichas.some((f) => f.clienteId === ag.clienteId && f.modeloId === s.fichaId);
    });

  const mapa = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${n.nome}, ${enderecoTexto(b)}`)}`;
  const msgNegocio = `Olá, ${n.nome}! Acabei de agendar ${ag.itens.map((i) => i.nome).join(" + ")} para ${dataLonga(dataDe(ag.inicio))}, às ${horaDe(ag.inicio)}. Nome: ${cliente?.nome ?? ""}.`;

  return (
    <div className="ok-tela">
      <SeloAnimado espera={espera} />
      <motion.h1 className="vt-titulo" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35, duration: 0.6, ease: SAIDA }}>
        {espera ? "Horário reservado" : "Tudo certo"}
        {cliente ? `, ${primeiroNome(cliente.nome)}` : ""}!
      </motion.h1>
      <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5, duration: 0.5 }}>
        {espera
          ? `${n.nome} vai confirmar em breve pelo WhatsApp. Seu horário já está guardado.`
          : `Te esperamos. Um dia antes chega um lembrete no seu WhatsApp.`}
      </motion.p>

      <motion.div className="ok-bilhete" initial={{ opacity: 0, y: 24, rotate: -1.5 }} animate={{ opacity: 1, y: 0, rotate: 0 }} transition={{ delay: 0.45, duration: 0.7, ease: SAIDA }}>
        <div className="ok-bilhete-topo">
          <small>{n.nome}</small>
          <div className="ok-bilhete-data">
            {capitalizar(dataLonga(dataDe(ag.inicio)))}
            <br />
            <span>às {horaDe(ag.inicio)}</span>
          </div>
        </div>
        <div className="ok-bilhete-corte" />
        <div className="ok-bilhete-corpo">
          <div className="ag-resumo-linha">
            <Icone nome="servicos" />
            <div>
              <strong>{ag.itens.map((i) => i.nome).join(" + ")}</strong>
              <small>
                {duracao(duracaoMin)}
                {ag.total > 0 ? ` · ${brl(ag.total)}` : ""}
              </small>
            </div>
          </div>
          {pro && (
            <div className="ag-resumo-linha">
              <Icone nome="cliente" />
              <div>
                <strong>{pro.nome}</strong>
                <small>{pro.cargo}</small>
              </div>
            </div>
          )}
          {n.endereco.rua && (
            <div className="ag-resumo-linha">
              <Icone nome="local" />
              <div>
                <strong>
                  {n.endereco.rua}, {n.endereco.numero}
                </strong>
                <small>
                  {n.endereco.bairro} · {n.endereco.cidade}
                </small>
              </div>
            </div>
          )}
        </div>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7, duration: 0.5, ease: SAIDA }}>
        {pix && (
          <div className="ok-bloco">
            <h2>
              <Icone nome="pix" /> Sinal de {brl(ag.sinal!.valor)} via Pix
            </h2>
            <p>Para garantir o horário, pague o sinal. O restante é pago no dia.</p>
            <div className="ok-pix">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {qr && <img src={qr} alt="QR Code do Pix" />}
              <div style={{ display: "grid", gap: 10, minWidth: 0 }}>
                <span className="ok-codigo">{pix}</span>
                <BotaoCopiar texto={pix} rotulo="Copiar código Pix" />
              </div>
            </div>
            {n.contato.whatsapp && (
              <a className="ui-botao ui-botao-secundario ui-botao-m" href={linkWhatsApp(n.contato.whatsapp, `Olá! Paguei o sinal do meu horário de ${dataLonga(dataDe(ag.inicio))} às ${horaDe(ag.inicio)}. Segue o comprovante.`)} target="_blank" rel="noopener noreferrer">
                <Icone nome="whatsapp" tamanho={18} /> Enviar comprovante
              </a>
            )}
          </div>
        )}

        {precisaFicha && (
          <div className="ok-bloco">
            <h2>
              <Icone nome="ficha" /> Ganhe tempo no dia
            </h2>
            <p>Antes do primeiro atendimento, precisamos de algumas informações sobre a sua pele. Leva 2 minutos.</p>
            <Link href={`/${slug}/ficha/${ag.token}`} className="ui-botao ui-botao-principal ui-botao-m">
              Preencher ficha agora
            </Link>
          </div>
        )}

        <div className="ok-acoes">
          <Botao variante="principal" tamanho="g" icone="agendaMais" onClick={() => baixarIcs(`${n.slug}-${dataDe(ag.inicio)}.ics`, gerarIcs(dadosIcs(b, ag)))}>
            Adicionar à minha agenda
          </Botao>
          <a className="ui-botao ui-botao-secundario ui-botao-m" href={linkGoogleAgenda(dadosIcs(b, ag))} target="_blank" rel="noopener noreferrer">
            <Icone nome="calendario" tamanho={18} /> Google Agenda
          </a>
          {n.endereco.rua ? (
            <a className="ui-botao ui-botao-secundario ui-botao-m" href={mapa} target="_blank" rel="noopener noreferrer">
              <Icone nome="local" tamanho={18} /> Como chegar
            </a>
          ) : (
            <span />
          )}
          {n.contato.whatsapp && (
            <a className="ui-botao ui-botao-secundario ui-botao-m" href={linkWhatsApp(n.contato.whatsapp, msgNegocio)} target="_blank" rel="noopener noreferrer">
              <Icone nome="whatsapp" tamanho={18} /> Avisar no WhatsApp
            </a>
          )}
          <Link className="ui-botao ui-botao-fantasma ui-botao-m" href={`/${slug}/a/${ag.token}`}>
            Remarcar ou cancelar
          </Link>
        </div>
        <p className="ag-politica" style={{ textAlign: "center" }}>
          Guarde este link: <Link href={`/${slug}/a/${ag.token}`} style={{ textDecoration: "underline" }}>/{slug}/a/{ag.token}</Link>
        </p>
      </motion.div>
    </div>
  );
}
