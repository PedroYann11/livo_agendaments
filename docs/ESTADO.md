# Estado atual — 08/10/2026

> O que existe, o que ainda grava só no navegador, o que falta confirmar com
> a DepiLED e o que vem na fase de backend.
> Confirme sempre na fonte (`git log`, `list_migrations`) — documento envelhece.

## Decisões tomadas com o Pedro

| # | Decisão | Resultado |
|---|---|---|
| D-1 | Domínio | **`agenda.livo.tec.br/<negocio>`** — domínio da Livo, negócio no caminho (ver abaixo) |
| D-2 | Supabase | Projeto novo **`livo-agenda`** (`tgjbrabbimdwafvcshtx`, sa-east-1, plano gratuito) |
| D-3 | Primeiro nicho | Clínica de depilação — mas o sistema atende todos (barbearia, unhas, salão, estética, saúde) com **funções liga/desliga** por negócio |
| D-4 | Sem demonstração | Os 3 negócios inventados saíram (código) e foram **suspensos** no banco (migration 002). O piloto é real: **DepiLED** |
| D-5 | Agendamento do cliente | **Categoria → opções → calendário do mês → horários do dia → dados**. Pouco texto, uma decisão por tela |
| — | Ordem de trabalho | Frontend completo primeiro, backend depois, função por função |

### Por que o negócio vai no caminho, e não no subdomínio

O planejamento recomendava `negocio.agenda.livo.tec.br`. Com a decisão de usar
o domínio da Livo, o caminho (`agenda.livo.tec.br/depiled`) ficou melhor:

- é o formato que o cliente final já conhece (o mesmo do MinhaAgenda) e que cabe
  na bio do Instagram;
- não exige DNS curinga nem certificado curinga — um registro só no domínio;
- funciona em `localhost` e em preview da Vercel sem configuração;
- não disputa o curinga `*.livo.tec.br`, que é dos restaurantes.

A segurança é a mesma do livo: o **servidor** lê o endereço e decide o negócio,
falha fechado para endereço desconhecido, e a autorização é a RLS. Domínio
próprio de cliente entra depois, pelo Host, no mesmo ponto (`lib/negocio-server.ts`).

## Piloto: DepiLED

| Item | Estado |
|---|---|
| Página | `agenda.livo.tec.br/depiled` (precisa da migration 002 aplicada) |
| Marca | logo e símbolo do lótus em `public/marcas/depiled/`; cor `#62513f` tirada da logo; pele "beleza" (serifa Instrument) |
| Catálogo | `lib/sementes/depiled.ts` — 3 categorias, 34 serviços com preço e duração do app atual |
| Clientes | **112** transcritos das capturas, guardados **fora do repositório**. Entram quando existir a tabela de clientes (fase de backend, etapa 4) |
| Agenda | 11 atendimentos de sáb. 10/10 vistos nas capturas — entram com a etapa 3/5 |

### A confirmar com a DepiLED

- **Expediente** — o app atual não mostra. Está provisório: seg–sex 08–18, sáb 08–13.
- **Quem atende** — hoje há uma agenda só, chamada "DepiLED". Nome(s) da(s) profissional(is)?
- **WhatsApp, Instagram e endereço** da página.
- **3 serviços sem categoria** no app atual (Auréola, Meia Perna + Virilha Completa,
  Virilha Completa Parceria): estão só no painel, fora do link. Entram em alguma categoria?
- **Texto completo** da mensagem "Um dia antes" (a captura corta no meio).
- **Lista de clientes:** tirar o sufixo "Cliente Depiled" dos nomes? Juntar as
  duplicadas (mesmo nome ou mesmo telefone)? 18 estão sem telefone; um telefone
  está incompleto.

### Funções do app atual que ainda não temos (para avaliar)

Salas, cartão fidelidade, taxas de cartão (lucro líquido), recibo, "cortesia"
como forma de pagamento e mensagens prontas livres (além dos modelos fixos).

## O que está pronto

### Frontend

| Área | Rotas |
|---|---|
| Página da Livo Agenda (tipos de negócio atendidos) | `/` |
| Página do negócio (4 peles) | `/<negocio>` |
| Agendamento: categoria → opções → calendário → horário → dados | `/<negocio>/agendar` (`?categoria=…`, `?servico=…`) |
| Ver, confirmar, remarcar (calendário), cancelar, avaliar | `/<negocio>/a/<token>` |
| Ficha de anamnese do cliente | `/<negocio>/ficha/<token>` |
| Login (só com conta) | `/painel/entrar` |
| Painel | `/painel` (Início), `agenda`, `clientes`, `clientes/<id>`, `clientes/importar`, `mensagens`, `servicos` (com categorias), `equipe`, `financeiro`, `relatorios`, `anamnese`, `configuracoes` |

### Backend (básico)

| Peça | Estado |
|---|---|
| Migration `001_plataforma` | **aplicada** no `livo-agenda` |
| Migration `002_depiled` | **escrita e testada; aplicar só com aprovação** |
| Tabelas | `tenants`, `tenant_members`, `platform_admins`, `store_settings` — RLS ligada nas 4 |
| `negocio_publico(slug)` | anon resolve a página (só negócio `active`) |
| `meus_negocios()` | login real descobre os negócios da pessoa (só `active`) |
| `criar_negocio(...)` | só platform admin |
| `vincular_membro(...)` | só pelo SQL Editor |
| Testes | `supabase/tests/rodar.sh` — cada migration testada logo depois de aplicada; **17 testes, 0 falhas** |

### O que ainda grava só no NAVEGADOR

Serviços, equipe, clientes, agendamentos, financeiro, fichas e mensagens vivem
no **navegador** (`lib/dados/loja.tsx`). O negócio começa pela semente pública
(`lib/sementes/`); o painel mostra a faixa "Fase de testes: o que você muda aqui
fica só neste aparelho". As telas falam com essa camada só por funções puras
(`lib/dados/acoes.ts`) — na fase de backend, cada função vira uma chamada ao
Supabase **sem mudar as telas**.

**Não divulgar o link da DepiLED para clientes antes da etapa 3** (agendamentos
no banco): até lá, um horário marcado fica só no celular de quem marcou.

## Como criar o login real do dono

1. Supabase › `livo-agenda` › **Authentication › Users › Add user** — e-mail e senha.
2. **SQL Editor**:
   ```sql
   select public.vincular_membro('email@dono.com', 'depiled', 'owner');
   ```
3. Em `/painel/entrar`, entrar com o e-mail e a senha.

## Publicação (Vercel)

| Item | Valor |
|---|---|
| Projeto | **`livo-agenda`** (time `pedro-yan`), região das funções `gru1` (São Paulo, perto do Supabase) |
| Endereço | **https://agenda.livo.tec.br** — domínio verificado, certificado da Vercel |
| Branch de produção | `claude/peaceful-cerf-4g1pqx` (a única do repositório hoje). Todo push nela vai ao ar. Quando existir uma `main`, trocar em Settings › Git |
| Proteção | URLs `*.vercel.app` pedem login da Vercel; o domínio próprio é público |

Variáveis (Production, Preview e Development):

| Variável | Valor |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://tgjbrabbimdwafvcshtx.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | a chave **publishable** do projeto (Settings › API) |
| `NEXT_PUBLIC_DEMO` | não é mais usada (a demonstração saiu); pode ser apagada |

## Repositório público: cuidado com dados pessoais

O repositório `PedroYann11/livo_agendaments` é **público**. As capturas do app
antigo (nomes e telefones de clientes) foram tiradas da árvore no commit
`262489b`, mas **continuam no histórico** do git. Para resolver de vez:
tornar o repositório privado e, se quiser, reescrever o histórico (exige
force-push — só com autorização expressa). Dados de clientes nunca entram em
arquivo versionado: vão para o banco, com RLS.

## Próximo: backend completo, função por função

Ordem sugerida (cada uma: SQL para aprovação → teste local → aplicar → trocar a
ação correspondente em `lib/dados/acoes.ts`):

1. **Serviços e categorias** — `service_categories`, `services` + `catalogo_publico(slug)`; a semente da DepiLED vira linhas no banco.
2. **Equipe e horários** — `professionals`, `working_hours`, `time_off`.
3. **Motor de horários no banco** — `horarios_disponiveis()` (porta de `lib/disponibilidade.ts`) e `agendamento_criar()` com `EXCLUDE` anti-conflito.
4. **Clientes** — tabela com RLS e carga dos 112 clientes da DepiLED (limpeza combinada antes).
5. **Agenda do painel** em tempo real (Realtime) + push de novo agendamento.
6. Financeiro, pacotes, fichas (bucket privado), mensagens.
