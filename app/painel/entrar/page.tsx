"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Botao, Campo, Entrada, Esqueleto } from "@/components/ui/basicos";
import { AvisoAcesso, CascaAcesso, PeAcesso } from "@/components/painel/Acesso";
import { concluirEntrada, contaLogada, entrarComSenha, reenviarConfirmacao, type ResultadoLogin } from "@/lib/sessao";
import { supabaseOn } from "@/lib/supabase";

/** O que o link do e-mail trouxe no endereço (#error_code=otp_expired…). */
function erroDoLink(): string | null {
  if (typeof window === "undefined") return null;
  const p = new URLSearchParams(window.location.hash.slice(1));
  if (!p.get("error") && !p.get("error_code")) return null;
  // o link de confirmação também cai aqui quando um e-mail mais novo foi pedido (o reenvio anula os anteriores)
  return p.get("error_code") === "otp_expired"
    ? "Esse link não vale mais: expirou ou um e-mail mais novo foi enviado. Abra o e-mail mais recente ou entre com seu e-mail e senha."
    : "Não foi possível abrir esse link. Entre com seu e-mail e senha.";
}

export default function Entrar() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [naoConfirmado, setNaoConfirmado] = useState(false);
  const [reenvio, setReenvio] = useState<"enviando" | "enviado" | null>(null);
  const [carregando, setCarregando] = useState(false);
  // vindo do link de confirmação (ou já logado), entra sem pedir a senha de novo
  const [conferindo, setConferindo] = useState(supabaseOn);

  /** Entrou: vai para o painel, ou para criar o negócio se a conta ainda não tem. */
  const seguir = (r: ResultadoLogin) => {
    if (r.ok) router.replace("/painel");
    else if (r.semNegocio) router.replace("/painel/criar-negocio");
    else return false;
    return true;
  };

  useEffect(() => {
    let vivo = true;
    const doLink = erroDoLink();
    if (doLink) setErro(doLink);
    (async () => {
      if (await contaLogada()) {
        const r = await concluirEntrada();
        if (!vivo || seguir(r)) return;
        if (!r.ok) setErro(r.motivo);
      }
      if (vivo) setConferindo(false);
    })();
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const entrar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    setReenvio(null);
    setCarregando(true);
    const r = await entrarComSenha(email, senha);
    setCarregando(false);
    if (seguir(r) || r.ok) return;
    setNaoConfirmado(Boolean(r.naoConfirmado));
    setErro(r.motivo);
  };

  const reenviar = async () => {
    setReenvio("enviando");
    const falha = await reenviarConfirmacao(email);
    if (falha) {
      setReenvio(null);
      return setErro(falha);
    }
    setReenvio("enviado");
  };

  if (conferindo) {
    return (
      <CascaAcesso titulo="Entrando…">
        <div style={{ display: "grid", gap: 12, marginTop: 24 }}>
          <Esqueleto altura={48} raio={12} />
          <Esqueleto altura={48} raio={12} />
        </div>
      </CascaAcesso>
    );
  }

  return (
    <CascaAcesso titulo="Entrar no painel" subtitulo="Use o e-mail e a senha da sua conta.">
      <form onSubmit={entrar} className="en-campos">
        {erro && (
          <AvisoAcesso>
            {erro}
            {naoConfirmado && (
              <div style={{ marginTop: 8 }}>
                {reenvio === "enviado" ? (
                  <span>
                    <strong>Enviamos um novo link para {email}.</strong> Use só esse e-mail: os links anteriores deixam de valer.
                  </span>
                ) : (
                  <button type="button" className="en-link" onClick={reenviar} disabled={reenvio === "enviando"}>
                    {reenvio === "enviando" ? "Enviando…" : "Reenviar o e-mail de confirmação"}
                  </button>
                )}
              </div>
            )}
          </AvisoAcesso>
        )}
        <Campo rotulo="E-mail">
          <Entrada type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@seunegocio.com" required icone="cliente" />
        </Campo>
        <Campo rotulo="Senha">
          <Entrada type="password" autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} required icone="cadeado" />
        </Campo>
        <Link href="/painel/esqueci-senha" className="en-link" style={{ justifySelf: "end", marginTop: -4 }}>
          Esqueci minha senha
        </Link>
        <Botao type="submit" variante="principal" tamanho="g" carregando={carregando} disabled={!supabaseOn}>
          Entrar
        </Botao>
        {!supabaseOn && <small style={{ color: "var(--c-texto-3)" }}>Login real ainda não configurado neste ambiente.</small>}
      </form>
      <PeAcesso>
        Ainda não é cliente? <Link href="/painel/criar-conta">Como contratar</Link>
      </PeAcesso>
    </CascaAcesso>
  );
}
