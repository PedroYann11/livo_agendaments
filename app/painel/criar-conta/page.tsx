"use client";

// Cadastro de quem PAGOU, em dois passos: o negócio e o acesso. Abre só com
// o link de convite que chega depois do pagamento (?convite=…), com o
// e-mail preso ao da compra. A conta nasce no Supabase Auth (o banco recusa
// e-mail sem compra) e o negócio, no primeiro login com o e-mail confirmado
// (negocio_criar_meu gasta a compra — migration 008). Convite de negócio
// PRONTO (009): só o passo do acesso; no primeiro login a pessoa vira dona.
// Quem já tem conta com o e-mail do convite aceita com um botão.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Botao, Campo, Entrada, Esqueleto } from "@/components/ui/basicos";
import { Icone } from "@/components/ui/Icone";
import { AvisoAcesso, CadastroEmBreve, CascaAcesso, PeAcesso, WHATSAPP_LIVO } from "@/components/painel/Acesso";
import { FormNegocio, NEGOCIO_EM_BRANCO, negocioPronto, type EstadoSlug } from "@/components/painel/FormNegocio";
import { aceitarConvite, conferirConvite, contaLogada, criarConta, reenviarConfirmacao, sair, type Convite, type NegocioDoCadastro } from "@/lib/sessao";
import { supabaseOn } from "@/lib/supabase";
import { linkWhatsApp } from "@/lib/whatsapp";

type Passo = "negocio" | "acesso" | "confirmar";

const SENHA_MIN = 8;

export default function CriarConta() {
  const router = useRouter();
  const [passo, setPasso] = useState<Passo>("negocio");
  const [negocio, setNegocio] = useState<NegocioDoCadastro>(NEGOCIO_EM_BRANCO);
  const [slug, setSlug] = useState<EstadoSlug>("vazio");
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [verSenha, setVerSenha] = useState(false);
  const [erros, setErros] = useState<Record<string, string | null>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [reenvio, setReenvio] = useState<"enviando" | "enviado" | null>(null);
  // null = conferindo o convite
  const [convite, setConvite] = useState<Convite | null>(null);
  // já existe uma conta logada neste aparelho
  const [logado, setLogado] = useState<string | null>(null);

  useEffect(() => {
    const codigo = new URLSearchParams(window.location.search).get("convite") ?? "";
    if (!codigo) return setConvite(supabaseOn ? { estado: "invalido" } : { estado: "em_breve" });
    Promise.all([conferirConvite(codigo), contaLogada()]).then(([c, conta]) => {
      if (c.estado === "valido") {
        setEmail(c.email);
        // negócio pronto: não há negócio a descrever, só o acesso (o nome do negócio já serve de nome no painel)
        if (c.negocio) {
          setPasso("acesso");
          setNome(c.negocio.nome);
        }
        if (conta) setLogado(conta.email);
      }
      setConvite(c);
    });
  }, []);

  // o aviso some assim que a pessoa mexe no que estava errado
  const mudarNegocio = (n: NegocioDoCadastro) => {
    setNegocio(n);
    setErros({});
  };

  const continuar = (e: React.FormEvent) => {
    e.preventDefault();
    const faltando = {
      nome: negocio.nome.trim().length < 2 ? "Diga o nome do negócio." : null,
      nicho: negocio.nicho ? null : "Escolha o tipo do negócio.",
      slug: slug === "vazio" ? "Escolha o endereço da sua página." : null,
    };
    setErros(faltando);
    if (!negocioPronto(negocio, slug)) return;
    // começa com o nome do negócio; quem quiser, troca pelo próprio
    if (!nome.trim()) setNome(negocio.nome.trim());
    setPasso("acesso");
  };

  const criar = async (e: React.FormEvent) => {
    e.preventDefault();
    const faltando = {
      // uma conta só do negócio é comum: o nome do negócio também serve
      dono: nome.trim().length < 2 ? "Diga o nome que vai aparecer no painel." : null,
      senha: senha.length < SENHA_MIN ? `Use pelo menos ${SENHA_MIN} caracteres.` : null,
    };
    setErros(faltando);
    setErro(null);
    if (faltando.dono || faltando.senha) return;
    setEnviando(true);
    const pronto = convite?.estado === "valido" && convite.negocio;
    const r = await criarConta({ nome, email, senha, negocio: pronto ? undefined : { ...negocio, slug: negocio.slug.replace(/-+$/g, "") } });
    setEnviando(false);
    if (!r.ok) {
      if (r.campo === "slug") {
        setPasso("negocio");
        return setErros({ slug: r.motivo });
      }
      return r.campo ? setErros({ [r.campo]: r.motivo }) : setErro(r.motivo);
    }
    if ("confirmar" in r) return setPasso("confirmar");
    router.replace("/painel");
  };

  const reenviar = async () => {
    setReenvio("enviando");
    const falha = await reenviarConfirmacao(email);
    setReenvio(falha ? null : "enviado");
    setErro(falha);
  };

  if (!convite) {
    return (
      <CascaAcesso titulo="Conferindo seu convite…" arte="cadastro">
        <div style={{ display: "grid", gap: 12, marginTop: 24 }}>
          <Esqueleto altura={48} raio={12} />
          <Esqueleto altura={96} raio={12} />
        </div>
      </CascaAcesso>
    );
  }
  if (convite.estado === "em_breve") return <CadastroEmBreve />;
  if (convite.estado === "invalido") return <SemConvite />;
  if (convite.estado === "usado") return <ConviteUsado />;
  if (convite.estado === "erro") {
    return (
      <CascaAcesso titulo="Não deu para conferir o convite" subtitulo="Confira a internet e tente de novo." arte="cadastro">
        <div className="en-campos">
          <Botao variante="principal" tamanho="g" onClick={() => window.location.reload()}>
            Tentar de novo
          </Botao>
        </div>
      </CascaAcesso>
    );
  }

  const pronto = convite.negocio;

  if (logado) {
    return <ComConta convite={convite} logado={logado} />;
  }

  if (passo === "confirmar") {
    return (
      <CascaAcesso titulo="Confira seu e-mail" arte="cadastro">
        <div className="en-campos">
          <div className="en-carta" aria-hidden>
            <Icone nome="enviar" tamanho={26} />
          </div>
          <p className="en-sub" style={{ marginTop: 0 }}>
            Enviamos um link para <strong>{email}</strong>. Abra o link para ativar a conta.{" "}
            {pronto ? (
              <>
                Em seguida você entra no painel da <strong>{pronto.nome}</strong>.
              </>
            ) : (
              <>
                Sua agenda é criada em <strong>agenda.livo.tec.br/{negocio.slug}</strong> logo em seguida.
              </>
            )}
          </p>
          <AvisoAcesso tom="info">Não chegou em 2 minutos? Olhe a caixa de spam ou promoções.</AvisoAcesso>
          {erro && <AvisoAcesso>{erro}</AvisoAcesso>}
          <Botao variante="secundario" tamanho="g" onClick={reenviar} carregando={reenvio === "enviando"} disabled={reenvio === "enviado"}>
            {reenvio === "enviado" ? "Enviamos de novo" : "Reenviar o e-mail"}
          </Botao>
          <Link href="/painel/entrar" className="ui-botao ui-botao-principal ui-botao-g">
            Já confirmei: entrar
          </Link>
        </div>
      </CascaAcesso>
    );
  }

  return (
    <CascaAcesso
      titulo={pronto ? `Seu acesso à ${pronto.nome}` : passo === "negocio" ? "Crie sua agenda" : "Seu acesso ao painel"}
      subtitulo={
        pronto
          ? `A página agenda.livo.tec.br/${pronto.slug} já está montada. Crie seu acesso para assumir o painel.`
          : passo === "negocio"
            ? "Pagamento confirmado. Leva 2 minutos, e você ajusta tudo depois no painel."
            : "É com este e-mail e senha que você entra no painel."
      }
      arte="cadastro"
    >
      {!pronto && <ol className="en-passos" aria-label="Etapas">
        <li className={passo === "negocio" ? "atual" : "feito"}>
          <span>{passo === "negocio" ? "1" : <Icone nome="ok" tamanho={13} peso="bold" />}</span> Seu negócio
        </li>
        <li className={passo === "acesso" ? "atual" : ""}>
          <span>2</span> Seu acesso
        </li>
      </ol>}

      <AnimatePresence mode="wait" initial={false}>
        {passo === "negocio" ? (
          <motion.form key="negocio" onSubmit={continuar} {...TROCA}>
            <FormNegocio valor={negocio} onMudar={mudarNegocio} onSlug={setSlug} erros={erros} />
            <Botao type="submit" variante="principal" tamanho="g" bloco iconeDepois="avancar" disabled={!supabaseOn || slug === "conferindo"} style={{ marginTop: 18 }}>
              Continuar
            </Botao>
            {!supabaseOn && <small style={{ color: "var(--c-texto-3)", display: "block", marginTop: 8 }}>Cadastro ainda não configurado neste ambiente.</small>}
          </motion.form>
        ) : (
          <motion.form key="acesso" onSubmit={criar} onChange={() => setErros({})} className="en-campos" {...TROCA}>
            {erro && <AvisoAcesso>{erro}</AvisoAcesso>}
            <Campo rotulo="Nome no painel" erro={erros.dono} ajuda="O seu nome ou o do negócio. Aparece no painel e na agenda.">
              <Entrada value={nome} onChange={(e) => setNome(e.target.value)} placeholder={`Ex.: Ana Souza ou ${pronto?.nome ?? "Studio Bela"}`} autoComplete="name" maxLength={80} required icone="cliente" autoFocus />
            </Campo>
            <Campo rotulo="E-mail" erro={erros.email} ajuda="O e-mail da compra. Para usar outro, fale com a Livo.">
              <Entrada type="email" value={email} readOnly aria-readonly autoComplete="email" required icone="enviar" />
            </Campo>
            <Campo rotulo="Senha" erro={erros.senha} ajuda={`Pelo menos ${SENHA_MIN} caracteres.`}>
              <span className="en-senha">
                <Entrada
                  type={verSenha ? "text" : "password"}
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  autoComplete="new-password"
                  required
                  icone="cadeado"
                />
                <button type="button" onClick={() => setVerSenha(!verSenha)} aria-label={verSenha ? "Esconder senha" : "Mostrar senha"}>
                  <Icone nome={verSenha ? "esconder" : "ver"} tamanho={18} />
                </button>
              </span>
            </Campo>
            <Botao type="submit" variante="principal" tamanho="g" carregando={enviando}>
              {pronto ? "Criar meu acesso" : "Criar minha agenda"}
            </Botao>
            {!pronto && (
              <Botao type="button" variante="fantasma" icone="voltar" onClick={() => setPasso("negocio")}>
                Voltar
              </Botao>
            )}
          </motion.form>
        )}
      </AnimatePresence>

      <PeAcesso>
        Já tem conta? <Link href="/painel/entrar">Entrar</Link>
      </PeAcesso>
    </CascaAcesso>
  );
}

/** Já há uma conta logada: com o mesmo e-mail, aceita o convite num toque; com outro, sai primeiro. */
function ComConta({ convite, logado }: { convite: Extract<Convite, { estado: "valido" }>; logado: string }) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const mesmo = logado.toLowerCase() === convite.email.toLowerCase();

  if (!mesmo) {
    return (
      <CascaAcesso titulo="Convite para outra conta" subtitulo={<>Este convite é para <strong>{convite.email}</strong>, e você está com <strong>{logado}</strong>.</>} arte="cadastro">
        <div className="en-campos">
          <Botao variante="principal" tamanho="g" onClick={() => sair().then(() => window.location.reload())}>
            Sair desta conta e continuar
          </Botao>
        </div>
      </CascaAcesso>
    );
  }

  const aceitar = async () => {
    setErro(null);
    if (!convite.negocio) return router.push("/painel/criar-negocio");
    setEnviando(true);
    const r = await aceitarConvite();
    setEnviando(false);
    if (!r.ok) return setErro(r.motivo);
    router.replace("/painel");
  };

  return (
    <CascaAcesso
      titulo={convite.negocio ? `Assumir a ${convite.negocio.nome}` : "Abrir mais um negócio"}
      subtitulo={
        convite.negocio
          ? `Você já tem conta. A ${convite.negocio.nome} entra no seu painel, ao lado dos seus outros negócios.`
          : "Você já tem conta. O novo negócio entra no seu painel, ao lado dos outros."
      }
      arte="cadastro"
    >
      <div className="en-campos">
        {erro && <AvisoAcesso>{erro}</AvisoAcesso>}
        <Botao variante="principal" tamanho="g" carregando={enviando} onClick={aceitar}>
          {convite.negocio ? "Aceitar o convite" : "Criar o negócio"}
        </Botao>
      </div>
    </CascaAcesso>
  );
}

/** Sem convite: o cadastro começa pela contratação. */
function SemConvite() {
  return (
    <CascaAcesso
      titulo="Sua agenda começa pela contratação"
      subtitulo="A conta é criada depois do pagamento. Assim que ele é confirmado, você recebe um link para criar seu acesso."
      arte="cadastro"
    >
      <ol className="en-etapas">
        <li>
          <span>1</span> Contrate o plano com a Livo
        </li>
        <li>
          <span>2</span> Receba o link de convite no e-mail ou no WhatsApp
        </li>
        <li>
          <span>3</span> Crie seu acesso e sua agenda, em 2 minutos
        </li>
      </ol>
      <div className="en-campos">
        {WHATSAPP_LIVO && (
          <a href={linkWhatsApp(WHATSAPP_LIVO, "Olá! Quero contratar a Livo Agenda.")} target="_blank" rel="noopener noreferrer" className="ui-botao ui-botao-principal ui-botao-g">
            <Icone nome="whatsapp" tamanho={18} /> Quero contratar
          </a>
        )}
        <Link href="/painel/entrar" className={`ui-botao ui-botao-${WHATSAPP_LIVO ? "secundario" : "principal"} ui-botao-g`}>
          Já tenho conta: entrar
        </Link>
      </div>
    </CascaAcesso>
  );
}

function ConviteUsado() {
  return (
    <CascaAcesso titulo="Convite já usado" subtitulo="Este link já criou uma conta. Entre com o e-mail e a senha que você escolheu." arte="cadastro">
      <div className="en-campos">
        <Link href="/painel/entrar" className="ui-botao ui-botao-principal ui-botao-g">
          Entrar no painel
        </Link>
        <Link href="/painel/esqueci-senha" className="ui-botao ui-botao-fantasma ui-botao-m">
          Esqueci minha senha
        </Link>
      </div>
    </CascaAcesso>
  );
}

const TROCA = {
  initial: { opacity: 0, x: 14 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -14 },
  transition: { duration: 0.22, ease: [0.23, 1, 0.32, 1] as const },
};
