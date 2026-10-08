# Estado atual — 08/10/2026

> O que existe, o que é demonstração e o que vem na fase de backend.
> Confirme sempre na fonte (`git log`, `list_migrations`) — documento envelhece.

## Decisões tomadas com o Pedro

| # | Decisão | Resultado |
|---|---|---|
| D-1 | Domínio | **`agenda.livo.tec.br/<negocio>`** — domínio da Livo, negócio no caminho (ver abaixo) |
| D-2 | Supabase | Projeto novo **`livo-agenda`** (`tgjbrabbimdwafvcshtx`, sa-east-1, plano gratuito) |
| D-3 | Primeiro nicho | Clínica de depilação — mas o sistema atende todos (barbearia, unhas, salão, estética, saúde) com **funções liga/desliga** por negócio |
| — | Ordem de trabalho | Frontend completo primeiro (com dados de exemplo), backend completo depois, função por função |

### Por que o negócio vai no caminho, e não no subdomínio

O planejamento recomendava `negocio.agenda.livo.tec.br`. Com a decisão de usar
o domínio da Livo, o caminho (`agenda.livo.tec.br/ambar`) ficou melhor:

- é o formato que o cliente final já conhece (o mesmo do MinhaAgenda) e que cabe
  na bio do Instagram;
- não exige DNS curinga nem certificado curinga — um registro só no domínio;
- funciona em `localhost` e em preview da Vercel sem configuração;
- não disputa o curinga `*.livo.tec.br`, que é dos restaurantes.

A segurança é a mesma do livo: o **servidor** lê o endereço e decide o negócio,
falha fechado para endereço desconhecido, e a autorização é a RLS. Domínio
próprio de cliente entra depois, pelo Host, no mesmo ponto (`lib/negocio-server.ts`).

## O que está pronto

### Frontend (completo)

| Área | Rotas |
|---|---|
| Página da Livo Agenda | `/` |
| Vitrine do negócio (4 peles) | `/<negocio>` |
| Agendamento em 4 passos | `/<negocio>/agendar` |
| Ver, confirmar, remarcar, cancelar, avaliar | `/<negocio>/a/<token>` |
| Ficha de anamnese do cliente | `/<negocio>/ficha/<token>` |
| Login + demonstração | `/painel/entrar` |
| Painel | `/painel` (Início), `agenda`, `clientes`, `clientes/<id>`, `clientes/importar`, `mensagens`, `servicos`, `equipe`, `financeiro`, `relatorios`, `anamnese`, `configuracoes` |

### Backend (básico)

| Peça | Estado |
|---|---|
| Migration `001_plataforma` | **aplicada** no `livo-agenda` |
| Tabelas | `tenants`, `tenant_members`, `platform_admins`, `store_settings` — RLS ligada nas 4 |
| `negocio_publico(slug)` | anon resolve a página (conferido no banco real) |
| `meus_negocios()` | login real descobre os negócios da pessoa |
| `criar_negocio(...)` | só platform admin |
| `vincular_membro(...)` | só pelo SQL Editor |
| Testes | `supabase/tests/rodar.sh` — **12 testes, 0 falhas** (Postgres descartável) |
| Advisor de segurança | 7 avisos, todos esperados (funções públicas de propósito — mesmo caso do FP-3 do livo) |

### O que ainda é DEMONSTRAÇÃO

Serviços, equipe, clientes, agendamentos, financeiro, fichas e mensagens vivem
no **navegador** (`lib/dados/loja.tsx`), gerados por `lib/demo/`. As telas falam
com essa camada só por funções puras (`lib/dados/acoes.ts`) — na fase de
backend, cada função vira uma chamada ao Supabase **sem mudar as telas**.

Por isso: um horário marcado em `/ambar` aparece no painel **do mesmo
navegador** (até entre abas), mas não no celular de outra pessoa.

## Como criar o login real do dono

1. Supabase › `livo-agenda` › **Authentication › Users › Add user** — e-mail e senha.
2. **SQL Editor**:
   ```sql
   -- negócio novo (ou use um dos de demonstração: ambar, navalha, jade)
   insert into public.tenants (slug, nome, nicho, pele)
   values ('minha-clinica', 'Minha Clínica', 'depilacao', 'beleza');
   select public.vincular_membro('dono@email.com', 'minha-clinica', 'owner');
   ```
3. Em `/painel/entrar`, entrar com o e-mail e a senha.

## Variáveis para a Vercel

| Variável | Valor |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://tgjbrabbimdwafvcshtx.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | a chave **publishable** do projeto (Settings › API) |
| `NEXT_PUBLIC_DEMO` | `1` enquanto quiser o botão de demonstração no login |

Domínio: adicionar `agenda.livo.tec.br` ao projeto novo na Vercel.

## Próximo: backend completo, função por função

Ordem sugerida (cada uma: SQL para aprovação → teste local → aplicar → trocar a
ação correspondente em `lib/dados/acoes.ts`):

1. **Serviços e categorias** — `services`, `service_categories` + `catalogo_publico(slug)`.
2. **Equipe e horários** — `professionals`, `working_hours`, `time_off`.
3. **Motor de horários no banco** — `horarios_disponiveis()` (porta de `lib/disponibilidade.ts`) e `agendamento_criar()` com `EXCLUDE` anti-conflito.
4. **Clientes** — com o importador já pronto gravando no banco.
5. **Agenda do painel** em tempo real (Realtime) + push de novo agendamento.
6. Financeiro, pacotes, fichas (bucket privado), mensagens.

Antes de entrar com a base real da clínica: rodar a etapa 4 — o importador já
aceita planilha (.csv), lista colada e contatos do celular (.vcf).
