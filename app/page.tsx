import type { Metadata } from "next";
import { Archivo } from "next/font/google";
import Link from "next/link";
import { BarraWhatsApp } from "@/components/inicio/BarraWhatsApp";
import { Conversa } from "@/components/inicio/Conversa";
import { HistoriaPainel, type CenaPainel } from "@/components/inicio/HistoriaPainel";
import { Tela } from "@/components/inicio/Tela";
import { Icone } from "@/components/ui/Icone";
import { CLIENTES, INSTAGRAM, LINK_INSTAGRAM, linkWhatsAppLivo, MENSAGENS, PERGUNTAS, WHATSAPP_ESCRITO } from "@/lib/comercial";
import { NICHOS } from "@/lib/padroes";
import "./inicio.css";

// A letra larga do anúncio: só nesta página, só nos títulos de placa.
const letreiro = Archivo({ subsets: ["latin"], axes: ["wdth"], variable: "--f-letreiro", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL("https://agenda.livo.tec.br"),
  title: { absolute: "Livo Agenda · Sua cliente agenda sozinha pelo link" },
  description:
    "Um link para a cliente escolher o serviço e marcar no horário livre, e um painel para você comandar o dia pelo celular. Feito no Ceará.",
  openGraph: {
    title: "Chega de responder “tem horário?”",
    description: "Sua cliente agenda sozinha pelo link. Você recebe o aviso e só atende.",
    url: "https://agenda.livo.tec.br",
    siteName: "Livo Agenda",
    locale: "pt_BR",
    type: "website",
    images: [{ url: "/og-livo-agenda.png", width: 1200, height: 630, alt: "Chega de responder “tem horário?” — Livo Agenda" }],
  },
};

const CENAS_PAINEL: CenaPainel[] = [
  {
    tela: "painel-hoje",
    alt: "Tela inicial do painel com o atendimento de agora e os próximos horários",
    titulo: "Abriu, já sabe como está o dia",
    texto: "Quem está sendo atendido agora, os próximos horários e quanto entra hoje. Cada agendamento novo chega como aviso no celular.",
  },
  {
    tela: "painel-agenda",
    alt: "Agenda da semana com os atendimentos de cada profissional",
    titulo: "A agenda da equipe, sem horário duplicado",
    texto: "Cada profissional com os próprios horários. Dois atendimentos no mesmo horário, com a mesma pessoa, a agenda não deixa marcar.",
  },
  {
    tela: "painel-lembretes",
    alt: "Lista de lembretes de amanhã com o botão Lembrar ao lado de cada cliente",
    titulo: "Lembretes prontos para enviar",
    texto: "Os lembretes de amanhã já vêm escritos. Um toque e o WhatsApp abre com a mensagem para a cliente.",
  },
];

const TIPOS = NICHOS.filter((n) => n.id !== "outro").map((n) => n.nome);

function BotaoWhatsApp({ mensagem, children = "Chamar no WhatsApp" }: { mensagem: string; children?: React.ReactNode }) {
  return (
    <a href={linkWhatsAppLivo(mensagem)} target="_blank" rel="noopener noreferrer" className="lv-botao">
      <Icone nome="whatsapp" tamanho={20} />
      {children}
    </a>
  );
}

export default function Inicio() {
  return (
    <div className={`lv ${letreiro.variable}`}>
      <header className="lv-topo">
        <Link href="/" className="lv-marca" aria-label="Livo Agenda, início">
          <span aria-hidden="true">L</span>
          Livo Agenda
        </Link>
        <Link href="/painel/entrar" className="lv-entrar">
          Entrar
        </Link>
      </header>

      <main>
        <section className="lv-placa" data-esconde-barra>
          <div className="lv-placa-dentro lv-abertura">
            <div className="lv-abertura-texto">
              <h1 className="lv-letreiro">
                <span>Chega de</span> <span>responder</span> <span>“tem horário?”</span>
              </h1>
              <p className="lv-chamada">
                Sua cliente abre o seu link, escolhe o serviço, vê os horários livres e marca sozinha. Você recebe o aviso no celular e só atende.
              </p>
              <div className="lv-acoes">
                <BotaoWhatsApp mensagem={MENSAGENS.topo} />
                <a href="#como-agenda" className="lv-link">
                  Ver como funciona
                </a>
              </div>
            </div>
            <Conversa />
          </div>
        </section>

        <section id="como-agenda" className="lv-secao">
          <div className="lv-secao-cabeca">
            <h2>Do link ao horário marcado, sem trocar mensagem</h2>
            <p>Esta é a página de agendamento da DepiLED, cliente da Livo, como a cliente vê no celular.</p>
          </div>
          <ol className="lv-passos">
            <li>
              <Tela nome="cliente-servico" alt="Lista de procedimentos da DepiLED com preço, duração e desconto aplicado" />
              <h3>Escolhe o procedimento</h3>
              <p>Com preço, duração e o desconto já calculado.</p>
            </li>
            <li>
              <Tela nome="cliente-horario" alt="Calendário do mês e horários livres do sábado" />
              <h3>Vê só o que está livre</h3>
              <p>Os dias e horários vagos de verdade, sem perguntar para ninguém.</p>
            </li>
            <li>
              <Tela nome="cliente-confirmar" alt="Resumo do agendamento com nome, WhatsApp e botão Confirmar" />
              <h3>Confirma com nome e WhatsApp</h3>
              <p>Sem baixar aplicativo e sem criar conta. Remarca pelo mesmo link.</p>
            </li>
          </ol>
          <div className="lv-secao-acao">
            <BotaoWhatsApp mensagem={MENSAGENS.cliente}>Quero isso no meu negócio</BotaoWhatsApp>
          </div>
        </section>

        <section className="lv-secao lv-dono">
          <div className="lv-secao-cabeca">
            <h2>Do seu lado, o dia inteiro no celular</h2>
            <p>Telas do Studio Luz, um negócio de demonstração.</p>
          </div>
          <HistoriaPainel cenas={CENAS_PAINEL} />
          <div className="lv-tambem">
            <h3>Também vem com</h3>
            <ul>
              <li>Link e QR Code para a bio do Instagram</li>
              <li>Página com as cores e a logo do seu negócio</li>
              <li>Promoções automáticas e cupons</li>
              <li>Ficha de anamnese preenchida pela cliente</li>
              <li>Pacotes de sessões</li>
              <li>Comissão de cada profissional</li>
              <li>Financeiro, meta do mês e relatórios</li>
              <li>Dias de atendimento avulsos</li>
            </ul>
          </div>
        </section>

        <section className="lv-secao lv-quem">
          <div className="lv-secao-cabeca">
            <h2>Quem já agenda pela Livo</h2>
          </div>
          {CLIENTES.map((c) => (
            <article key={c.nome} className="lv-cliente">
              <img src={c.logo} alt={c.nome} width={160} height={160} loading="lazy" decoding="async" />
              <div>
                <h3>
                  {c.nome} <span>{c.tipo}</span>
                </h3>
                <p>{c.texto}</p>
                <Link href={c.endereco} className="lv-link">
                  Ver a página da {c.nome}
                </Link>
              </div>
            </article>
          ))}
        </section>

        <section className="lv-secao lv-tipos">
          <div className="lv-secao-cabeca">
            <h2>Para quem atende com hora marcada</h2>
          </div>
          <ul className="lv-tipos-lista">
            {TIPOS.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
          <aside className="lv-arena">
            <div>
              <h3>Tem quadra ou arena?</h3>
              <p>Society, vôlei, beach tennis e futsal, num lugar só ou separados: estamos testando a agenda por quadra.</p>
            </div>
            <a href={linkWhatsAppLivo(MENSAGENS.arena)} target="_blank" rel="noopener noreferrer" className="lv-link">
              Conversar sobre a minha arena
            </a>
          </aside>
        </section>

        <section className="lv-secao lv-contratar" id="contratar">
          <div className="lv-secao-cabeca">
            <h2>Como contratar</h2>
          </div>
          <ol className="lv-etapas">
            <li>
              <h3>Chame no WhatsApp</h3>
              <p>Conte como é o seu negócio e tire as dúvidas.</p>
            </li>
            <li>
              <h3>Combine o plano</h3>
              <p>Valores e forma de pagamento, tudo na mesma conversa.</p>
            </li>
            <li>
              <h3>Receba o seu convite</h3>
              <p>Com ele você cria o acesso ao painel e cadastra serviços e horários. O link já pode ir para a bio.</p>
            </li>
          </ol>
          <div className="lv-secao-acao">
            <BotaoWhatsApp mensagem={MENSAGENS.topo} />
          </div>
        </section>

        <section className="lv-secao lv-duvidas">
          <div className="lv-secao-cabeca">
            <h2>Perguntas que sempre chegam</h2>
          </div>
          <div className="lv-perguntas">
            {PERGUNTAS.map((p) => (
              <details key={p.pergunta}>
                <summary>{p.pergunta}</summary>
                <p>{p.resposta}</p>
              </details>
            ))}
          </div>
          <p className="lv-duvidas-mais">
            Ficou outra?{" "}
            <a href={linkWhatsAppLivo(MENSAGENS.duvida)} target="_blank" rel="noopener noreferrer">
              Pergunte no WhatsApp
            </a>
            .
          </p>
        </section>

        <section className="lv-placa lv-fim" data-esconde-barra>
          <div className="lv-placa-dentro">
            <p className="lv-letreiro">
              <span>Ela agenda.</span> <span>A Livo confirma.</span> <span>Você atende.</span>
            </p>
            <div className="lv-acoes">
              <BotaoWhatsApp mensagem={MENSAGENS.fim} />
              <span className="lv-fim-numero">
                ou salve o número <strong>{WHATSAPP_ESCRITO}</strong>
              </span>
            </div>
          </div>
        </section>
      </main>

      <footer className="lv-rodape">
        <span>Livo Agenda, feito no Ceará.</span>
        <a href={LINK_INSTAGRAM} target="_blank" rel="noopener noreferrer">
          <Icone nome="instagram" tamanho={18} />@{INSTAGRAM}
        </a>
        <Link href="/painel/entrar">Entrar no painel</Link>
      </footer>

      <BarraWhatsApp />
    </div>
  );
}
