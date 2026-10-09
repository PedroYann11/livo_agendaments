import Link from "next/link";
import { Icone, type NomeIcone } from "@/components/ui/Icone";
import { MODULOS, NICHOS, modulosDoNicho } from "@/lib/padroes";

// O mesmo sistema para todos: cada tipo de negócio já nasce com as funções
// que fazem sentido para ele, e o dono liga ou desliga o resto no painel.
const PADRAO = new Set(["financeiro", "retorno", "avaliacoes", "aniversarios"]);
const nichos = NICHOS.filter((n) => n.id !== "outro").map((n) => {
  const extras = MODULOS.filter((m) => modulosDoNicho(n.id)[m.id] && !PADRAO.has(m.id)).map((m) => m.nome.toLowerCase());
  return { nome: n.nome, funcoes: extras.length ? `Agenda + ${extras.join(", ")}` : "Agenda, lembretes e financeiro" };
});

const RECURSOS: { icone: NomeIcone; titulo: string; texto: string }[] = [
  { icone: "navegador", titulo: "Link com a sua cara", texto: "Página com as cores, a fonte e o jeito do seu negócio — não um formulário genérico." },
  { icone: "agenda", titulo: "Agenda que se lê num olhar", texto: "Uma coluna por profissional, buracos livres à vista, encaixe em dois toques." },
  { icone: "whatsapp", titulo: "Lembretes no WhatsApp", texto: "Confirmação, véspera, aniversário e “hora de voltar” prontos para enviar." },
  { icone: "ficha", titulo: "Ficha de anamnese", texto: "O cliente preenche no celular antes de chegar. Alertas para quem atende." },
  { icone: "financeiro", titulo: "Financeiro e comissões", texto: "Entradas, despesas, meta do mês e comissão de cada um, sem planilha." },
  { icone: "relatorios", titulo: "Relatórios que respondem", texto: "Ocupação, faltas, o serviço que mais rende por hora e quando a agenda esvazia." },
];

export default function Inicio() {
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
          <Link href="/painel/criar-conta" className="ui-botao ui-botao-principal ui-botao-g">
            Quero minha agenda <Icone nome="avancar" tamanho={18} />
          </Link>
          <Link href="/painel/entrar" className="ui-botao ui-botao-secundario ui-botao-g">
            Já tenho conta
          </Link>
        </div>
      </section>

      <section aria-label="Tipos de negócio">
        <p className="li-rotulo">Um sistema, vários tipos de negócio</p>
        <div className="li-nichos">
          {nichos.map((n) => (
            <div key={n.nome} className="li-nicho">
              <strong>{n.nome}</strong>
              <span>{n.funcoes}</span>
            </div>
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
