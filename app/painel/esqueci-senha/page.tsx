"use client";

import Link from "next/link";
import { useState } from "react";
import { Botao, Campo, Entrada } from "@/components/ui/basicos";
import { AvisoAcesso, CascaAcesso, PeAcesso } from "@/components/painel/Acesso";
import { pedirNovaSenha } from "@/lib/sessao";
import { supabaseOn } from "@/lib/supabase";

export default function EsqueciSenha() {
  const [email, setEmail] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const pedir = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    const falha = await pedirNovaSenha(email);
    setEnviando(false);
    if (falha) return setErro(falha);
    setEnviado(true);
  };

  return (
    <CascaAcesso titulo="Esqueci minha senha" subtitulo="Enviamos um link para você criar uma senha nova.">
      {enviado ? (
        <div className="en-campos">
          <AvisoAcesso tom="ok">
            Se existir uma conta com <strong>{email}</strong>, o link já está a caminho. Abra o e-mail e toque em “Criar nova senha”.
          </AvisoAcesso>
          <AvisoAcesso tom="info">Não chegou em 2 minutos? Olhe a caixa de spam ou promoções.</AvisoAcesso>
          <Link href="/painel/entrar" className="ui-botao ui-botao-secundario ui-botao-g">
            Voltar para o login
          </Link>
        </div>
      ) : (
        <form onSubmit={pedir} className="en-campos">
          {erro && <AvisoAcesso>{erro}</AvisoAcesso>}
          <Campo rotulo="E-mail da conta">
            <Entrada type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@seunegocio.com" required icone="enviar" />
          </Campo>
          <Botao type="submit" variante="principal" tamanho="g" carregando={enviando} disabled={!supabaseOn}>
            Enviar o link
          </Botao>
        </form>
      )}
      <PeAcesso>
        Lembrou? <Link href="/painel/entrar">Entrar</Link>
      </PeAcesso>
    </CascaAcesso>
  );
}
