import Link from "next/link";
import { Icone, type NomeIcone } from "@/components/ui/Icone";
import { DEMOS } from "@/lib/demo/negocios";
import { textoSobre } from "@/lib/cor";

const NICHO: Record<string, string> = {
  ambar: "Clínica de depilação",
  navalha: "Barbearia",
  jade: "Nail designer (MEI)",
};

const RECURSOS: { icone: NomeIcone; titulo: string; texto: string }[] = [
  { icone: "navegador", titulo: "Link com a sua cara", texto: "Página com as cores, a fonte e o jeito do seu negócio — não um formulário genérico." },
  { icone: "agenda", titulo: "Agenda que se lê num olhar", texto: "Uma coluna por profissional, buracos livres à vista, encaixe em dois toques." },
  { icone: "whatsapp", titulo: "Lembretes no WhatsApp", texto: "Confirmação, véspera, aniversário e “hora de voltar” prontos para enviar." },
  { icone: "ficha", titulo: "Ficha de anamnese", texto: "O cliente preenche no celular antes de chegar. Alertas para quem atende." },
  { icone: "financeiro", titulo: "Financeiro e comissões", texto: "Entradas, despesas, meta do mês e comissão de cada um, sem planilha." },
  { icone: "relatorios", titulo: "Relatórios que respondem", texto: "Ocupação, faltas, o serviço que mais rende por hora e quando a agenda esvazia." },
];

export default function Inicio() {
  const demos = Object.values(DEMOS).map((d) => d.negocio);
  return (
    <main className="li">
      <header className="li-topo">
        <span className="li-marca">
          <span>L</span> Livo Agenda
        </span>
        <Link href="/painel/entrar" className="ui-botao ui-botao-secundario ui-botao-p">
          Entrar
        </Link>
      </header>

      <section className="li-heroi">
        <p className="li-selo">Agendamento online para serviços</p>
        <h1>
          Seus clientes marcam sozinhos.
          <br />
          <em>Você só atende.</em>
        </h1>
        <p className="li-texto">
          Barbearia, clínica, salão, manicure, estética ou consultório: um link para o cliente agendar em menos de um minuto e um painel para você
          comandar o dia pelo celular.
        </p>
        <div className="li-acoes">
          <Link href="/painel/entrar" className="ui-botao ui-botao-principal ui-botao-g">
            Ver o painel por dentro <Icone nome="avancar" tamanho={18} />
          </Link>
        </div>
      </section>

      <section className="li-demos" aria-label="Demonstrações">
        <p className="li-rotulo">Veja como fica para o seu cliente</p>
        <div className="li-cartoes">
          {demos.map((d) => (
            <Link
              key={d.slug}
              href={`/${d.slug}`}
              className={`li-demo pele-${d.pele}`}
              style={{ ["--d-fundo" as string]: d.tema.fundo, ["--d-texto" as string]: d.tema.texto, ["--d-marca" as string]: d.tema.marca, ["--d-sobre" as string]: textoSobre(d.tema.marca) }}
            >
              <small>{NICHO[d.slug]}</small>
              <strong>{d.tagline}</strong>
              <span className="li-demo-pe">
                <span>{d.nome}</span>
                <span className="li-demo-botao">
                  Agendar <Icone nome="seta" tamanho={14} />
                </span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="li-recursos">
        {RECURSOS.map((r) => (
          <div key={r.titulo} className="li-recurso">
            <span>
              <Icone nome={r.icone} tamanho={22} />
            </span>
            <strong>{r.titulo}</strong>
            <p>{r.texto}</p>
          </div>
        ))}
      </section>

      <footer className="li-rodape">
        Livo Agenda · feito no Ceará · <Link href="/painel/entrar">Entrar no painel</Link>
      </footer>
    </main>
  );
}
