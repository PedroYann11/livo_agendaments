// =====================================================================
// "Supabase de bolso" — para testar as telas contra o banco DE TESTE.
//
// Um servidor pequeno que responde como o Supabase nas duas portas que o
// app usa (RPC do PostgREST e login do GoTrue), em cima do Postgres
// descartável do ./supabase/tests/rodar.sh --manter. Cada chamada roda com
// o papel de quem chamou (anon ou authenticated + o "JWT"), então a RLS e
// os GRANTs valem igual à produção.
//
// SÓ PARA TESTE LOCAL: o login aqui não confere assinatura nenhuma.
//
// Cadastro: /auth/v1/signup cria a conta em auth.users. Com
// BOLSO_CONFIRMAR=1 ela nasce sem e-mail confirmado (como em produção) e o
// "link do e-mail" é GET /auth/v1/bolso-link?email=…&tipo=signup|recovery
// &redirect_to=… — que confirma e volta para o app com a sessão no #.
// Se o banco tem public.hook_antes_de_criar_conta (008), o cadastro passa
// por ele, como o "Before User Created" ligado na Supabase.
//
//   ./supabase/tests/rodar.sh --manter
//   BOLSO_SENHAS="dona@depiled.teste:senha" node supabase/tests/bolso/servidor.mjs
//   NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=bolso npx next dev
// =====================================================================

import http from "node:http";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

const PORTA = Number(process.env.BOLSO_PORTA ?? 54321);
const PG = ["-h", "/tmp", "-p", process.env.PORTA ?? "55433", "-U", "postgres", "-d", "agenda_teste", "-v", "ON_ERROR_STOP=1", "-qAt"];
const SENHAS = new Map(
  (process.env.BOLSO_SENHAS ?? "").split(",").filter(Boolean).map((par) => {
    const [email, senha] = par.split(":");
    return [email.toLowerCase(), senha];
  }),
);
const refreshs = new Map();

function psql(texto, vars = {}) {
  return new Promise((ok) => {
    const args = [...PG, ...Object.entries(vars).flatMap(([k, v]) => ["-v", `${k}=${v}`])];
    const p = spawn("psql", args);
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("close", (codigo) => ok({ codigo, out, err }));
    p.stdin.end(texto);
  });
}

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
function jwt(usuario) {
  const agora = Math.floor(Date.now() / 1000);
  return [b64({ alg: "HS256", typ: "JWT" }), b64({ sub: usuario.id, email: usuario.email, role: "authenticated", aud: "authenticated", iat: agora, exp: agora + 3600 }), "bolso"].join(".");
}
function lerJwt(cabecalho) {
  const token = (cabecalho ?? "").replace(/^Bearer\s+/i, "");
  const partes = token.split(".");
  if (partes.length !== 3) return null;
  try {
    const p = JSON.parse(Buffer.from(partes[1], "base64url").toString());
    return p.role === "authenticated" && p.sub && p.exp > Date.now() / 1000 ? p : null;
  } catch {
    return null;
  }
}

function sessao(usuario) {
  const refresh = randomUUID();
  refreshs.set(refresh, usuario);
  return {
    access_token: jwt(usuario),
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: refresh,
    user: {
      id: usuario.id, aud: "authenticated", role: "authenticated", email: usuario.email,
      app_metadata: { provider: "email", providers: ["email"] }, user_metadata: usuario.meta ?? {},
      identities: [{ id: usuario.id, provider: "email" }],
      email_confirmed_at: usuario.confirmado ?? null,
      created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
    },
  };
}

// ---------------------------------------------------------------------
// RPC: POST /rest/v1/rpc/<funcao>, argumentos nomeados no corpo
// ---------------------------------------------------------------------

const assinaturas = new Map();
async function assinatura(fn) {
  if (assinaturas.has(fn)) return assinaturas.get(fn);
  const r = await psql(
    `select coalesce(jsonb_agg(jsonb_build_object('retset', p.proretset, 'ret', format_type(p.prorettype, null),
       'nomes', coalesce(p.proargnames, '{}'), 'tipos', (select coalesce(jsonb_agg(format_type(t, null) order by i), '[]')
       from unnest(p.proargtypes::oid[]) with ordinality u(t, i)))), '[]')
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = :'fn'`,
    { fn },
  );
  const lista = JSON.parse(r.out.trim() || "[]");
  assinaturas.set(fn, lista);
  return lista;
}

async function rpc(fn, corpo, usuario) {
  if (!/^[a-z_][a-z0-9_]*$/.test(fn)) return [404, { message: "função inválida" }];
  const versoes = await assinatura(fn);
  const nomes = Object.keys(corpo);
  const v = versoes.find((x) => nomes.every((n) => x.nomes.includes(n)));
  if (!v) return [404, { code: "PGRST202", message: `Could not find the function public.${fn}` }];
  const vars = { sub: usuario?.sub ?? "" };
  const args = nomes.map((nome, i) => {
    const tipo = v.tipos[v.nomes.indexOf(nome)];
    const valor = corpo[nome];
    if (valor === null || valor === undefined) return `${nome} => null::${tipo}`;
    if (tipo.endsWith("[]")) {
      vars[`a${i}`] = JSON.stringify(valor);
      return `${nome} => (select coalesce(array_agg(x), '{}') from jsonb_array_elements_text(:'a${i}'::jsonb) x)::${tipo}`;
    }
    vars[`a${i}`] = tipo === "jsonb" || tipo === "json" ? JSON.stringify(valor) : String(valor);
    return `${nome} => :'a${i}'::${tipo}`;
  });
  const chamada = `public.${fn}(${args.join(", ")})`;
  const expr = v.retset
    ? `(select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from ${chamada} t)::text`
    : v.ret === "void"
      ? `(select 'null' from (select ${chamada}) x)`
      : `coalesce(to_jsonb(${chamada})::text, 'null')`;
  const r = await psql(
    `\\set VERBOSITY verbose
begin;
select set_config('request.jwt.claim.sub', :'sub', true) is null;
set local role ${usuario ? "authenticated" : "anon"};
select 'RESULTADO:' || ${expr};
commit;`,
    vars,
  );
  if (r.codigo !== 0) {
    const m = r.err.match(/ERROR:\s+([0-9A-Z]{5}): (.*)/);
    const hint = r.err.match(/HINT:\s+(.*)/)?.[1] ?? null;
    const code = m?.[1] ?? "XX000";
    return [code === "42501" ? (usuario ? 403 : 401) : 400, { code, message: m?.[2] ?? r.err.trim(), details: null, hint }];
  }
  const linha = r.out.split("\n").find((l) => l.startsWith("RESULTADO:"));
  return [200, JSON.parse(linha.slice("RESULTADO:".length))];
}

// ---------------------------------------------------------------------
// Login e cadastro: /auth/v1/token, signup, user, resend, recover, logout
// ---------------------------------------------------------------------

const CONFIRMAR = process.env.BOLSO_CONFIRMAR === "1";
const COLUNAS = `jsonb_build_object('id', id, 'email', email, 'meta', coalesce(raw_user_meta_data, '{}'), 'confirmado', email_confirmed_at)`;

async function usuarioPorEmail(email) {
  const r = await psql(`select ${COLUNAS} from auth.users where lower(email) = lower(:'email')`, { email });
  return r.out.trim() ? JSON.parse(r.out.trim()) : null;
}
async function usuarioPorId(id) {
  const r = await psql(`select ${COLUNAS} from auth.users where id = :'id'::uuid`, { id });
  return r.out.trim() ? JSON.parse(r.out.trim()) : null;
}

/** "Before User Created": a função do banco decide, rodando como supabase_auth_admin. */
async function hookAntesDeCriarConta(email, meta) {
  const existe = await psql(`select to_regprocedure('public.hook_antes_de_criar_conta(jsonb)') is not null`);
  if (existe.out.trim() !== "t") return null;
  const evento = JSON.stringify({ metadata: { name: "before-user-created" }, user: { email, user_metadata: meta } });
  const r = await psql(`begin; set local role supabase_auth_admin; select public.hook_antes_de_criar_conta(:'ev'::jsonb); commit;`, { ev: evento });
  const saida = JSON.parse(r.out.trim().split("\n").find((l) => l.startsWith("{")) ?? "{}");
  return saida.error ?? null;
}

/** O "link do e-mail": volta para o app com a sessão no #, como o GoTrue no fluxo implícito. */
function redirecionarComSessao(destino, usuario, tipo) {
  const s = sessao(usuario);
  const hash = new URLSearchParams({
    access_token: s.access_token, refresh_token: s.refresh_token, expires_in: "3600",
    expires_at: String(s.expires_at), token_type: "bearer", type: tipo,
  });
  return [303, null, { location: `${destino}#${hash}` }];
}

async function auth(caminho, url, corpo, req) {
  if (caminho === "/auth/v1/token" && url.searchParams.get("grant_type") === "password") {
    const email = String(corpo.email ?? "").toLowerCase();
    const usuario = await usuarioPorEmail(email);
    if (!usuario || SENHAS.get(email) !== corpo.password) {
      return [400, { code: "invalid_credentials", error_code: "invalid_credentials", msg: "Invalid login credentials" }];
    }
    if (!usuario.confirmado) return [400, { code: "email_not_confirmed", error_code: "email_not_confirmed", msg: "Email not confirmed" }];
    return [200, sessao(usuario)];
  }
  if (caminho === "/auth/v1/token" && url.searchParams.get("grant_type") === "refresh_token") {
    const usuario = refreshs.get(corpo.refresh_token);
    if (!usuario) return [400, { code: "refresh_token_not_found", msg: "Invalid Refresh Token" }];
    refreshs.delete(corpo.refresh_token);
    return [200, sessao((await usuarioPorId(usuario.id)) ?? usuario)];
  }
  if (caminho === "/auth/v1/signup") {
    const email = String(corpo.email ?? "").trim().toLowerCase();
    if (String(corpo.password ?? "").length < 6) return [422, { code: "weak_password", msg: "Password should be at least 6 characters." }];
    const recusa = await hookAntesDeCriarConta(email, corpo.data ?? {});
    if (recusa) return [recusa.http_code ?? 403, { error_code: "hook_rejected", msg: recusa.message }];
    if (await usuarioPorEmail(email)) {
      // como o GoTrue com confirmação ligada: não conta que o e-mail existe
      if (CONFIRMAR) return [200, { id: randomUUID(), email, identities: [], user_metadata: {} }];
      return [422, { code: "user_already_exists", msg: "User already registered" }];
    }
    const r = await psql(
      `insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
       values (gen_random_uuid(), :'email', ${CONFIRMAR ? "null" : "now()"}, :'meta'::jsonb) returning id`,
      { email, meta: JSON.stringify(corpo.data ?? {}) },
    );
    if (r.codigo !== 0) return [500, { msg: r.err }];
    SENHAS.set(email, corpo.password);
    const usuario = await usuarioPorEmail(email);
    return [200, CONFIRMAR ? sessao(usuario).user : sessao(usuario)];
  }
  if (caminho === "/auth/v1/bolso-link") {
    const usuario = await usuarioPorEmail(url.searchParams.get("email") ?? "");
    if (!usuario) return [404, { msg: "conta não existe" }];
    await psql(`update auth.users set email_confirmed_at = coalesce(email_confirmed_at, now()) where id = :'id'::uuid`, { id: usuario.id });
    return redirecionarComSessao(url.searchParams.get("redirect_to") ?? "/", await usuarioPorId(usuario.id), url.searchParams.get("tipo") ?? "signup");
  }
  if (caminho === "/auth/v1/resend" || caminho === "/auth/v1/recover") return [200, {}];
  if (caminho === "/auth/v1/user") {
    const p = lerJwt(req.headers.authorization);
    if (!p) return [401, { code: "bad_jwt", msg: "invalid JWT" }];
    if (req.method === "PUT") {
      const u = await usuarioPorId(p.sub);
      if (corpo.password) {
        if (SENHAS.get(u.email) === corpo.password) return [422, { code: "same_password", msg: "New password should be different from the old password." }];
        SENHAS.set(u.email, corpo.password);
      }
      if (corpo.data) {
        await psql(`update auth.users set raw_user_meta_data = coalesce(raw_user_meta_data, '{}') || :'meta'::jsonb where id = :'id'::uuid`, {
          id: p.sub, meta: JSON.stringify(corpo.data),
        });
      }
    }
    const usuario = await usuarioPorId(p.sub);
    return usuario ? [200, sessao(usuario).user] : [401, { code: "user_not_found", msg: "User not found" }];
  }
  if (caminho === "/auth/v1/logout") return [204, null];
  return [404, { msg: "não existe no bolso" }];
}

// ---------------------------------------------------------------------

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "apikey, authorization, content-type, x-client-info, prefer, accept-profile, content-profile, x-supabase-api-version",
  "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
};

http
  .createServer(async (req, res) => {
    if (req.method === "OPTIONS") {
      res.writeHead(204, CORS);
      return res.end();
    }
    let bruto = "";
    for await (const parte of req) bruto += parte;
    const url = new URL(req.url, "http://bolso");
    let corpo = {};
    try {
      corpo = bruto ? JSON.parse(bruto) : {};
    } catch {}
    let resposta;
    try {
      if (url.pathname.startsWith("/rest/v1/rpc/")) {
        resposta = await rpc(url.pathname.slice("/rest/v1/rpc/".length), corpo, lerJwt(req.headers.authorization));
      } else if (url.pathname.startsWith("/auth/v1/")) {
        resposta = await auth(url.pathname, url, corpo, req);
      } else {
        resposta = [404, { message: "não existe no bolso" }];
      }
    } catch (e) {
      resposta = [500, { message: String(e) }];
    }
    const [status, dados, extras = {}] = resposta;
    if (process.env.BOLSO_LOG) console.log(req.method, url.pathname, status, status >= 400 ? JSON.stringify(dados) : "");
    res.writeHead(status, { ...CORS, "content-type": "application/json", ...extras });
    res.end(status === 204 || dados === null ? undefined : JSON.stringify(dados));
  })
  .listen(PORTA, () => console.log(`supabase de bolso em http://localhost:${PORTA}`));
