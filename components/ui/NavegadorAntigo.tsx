// =====================================================================
// Aviso para navegador antigo (iPhone com iOS anterior ao 16.4).
//
// O código do site é gerado para iOS 16.4 ou mais; num iPhone mais antigo
// ele nem começa e a página fica parada. Este aviso vem pronto no HTML,
// escondido, e dois arquivos pequenos (public/compat) decidem se aparece:
//   moderno.js — só roda em navegador novo e deixa uma marca;
//   aviso.js   — JavaScript antigo; sem a marca, mostra o aviso.
// Não depende do React: é justamente o que não roda nesses aparelhos.
//
// Fica no layout raiz, que nunca é redesenhado ao trocar de tela (o React
// reclama de <script> desenhado no navegador). A página do negócio só
// deixa o botão do WhatsApp dela escondido (ZapDoAviso); o aviso.js o
// leva para dentro do aviso.
// =====================================================================

import { linkWhatsApp } from "@/lib/whatsapp";

/** No começo do <body>: o teste do navegador. */
export function TesteDoNavegador() {
  return <script src="/compat/moderno.js" />;
}

/** No fim do <body>: o aviso (escondido) e quem decide mostrá-lo. */
export function NavegadorAntigo() {
  return (
    <>
      <div id="navegador-antigo" className="navegador-antigo" role="alert" hidden>
        <div>
          <strong>O navegador deste celular está desatualizado</strong>
          <p>Para usar esta página, atualize o sistema do celular.</p>
          <p className="navegador-antigo-como">No iPhone: Ajustes › Geral › Atualização de Software.</p>
        </div>
      </div>
      <script src="/compat/aviso.js" />
    </>
  );
}

/** Página do negócio: o botão do WhatsApp que entra no aviso (só aparece lá). */
export function ZapDoAviso({ whatsapp, nome }: { whatsapp: string; nome: string }) {
  return (
    <a id="navegador-antigo-zap" hidden href={linkWhatsApp(whatsapp, `Olá, ${nome}! Queria marcar um horário.`)} target="_blank" rel="noopener noreferrer">
      Agendar pelo WhatsApp
    </a>
  );
}
