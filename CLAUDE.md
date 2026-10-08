# CLAUDE.md — Livo Agenda

> Lido no início de toda sessão. Contém o que **não muda**. O plano e as fases
> estão em `docs/PLANEJAMENTO.md`; o que já existe, em `docs/ESTADO.md`.

## 1. O que é

SaaS multi-tenant de **agendamento de serviços**. Mesma arquitetura da Livo
(restaurantes, repositório `PedroYann11/livo`), outro produto: vitrine de
serviços no lugar do cardápio, horário no lugar do carrinho, agendamento no
lugar do pedido.

**O repositório `livo` nunca é alterado a partir daqui.** Código de lá entra por
cópia, com a linha `// Origem: livo@<commit> · <caminho>` no topo e registro em
`docs/ORIGEM.md`.

## 2. Invariantes

- **A fronteira de segurança é a RLS** por `is_member(tenant_id)` / `has_role`.
  Filtro no frontend não é segurança.
- `anon` nunca faz SELECT direto em tabela de negócio: só RPCs
  `SECURITY DEFINER` filtradas por `p_tenant`, com colunas em whitelist.
- O negócio vem do **endereço**, decidido no servidor
  (`agenda.livo.tec.br/<negocio>` → `resolverNegocio()` em
  `lib/negocio-server.ts`), nunca de algo que o front escolha. Endereço
  desconhecido falha fechado: "Negócio não encontrado".
- `tenant_id NOT NULL` **sem default** em toda tabela de negócio; FKs compostas
  `(id, tenant_id)`.
- **Disponibilidade e preço são decididos no banco.** A função que mostra os
  horários é a mesma que valida a gravação. A constraint `EXCLUDE` impede dois
  agendamentos sobrepostos para o mesmo profissional.
- Datas em `timestamptz`; contas no fuso do negócio.
- Remoção é suave (`active = false`).
- Segredos só no Supabase Vault. Mensagens de WhatsApp em texto puro.
- O painel é da Livo (cores fixas, contraste testado); a vitrine é do negócio.

## 3. Fatos

| Item | Valor |
|---|---|
| Supabase | `livo-agenda` · `tgjbrabbimdwafvcshtx` (sa-east-1) |
| Endereço público | `agenda.livo.tec.br/<negocio>` |
| Vercel | projeto **`livo-agenda`** (time `pedro-yan`) — não confundir com `duo-acai`, que é a Livo dos restaurantes |
| Piloto | **DepiLED** (`/depiled`). Sem negócios de demonstração |
| Dados do painel | ainda no **navegador** (`lib/dados/loja.tsx`), a partir da semente pública (`lib/sementes/`); a troca pelo banco é a fase de backend |
| Dados pessoais | **nunca** em arquivo versionado (o repositório é público): só no banco, com RLS |
| Testes do banco | `./supabase/tests/rodar.sh` (Postgres descartável) |
| Stack | Next.js 16 · React 19 · TypeScript · CSS puro com variáveis · Motion · Supabase |

## 4. Como trabalhar

- Português claro, sem jargão; diagnóstico antes da solução.
- **SQL primeiro**: toda mudança de banco é migration versionada em
  `supabase/migrations/`, entregue para aprovação antes de aplicar, testada no
  Postgres descartável e depois em staging.
- Rodar o advisor de segurança após qualquer DDL.
- Testar de verdade (build + banco) e entregar roteiro de teste.
- Nunca afirmar que algo funciona, está seguro ou deployado sem verificar.
- Commits pequenos, um por etapa, mensagem descritiva.
