"use client";

// A conta existe e está logada, mas ainda não tem negócio — o endereço
// escolhido no cadastro foi ocupado antes da confirmação do e-mail, ou a
// conta nasceu sem ele. Também serve para abrir mais um negócio (até 3).

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Botao, Campo, Entrada, Esqueleto } from "@/components/ui/basicos";
import { AvisoAcesso, CadastroEmBreve, CascaAcesso, PeAcesso } from "@/components/painel/Acesso";
import { FormNegocio, NEGOCIO_EM_BRANCO, negocioPronto, type EstadoSlug } from "@/components/painel/FormNegocio";
import { cadastroDisponivel, concluirEntrada, contaLogada, criarMeuNegocio, sair, salvarSessao, type NegocioDoCadastro } from "@/lib/sessao";
import { mascaraTelefone } from "@/lib/masks";

export default function CriarNegocio() {
  const router = useRouter();
  const [pronto, setPronto] = useState(false);
  const [aberto, setAberto] = useState(true);
  const [email, setEmail] = useState("");
  const [nome, setNome] = useState("");
  const [negocio, setNegocio] = useState<NegocioDoCadastro>(NEGOCIO_EM_BRANCO);
  const [slug, setSlug] = useState<EstadoSlug>("vazio");
  const [erros, setErros] = useState<Record<string, string | null>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    contaLogada().then(async (c) => {
      if (!c) return router.replace("/painel/entrar");
      setEmail(c.email);
      setNome(c.nome);
      if (c.negocio) setNegocio({ ...NEGOCIO_EM_BRANCO, ...c.negocio, whatsapp: mascaraTelefone(c.negocio.whatsapp ?? "") });
      setAberto(await cadastroDisponivel());
      setPronto(true);
    });
  }, [router]);

  const criar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    const faltando = {
      dono: nome.trim().split(/\s+/).length < 2 ? "Escreva nome e sobrenome." : null,
      nome: negocio.nome.trim().length < 2 ? "Diga o nome do negócio." : null,
      nicho: negocio.nicho ? null : "Escolha o tipo do negócio.",
      slug: slug === "vazio" ? "Escolha o endereço da sua página." : null,
    };
    setErros(faltando);
    if (faltando.dono || !negocioPronto(negocio, slug)) return;
    setEnviando(true);
    const r = await criarMeuNegocio(nome, negocio);
    if (!r.ok) {
      setEnviando(false);
      return r.campo && r.campo in faltando ? setErros({ [r.campo]: r.motivo }) : setErro(r.motivo);
    }
    const entrada = await concluirEntrada();
    setEnviando(false);
    if (!entrada.ok) return setErro(entrada.motivo);
    // abre já no negócio que acabou de nascer
    const novo = entrada.sessao.negocios.find((x) => x.slug === r.slug);
    if (novo) salvarSessao({ ...entrada.sessao, slug: novo.slug, papel: novo.papel });
    router.replace("/painel");
  };

  if (!aberto) return <CadastroEmBreve />;

  if (!pronto) {
    return (
      <CascaAcesso titulo="Só um instante…" arte="cadastro">
        <div style={{ display: "grid", gap: 12, marginTop: 24 }}>
          <Esqueleto altura={48} raio={12} />
          <Esqueleto altura={96} raio={12} />
          <Esqueleto altura={48} raio={12} />
        </div>
      </CascaAcesso>
    );
  }

  return (
    <CascaAcesso titulo="Crie seu negócio" subtitulo={`Você entrou como ${email}. Falta só descrever o negócio.`} arte="cadastro">
      <form onSubmit={criar} onChange={() => setErros({})} className="en-campos">
        {erro && <AvisoAcesso>{erro}</AvisoAcesso>}
        <Campo rotulo="Seu nome" erro={erros.dono}>
          <Entrada value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome e sobrenome" autoComplete="name" maxLength={80} required icone="cliente" />
        </Campo>
        <FormNegocio
          valor={negocio}
          onMudar={(n) => {
            setNegocio(n);
            setErros({});
          }}
          onSlug={setSlug}
          erros={erros}
        />
        <Botao type="submit" variante="principal" tamanho="g" carregando={enviando} disabled={slug === "conferindo"}>
          Criar minha agenda
        </Botao>
      </form>
      <PeAcesso>
        Conta errada?{" "}
        <button type="button" className="en-link" onClick={() => sair().then(() => router.replace("/painel/entrar"))}>
          Sair
        </button>
      </PeAcesso>
    </CascaAcesso>
  );
}
