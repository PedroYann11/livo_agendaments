"use client";

// Aberta pelo link de "esqueci minha senha": o Supabase lê o link e abre a
// sessão; aqui a pessoa escolhe a senha nova e já entra no painel.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Botao, Campo, Entrada, Esqueleto } from "@/components/ui/basicos";
import { Icone } from "@/components/ui/Icone";
import { AvisoAcesso, CascaAcesso } from "@/components/painel/Acesso";
import { contaLogada, definirNovaSenha } from "@/lib/sessao";

const SENHA_MIN = 8;

export default function NovaSenha() {
  const router = useRouter();
  const [estado, setEstado] = useState<"conferindo" | "pronto" | "sem_link">("conferindo");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [repetir, setRepetir] = useState("");
  const [verSenha, setVerSenha] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    contaLogada().then((c) => {
      if (!c) return setEstado("sem_link");
      setEmail(c.email);
      setEstado("pronto");
    });
  }, []);

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (senha.length < SENHA_MIN) return setErro(`Use pelo menos ${SENHA_MIN} caracteres.`);
    if (senha !== repetir) return setErro("As duas senhas não são iguais.");
    setErro(null);
    setEnviando(true);
    const r = await definirNovaSenha(senha);
    setEnviando(false);
    if (r.ok) return router.replace("/painel");
    if (r.semNegocio) return router.replace("/painel/criar-negocio");
    setErro(r.motivo);
  };

  if (estado === "conferindo") {
    return (
      <CascaAcesso titulo="Abrindo o link…">
        <div style={{ display: "grid", gap: 12, marginTop: 24 }}>
          <Esqueleto altura={48} raio={12} />
          <Esqueleto altura={48} raio={12} />
        </div>
      </CascaAcesso>
    );
  }

  if (estado === "sem_link") {
    return (
      <CascaAcesso titulo="Link expirado" subtitulo="Esse link já foi usado ou passou do prazo. Peça um novo, leva um minuto.">
        <div className="en-campos">
          <Link href="/painel/esqueci-senha" className="ui-botao ui-botao-principal ui-botao-g">
            Pedir um novo link
          </Link>
          <Link href="/painel/entrar" className="ui-botao ui-botao-fantasma ui-botao-m">
            Voltar para o login
          </Link>
        </div>
      </CascaAcesso>
    );
  }

  return (
    <CascaAcesso titulo="Crie uma senha nova" subtitulo={<>Para a conta <strong>{email}</strong>.</>}>
      <form onSubmit={salvar} className="en-campos">
        {erro && <AvisoAcesso>{erro}</AvisoAcesso>}
        <Campo rotulo="Senha nova" ajuda={`Pelo menos ${SENHA_MIN} caracteres.`}>
          <span className="en-senha">
            <Entrada type={verSenha ? "text" : "password"} autoComplete="new-password" value={senha} onChange={(e) => setSenha(e.target.value)} required icone="cadeado" autoFocus />
            <button type="button" onClick={() => setVerSenha(!verSenha)} aria-label={verSenha ? "Esconder senha" : "Mostrar senha"}>
              <Icone nome={verSenha ? "esconder" : "ver"} tamanho={18} />
            </button>
          </span>
        </Campo>
        <Campo rotulo="Repita a senha nova">
          <Entrada type={verSenha ? "text" : "password"} autoComplete="new-password" value={repetir} onChange={(e) => setRepetir(e.target.value)} required icone="cadeado" />
        </Campo>
        <Botao type="submit" variante="principal" tamanho="g" carregando={enviando}>
          Salvar e entrar
        </Botao>
      </form>
    </CascaAcesso>
  );
}
