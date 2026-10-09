"use client";

// =====================================================================
// "Seu negócio": nome, tipo, endereço da página e WhatsApp.
// O mesmo formulário no cadastro (antes da conta existir) e em "criar
// negócio" (conta já logada). O endereço é conferido enquanto a pessoa
// digita; quem decide de verdade é o banco, na hora de criar.
// =====================================================================

import { useEffect, useRef, useState } from "react";
import { Campo, Entrada } from "@/components/ui/basicos";
import { Icone } from "@/components/ui/Icone";
import { NICHOS } from "@/lib/padroes";
import { FORMATO_SLUG, RESERVADOS, limparSlug, sugerirSlug } from "@/lib/enderecos";
import { conferirSlug, type NegocioDoCadastro, type SituacaoSlug } from "@/lib/sessao";
import { mascaraTelefone } from "@/lib/masks";

export const NEGOCIO_EM_BRANCO: NegocioDoCadastro = { nome: "", slug: "", nicho: "" as NegocioDoCadastro["nicho"], whatsapp: "" };

export type EstadoSlug = SituacaoSlug | "vazio" | "conferindo" | "sem_conferir";

/** O formulário está pronto para seguir? (o endereço ainda é conferido pelo banco ao criar) */
export function negocioPronto(n: NegocioDoCadastro, slug: EstadoSlug): boolean {
  return n.nome.trim().length >= 2 && Boolean(n.nicho) && (slug === "ok" || slug === "sem_conferir");
}

export function FormNegocio({
  valor,
  onMudar,
  onSlug,
  erros = {},
}: {
  valor: NegocioDoCadastro;
  onMudar: (n: NegocioDoCadastro) => void;
  onSlug: (e: EstadoSlug) => void;
  erros?: Partial<Record<"nome" | "nicho" | "slug", string | null>>;
}) {
  // o endereço acompanha o nome até a pessoa mexer nele
  const [slugTocado, setSlugTocado] = useState(Boolean(valor.slug) && valor.slug !== sugerirSlug(valor.nome));
  const [estado, setEstado] = useState<EstadoSlug>("vazio");
  const pedido = useRef(0);

  const muda = (parcial: Partial<NegocioDoCadastro>) => onMudar({ ...valor, ...parcial });

  useEffect(() => {
    const slug = valor.slug;
    const n = ++pedido.current;
    const mostra = (e: EstadoSlug) => {
      if (n !== pedido.current) return;
      setEstado(e);
      onSlug(e);
    };
    if (!slug) return mostra("vazio");
    if (!FORMATO_SLUG.test(slug)) return mostra("invalido");
    if (RESERVADOS.has(slug)) return mostra("reservado");
    mostra("conferindo");
    const t = setTimeout(async () => mostra((await conferirSlug(slug)) ?? "sem_conferir"), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valor.slug]);

  const ajudaSlug = {
    vazio: "É o link que você coloca na bio do Instagram.",
    conferindo: "Conferindo…",
    ok: (
      <span className="en-ok">
        <Icone nome="okCirculo" tamanho={14} /> Disponível
      </span>
    ),
    sem_conferir: "Vamos conferir quando você criar a agenda.",
    invalido: null,
    reservado: null,
    em_uso: null,
  }[estado];
  const erroSlug =
    erros.slug ??
    (estado === "invalido"
      ? "Use letras minúsculas, números e hífen."
      : estado === "reservado" || estado === "em_uso"
        ? "Esse endereço já está em uso. Tente outro."
        : null);

  return (
    <div className="en-campos">
      <Campo rotulo="Nome do negócio" erro={erros.nome}>
        <Entrada
          value={valor.nome}
          onChange={(e) => {
            const nome = e.target.value;
            muda(slugTocado ? { nome } : { nome, slug: sugerirSlug(nome) });
          }}
          placeholder="Ex.: Studio Luz Depilação"
          autoComplete="organization"
          maxLength={80}
          required
          icone="pagina"
        />
      </Campo>

      <div className="ui-campo">
        <span className="ui-campo-rotulo">Tipo de negócio</span>
        <div className="en-nichos" role="radiogroup" aria-label="Tipo de negócio">
          {NICHOS.map((n) => (
            <button
              key={n.id}
              type="button"
              role="radio"
              aria-checked={valor.nicho === n.id}
              className={valor.nicho === n.id ? "ativo" : ""}
              onClick={() => muda({ nicho: n.id })}
            >
              {n.nome}
            </button>
          ))}
        </div>
        {erros.nicho ? <span className="ui-campo-erro">{erros.nicho}</span> : <span className="ui-campo-ajuda">Já liga as funções certas para o seu tipo de negócio. Dá para mudar depois.</span>}
      </div>

      <Campo rotulo="Endereço da sua página" erro={erroSlug} ajuda={ajudaSlug}>
        <span className="en-endereco">
          <span>agenda.livo.tec.br/</span>
          <input
            className="ui-entrada"
            value={valor.slug}
            onChange={(e) => {
              setSlugTocado(true);
              muda({ slug: limparSlug(e.target.value) });
            }}
            onBlur={() => muda({ slug: valor.slug.replace(/-+$/g, "") })}
            placeholder="seu-negocio"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            maxLength={40}
            required
          />
        </span>
      </Campo>

      <Campo rotulo="WhatsApp do negócio" opcional ajuda="Aparece na sua página para os clientes falarem com você.">
        <Entrada
          type="tel"
          inputMode="tel"
          value={valor.whatsapp}
          onChange={(e) => muda({ whatsapp: mascaraTelefone(e.target.value) })}
          placeholder="(85) 99999-0000"
          autoComplete="tel"
          icone="whatsapp"
        />
      </Campo>
    </div>
  );
}
