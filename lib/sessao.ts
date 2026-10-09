"use client";

// =====================================================================
// Sessão do painel.
//
// Só se entra com conta: e-mail e senha no Supabase Auth; o negócio vem de
// `meus_negocios()` (RLS: só os negócios de que a pessoa é membro).
//
// A conta e o negócio nascem pelo próprio site (migration 008): a pessoa
// cria a conta, confirma o e-mail e, no primeiro login, o negócio que ela
// descreveu no cadastro é criado e ela vira dona. Ver docs/ESTADO.md.
// =====================================================================

import type { Nicho, Papel } from "./tipos";
import { getSupabase, supabaseOn } from "./supabase";
import { negocioNovo } from "./padroes";

export type Sessao = {
  slug: string;
  nome: string;
  email: string;
  papel: Papel;
  /** para trocar de negócio sem sair (dono de mais de uma unidade) */
  negocios: { slug: string; nome: string; papel: Papel }[];
};

const CHAVE = "livo-agenda:sessao";

export function lerSessao(): Sessao | null {
  try {
    const s = JSON.parse(localStorage.getItem(CHAVE) ?? "null");
    // sessões da antiga demonstração (sem conta) não valem mais
    return s && s.slug && s.tipo !== "demo" ? (s as Sessao) : null;
  } catch {
    return null;
  }
}

export function salvarSessao(s: Sessao) {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(s));
  } catch {}
  window.dispatchEvent(new Event("livo-sessao"));
}

export async function sair() {
  try {
    localStorage.removeItem(CHAVE);
  } catch {}
  if (supabaseOn) {
    try {
      await getSupabase().auth.signOut();
    } catch {}
  }
  window.dispatchEvent(new Event("livo-sessao"));
}

export type ResultadoLogin =
  | { ok: true; sessao: Sessao }
  | {
      ok: false;
      motivo: string;
      /** entrou, mas a conta ainda não tem negócio: segue para criar um */
      semNegocio?: boolean;
      /** a conta existe, falta abrir o link do e-mail */
      naoConfirmado?: boolean;
    };

const NAO_CONFIGURADO = "O login ainda não está configurado neste ambiente.";

/** Os erros do Supabase Auth em português de gente. */
function motivoDoAuth(e: { code?: string; status?: number; message?: string } | null): string {
  switch (e?.code) {
    case "invalid_credentials":
      return "E-mail ou senha incorretos.";
    case "email_not_confirmed":
      return "Falta confirmar o e-mail: abra o link que enviamos para você.";
    case "user_already_exists":
    case "email_exists":
      return "Esse e-mail já tem conta. Entre com ele ou use “Esqueci minha senha”.";
    case "weak_password":
      return "Senha fraca: use pelo menos 8 caracteres, misturando letras e números.";
    case "same_password":
      return "A nova senha precisa ser diferente da anterior.";
    case "email_address_invalid":
      return "Esse e-mail não parece válido.";
    case "signup_disabled":
      return "O cadastro está fechado no momento.";
    case "email_address_not_authorized":
      return "Não conseguimos enviar o e-mail agora. Tente mais tarde ou fale com a Livo.";
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return "Muitas tentativas seguidas. Espere alguns minutos e tente de novo.";
  }
  if (e?.status === 429) return "Muitas tentativas seguidas. Espere alguns minutos e tente de novo.";
  // recusado antes de a conta existir (hook_antes_de_criar_conta, migration 008)
  if (e?.status === 403) return "Este e-mail não tem uma compra ativa. Use o link de convite que você recebeu depois do pagamento.";
  if (e?.message === "Invalid login credentials") return "E-mail ou senha incorretos.";
  return "Não foi possível agora. Confira a internet e tente de novo.";
}

async function listarNegocios(): Promise<Sessao["negocios"] | null> {
  const { data, error } = await getSupabase().rpc("meus_negocios");
  if (error || !Array.isArray(data)) return null;
  return (data as Sessao["negocios"]).map((n) => ({ slug: n.slug, nome: n.nome, papel: n.papel }));
}

/**
 * Depois que o Supabase abriu a sessão (senha, link do e-mail ou nova
 * senha): descobre os negócios da pessoa e guarda a sessão do painel. Se a
 * conta acabou de ser confirmada, cria o negócio descrito no cadastro.
 */
export function concluirEntrada(): Promise<ResultadoLogin> {
  // duas telas (ou o React em desenvolvimento) pedindo ao mesmo tempo: um pedido só
  entradaEmCurso ??= fazerEntrada().finally(() => (entradaEmCurso = null));
  return entradaEmCurso;
}
let entradaEmCurso: Promise<ResultadoLogin> | null = null;

async function fazerEntrada(): Promise<ResultadoLogin> {
  if (!supabaseOn) return { ok: false, motivo: NAO_CONFIGURADO };
  const sb = getSupabase();
  const { data } = await sb.auth.getUser();
  const user = data.user;
  if (!user) return { ok: false, motivo: "Sua sessão terminou. Entre de novo." };
  // convite para assumir um negócio pronto (009): se houver um para este e-mail, entra junto
  const { data: assumido } = await sb.rpc("negocio_assumir");
  let negocios = await listarNegocios();
  if (!negocios) return { ok: false, motivo: "Não foi possível entrar agora. Tente de novo." };

  const pendente = user.user_metadata?.negocio as NegocioDoCadastro | undefined;
  if (!negocios.length && pendente?.slug) {
    await criarMeuNegocio(user.user_metadata?.nome ?? "", pendente);
    // deu certo, ou outra aba criou no mesmo instante: a lista diz
    negocios = (await listarNegocios()) ?? [];
  }
  if (!negocios.length) return { ok: false, semNegocio: true, motivo: "Falta criar o seu negócio." };

  // abre no negócio que acabou de ser assumido; senão, no primeiro
  const atual = negocios.find((n) => n.slug === assumido) ?? negocios[0];
  const sessao: Sessao = {
    slug: atual.slug,
    nome: user.user_metadata?.nome || (user.email ?? "").split("@")[0],
    email: user.email ?? "",
    papel: atual.papel,
    negocios,
  };
  salvarSessao(sessao);
  return { ok: true, sessao };
}

export async function entrarComSenha(email: string, senha: string): Promise<ResultadoLogin> {
  if (!supabaseOn) return { ok: false, motivo: NAO_CONFIGURADO };
  const { data, error } = await getSupabase().auth.signInWithPassword({ email: email.trim(), password: senha });
  if (error || !data.user) {
    return { ok: false, motivo: motivoDoAuth(error), naoConfirmado: error?.code === "email_not_confirmed" };
  }
  return concluirEntrada();
}

/** Há uma conta logada no Supabase (mesmo sem negócio ainda)? Também lê o link do e-mail. */
export async function contaLogada(): Promise<{ email: string; nome: string; negocio?: NegocioDoCadastro } | null> {
  if (!supabaseOn) return null;
  const { data } = await getSupabase().auth.getSession();
  const u = data.session?.user;
  if (!u) return null;
  return { email: u.email ?? "", nome: u.user_metadata?.nome ?? "", negocio: u.user_metadata?.negocio };
}

// ---------------------------------------------------------------------
// Cadastro próprio: conta (Supabase Auth) + negócio (negocio_criar_meu)
// ---------------------------------------------------------------------

/** O que a pessoa conta sobre o negócio no cadastro. */
export type NegocioDoCadastro = { nome: string; slug: string; nicho: Nicho; whatsapp: string };

export type ResultadoCadastro =
  | { ok: true; sessao: Sessao }
  /** conta criada; falta abrir o link do e-mail para entrar */
  | { ok: true; confirmar: true }
  | { ok: false; motivo: string; campo?: string };

/** negocio: o negócio novo descrito no cadastro; sem ele, o convite é de um negócio pronto (009). */
export async function criarConta(d: { nome: string; email: string; senha: string; negocio?: NegocioDoCadastro }): Promise<ResultadoCadastro> {
  if (!supabaseOn) return { ok: false, motivo: NAO_CONFIGURADO };
  const { data, error } = await getSupabase().auth.signUp({
    email: d.email.trim(),
    password: d.senha,
    options: {
      // guardado na conta: o negócio nasce no primeiro login, já com o e-mail confirmado
      data: d.negocio ? { nome: d.nome.trim(), negocio: d.negocio } : { nome: d.nome.trim() },
      emailRedirectTo: `${window.location.origin}/painel/entrar`,
    },
  });
  if (error) return { ok: false, motivo: motivoDoAuth(error), campo: error.code === "weak_password" ? "senha" : "email" };
  // e-mail já cadastrado: o Supabase responde sem identidade (e não envia nada)
  if (data.user && data.user.identities?.length === 0) return { ok: false, motivo: motivoDoAuth({ code: "user_already_exists" }), campo: "email" };
  if (!data.session) return { ok: true, confirmar: true };
  // confirmação de e-mail desligada no projeto: já entra
  const r = await concluirEntrada();
  if (r.ok) return r;
  return { ok: false, motivo: r.motivo };
}

export async function reenviarConfirmacao(email: string): Promise<string | null> {
  if (!supabaseOn) return NAO_CONFIGURADO;
  const { error } = await getSupabase().auth.resend({
    type: "signup",
    email: email.trim(),
    options: { emailRedirectTo: `${window.location.origin}/painel/entrar` },
  });
  return error ? motivoDoAuth(error) : null;
}

export async function criarMeuNegocio(dono: string, d: NegocioDoCadastro): Promise<{ ok: true; slug: string } | { ok: false; motivo: string; campo?: string }> {
  if (!supabaseOn) return { ok: false, motivo: NAO_CONFIGURADO };
  const sb = getSupabase();
  const negocio = negocioNovo("", d.slug, d.nome.trim(), d.nicho);
  negocio.contato = { ...negocio.contato, whatsapp: d.whatsapp.replace(/\D/g, "") };
  const { data, error } = await sb.rpc("negocio_criar_meu", { p_dono: dono, p_negocio: negocio });
  if (error) {
    if (error.code === "P0001") return { ok: false, motivo: error.message, campo: error.hint ?? undefined };
    if (error.code === "42501") return { ok: false, motivo: "Sua sessão terminou. Entre de novo." };
    return { ok: false, motivo: "Não foi possível criar o negócio agora. Tente de novo." };
  }
  // o rascunho do cadastro já virou negócio: não volta a ser usado
  await sb.auth.updateUser({ data: { negocio: null } }).catch(() => {});
  return { ok: true, slug: String(data) };
}

const semFuncao = (e: { code?: string } | null) => e?.code === "PGRST202" || e?.code === "42883";

/**
 * O banco já tem o cadastro (migration 008)? Sem ele, as telas de cadastro
 * dizem "abre em breve" em vez de criar uma conta que não teria como criar
 * o negócio. Na dúvida (internet), deixa seguir.
 */
export async function cadastroDisponivel(): Promise<boolean> {
  if (!supabaseOn) return false;
  const { error } = await getSupabase().rpc("slug_disponivel", { p_slug: "livo" });
  return !semFuncao(error);
}

/**
 * O link de convite que a pessoa recebe depois de pagar (?convite=…). A conta
 * só nasce com ele: o e-mail fica preso ao de quem pagou.
 */
export type Convite =
  /** negocio: o convite é para assumir um negócio pronto (009), não para criar um */
  | { estado: "valido"; email: string; plano: string; negocio?: { nome: string; slug: string } }
  | { estado: "usado" }
  | { estado: "invalido" }
  /** o banco ainda não tem o cadastro (008) */
  | { estado: "em_breve" }
  /** não deu para conferir agora (internet) */
  | { estado: "erro" };

export async function conferirConvite(codigo: string): Promise<Convite> {
  if (!supabaseOn) return { estado: "em_breve" };
  if (!/^[a-f0-9]{36}$/.test(codigo)) return { estado: "invalido" };
  const { data, error } = await getSupabase().rpc("convite_publico", { p_codigo: codigo });
  if (error) return semFuncao(error) ? { estado: "em_breve" } : { estado: "erro" };
  if (!data) return { estado: "invalido" };
  if (data.usado) return { estado: "usado" };
  return { estado: "valido", email: String(data.email), plano: String(data.plano), negocio: data.negocio ?? undefined };
}

export type SituacaoSlug = "ok" | "invalido" | "reservado" | "em_uso";

/** null = não deu para conferir agora (a criação confere de novo). */
export async function conferirSlug(slug: string): Promise<SituacaoSlug | null> {
  if (!supabaseOn) return null;
  const { data, error } = await getSupabase().rpc("slug_disponivel", { p_slug: slug });
  return error ? null : (data as SituacaoSlug);
}

// ---------------------------------------------------------------------
// Senha esquecida: link por e-mail → /painel/nova-senha
// ---------------------------------------------------------------------

export async function pedirNovaSenha(email: string): Promise<string | null> {
  if (!supabaseOn) return NAO_CONFIGURADO;
  const { error } = await getSupabase().auth.resetPasswordForEmail(email.trim(), {
    redirectTo: `${window.location.origin}/painel/nova-senha`,
  });
  // não dizer se o e-mail existe ou não: só os erros que a pessoa pode resolver
  if (error && (error.status === 429 || error.code?.startsWith("over_"))) return motivoDoAuth(error);
  return null;
}

export async function definirNovaSenha(senha: string): Promise<ResultadoLogin> {
  if (!supabaseOn) return { ok: false, motivo: NAO_CONFIGURADO };
  const { error } = await getSupabase().auth.updateUser({ password: senha });
  if (error) return { ok: false, motivo: motivoDoAuth(error) };
  return concluirEntrada();
}

export function trocarNegocio(s: Sessao, slug: string) {
  const n = s.negocios.find((x) => x.slug === slug);
  if (!n) return;
  salvarSessao({ ...s, slug, papel: n.papel });
}

/** O que cada papel enxerga no painel. A RLS do backend repete a regra. */
export const AREAS_DO_PAPEL: Record<Papel, string[]> = {
  owner: ["inicio", "agenda", "clientes", "servicos", "equipe", "financeiro", "relatorios", "mensagens", "anamnese", "configuracoes"],
  admin: ["inicio", "agenda", "clientes", "servicos", "equipe", "financeiro", "relatorios", "mensagens", "anamnese", "configuracoes"],
  reception: ["inicio", "agenda", "clientes", "mensagens", "anamnese"],
  professional: ["inicio", "agenda", "clientes", "anamnese"],
};

export const NOME_PAPEL: Record<Papel, string> = {
  owner: "Dono(a)",
  admin: "Administrador(a)",
  reception: "Recepção",
  professional: "Profissional",
};

/** Quem já tem conta aceita o convite de um negócio pronto e passa a ser dono dele. */
export async function aceitarConvite(): Promise<ResultadoLogin> {
  if (!supabaseOn) return { ok: false, motivo: NAO_CONFIGURADO };
  const { data: slug, error } = await getSupabase().rpc("negocio_assumir");
  if (error) return { ok: false, motivo: error.code === "P0001" ? error.message : "Não foi possível aceitar o convite agora. Tente de novo." };
  const r = await concluirEntrada();
  // abre já no negócio assumido
  const novo = r.ok ? r.sessao.negocios.find((n) => n.slug === slug) : undefined;
  if (!r.ok || !novo) return r;
  const sessao = { ...r.sessao, slug: novo.slug, papel: novo.papel };
  salvarSessao(sessao);
  return { ok: true, sessao };
}
