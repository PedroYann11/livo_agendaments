# Estado atual — 09/10/2026

> O que existe, o que falta confirmar com a DepiLED e o que vem a seguir.
> Confirme sempre na fonte (`git log`, `list_migrations`) — documento envelhece.

## Decisões tomadas com o Pedro

| # | Decisão | Resultado |
|---|---|---|
| D-1 | Domínio | **`agenda.livo.tec.br/<negocio>`** — domínio da Livo, negócio no caminho (ver abaixo) |
| D-2 | Supabase | Projeto novo **`livo-agenda`** (`tgjbrabbimdwafvcshtx`, sa-east-1, plano gratuito) |
| D-3 | Primeiro nicho | Clínica de depilação — mas o sistema atende todos (barbearia, unhas, salão, estética, saúde) com **funções liga/desliga** por negócio |
| D-4 | Sem demonstração | Os 3 negócios inventados saíram (código) e foram **suspensos** no banco (migration 002). O piloto é real: **DepiLED** |
| D-5 | Agendamento do cliente | **Categoria → opções → calendário do mês → horários do dia → dados**. Pouco texto, uma decisão por tela |
| D-6 | Dias de atendimento | Negócio que atende em datas soltas (a DepiLED: um sábado por mês) usa **dias avulsos**; o painel abre e fecha dias e bloqueia horários |
| D-7 | Encaixe | O fim de cada atendimento vira horário livre: 15 min às 08:00 liberam 08:15, mesmo com passos de 10 min |
| — | Tema por negócio | A planejar. Hoje: 4 "peles", cores e logo editáveis no painel |

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
| Página | `agenda.livo.tec.br/depiled` |
| Painel | `agenda.livo.tec.br/painel` (`/depiled/admin` e `/admin` levam para lá) |
| Marca | logo e símbolo do lótus em `public/marcas/depiled/`; cor `#62513f` tirada da logo; pele "beleza" (serifa Instrument) |
| Catálogo | 3 categorias, 34 serviços com preço, duração e descrição curta. Com a agenda no banco (006), mora lá |
| Expediente | **um sábado por mês, 08h–14h** (Pedro, 09/10 — vai confirmar com a DepiLED). Dia avulso de 10/10 já cadastrado; os próximos, pelo painel (Agenda › "Abrir este dia") |
| Clientes | **112** transcritos das capturas, guardados **fora do repositório**. Entram por carga própria depois da 007, com a limpeza combinada |
| Agenda | 11 atendimentos de sáb. 10/10 vistos nas capturas — seguem no app antigo neste sábado |

### A confirmar com a DepiLED

- **Expediente** — um sábado por mês, 08–14: confirmar.
- **Quem atende** — hoje há uma agenda só, chamada "DepiLED". Nome(s) da(s) profissional(is)?
- **WhatsApp, Instagram e endereço** da página.
- **Texto completo** da mensagem "Um dia antes" (a captura corta no meio).
- **Lista de clientes:** tirar o sufixo "Cliente Depiled" dos nomes (é do jeito que o
  MinhaAgenda salva contato)? Juntar as duplicadas (mesmo nome ou telefone)? 18 estão
  sem telefone; um telefone está incompleto.

Decidido: os 3 serviços sem categoria (Auréola, Meia Perna + Virilha Completa,
Virilha Completa Parceria) ficam fora do link até o dono pôr numa categoria.

### Funções do app atual que ainda não temos (para avaliar)

Salas, cartão fidelidade, taxas de cartão (lucro líquido), recibo, "cortesia"
como forma de pagamento e mensagens prontas livres (além dos modelos fixos).
Já temos: cliente a partir dos **contatos do celular** (Android; no iPhone, pelo
arquivo `.vcf` em Importar), com o sufixo "Cliente <negócio>" tirado do nome.

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

### Banco

| Migration | O que faz | Estado |
|---|---|---|
| `001_plataforma` | negócios, membros, configuração; `negocio_publico`, `meus_negocios`, `criar_negocio`, `vincular_membro` | **aplicada** |
| `002_depiled` | DepiLED no ar; âmbar, navalha e jade `suspended` | **aplicada** |
| `003_agenda_tabelas` | tabelas, gatilhos e RLS da agenda | **aplicada** (09/10, aprovada pelo Pedro) |
| `004_agenda_motor` | peças comuns e o motor de horários | **aplicada** |
| `005_agenda_portas_publicas` | o que a página e o link do cliente chamam | **aplicada** |
| `006_agenda_depiled` | catálogo e dia avulso da DepiLED | **aplicada** |
| `007_agenda_painel` | o que o painel chama | **falta aplicar** — tem remoções (`delete`) e a Supabase pede a confirmação de quem aplica; o pedido expira sem ela |

**O que a agenda no banco (003 a 007) traz**

- Tabelas `categorias`, `servicos`, `profissionais`, `bloqueios`, `clientes`,
  `agendamentos` e `registros` (financeiro, pacotes, fichas, cupons, avaliações e
  modelos de mensagem, em jsonb até cada um ganhar regra própria). RLS em todas;
  `anon` fora de todas.
- **Motor de horários no banco** (`vagas_do_dia`), porta de `lib/disponibilidade.ts`:
  a mesma função mostra as vagas ao cliente e valida a gravação. A constraint
  `sem_conflito` (EXCLUDE) impede dois horários sobrepostos para a mesma
  profissional — inclusive com dois cliques no mesmo segundo e o intervalo de limpeza.
- **Página pública**: `pagina_publica` (só o que o cliente pode ver), `vagas_publicas`,
  `agendar` (vaga e **preço decididos no banco**; cliente reconhecido pelo telefone,
  sem revelar o nome guardado; até 5 horários em aberto por telefone), e o link do
  cliente por token: `agendamento_publico`, `_cancelar`, `_remarcar` (dentro do prazo),
  `_confirmar`, `_avaliar`, `ficha_enviar`, `cupom_publico`.
- **Painel**: `painel_dados` e `painel_salvar` rodam **como quem está logado** (a RLS
  decide): recepção agenda e cadastra cliente; catálogo, equipe, dados do negócio e
  financeiro só dono/admin. O lote é tudo ou nada. `negocio_salvar` valida nome,
  aparência, fuso, regras e cores.
- DepiLED: catálogo e o dia avulso de 10/10 passam do código para o banco (só dado público).

**Por que 5 partes**: o pedido com a agenda inteira de uma vez não passava pela
ferramenta da Supabase. Cada parte é uma migration; o histórico do banco e o
repositório têm as mesmas 5.

**Testes** — `./supabase/tests/rodar.sh`: 30 testes (suítes 001, 002 e a da agenda, `007_agenda.sql`) e a
**paridade** — agendas sorteadas, o motor do navegador e o do banco têm que dar as
mesmas vagas, pedido por pedido (1.200 pedidos por rodada; conferido que pega
diferença quando o motor é estragado de propósito).

### Como o app usa o banco

`lib/dados/loja.tsx` tem três modos com a mesma interface para as telas:

| Modo | Quando | Como |
|---|---|---|
| **painel** | Supabase configurado | abre com `painel_dados`; cada mudança aparece na hora e vai ao banco como lote (`painel_salvar`); se o banco recusar, a tela volta ao que ele tem e avisa. Relê a cada 30 s e ao voltar para a aba |
| **publico** | Supabase configurado | o servidor lê `pagina_publica` uma vez por requisição (a página já sai pronta); vagas e agendamento pelo banco; o link fala pelo token |
| **local** | sem Supabase, ou **banco sem a agenda (003–007)** | tudo no navegador, a partir da semente (`lib/sementes`), com a faixa "Modo de testes" no painel |

O código detecta sozinho o que o banco já tem: sem as portas da página, a página
segue no modo local; sem as do painel (007), o painel segue no modo local. Quando
elas chegam, passa ao banco **sem precisar publicar de novo**.

### Testar as telas contra o banco, sem tocar em produção

```
./supabase/tests/rodar.sh --manter                    # Postgres de teste com as migrations
BOLSO_SENHAS="dona@depiled.teste:senha123" node supabase/tests/bolso/servidor.mjs
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=bolso npx next dev
```

O "Supabase de bolso" responde como o Supabase (RPC e login) em cima do Postgres de
teste, com os mesmos papéis e a mesma RLS. O usuário de teste precisa existir em
`auth.users` e ser ligado com `vincular_membro`.

## Como criar o login real do dono

1. Supabase › `livo-agenda` › **Authentication › Users › Add user** — e-mail e senha
   (marcar "Auto Confirm User").
2. **SQL Editor**:
   ```sql
   select public.vincular_membro('email@dono.com', 'depiled', 'owner');
   ```
3. Em `agenda.livo.tec.br/painel`, entrar com o e-mail e a senha.

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

## Próximos passos

1. **Aplicar a 007** (painel) com o Pedro por perto para confirmar → conferir o login e o painel em produção.
2. **Login da DepiLED** (passos acima) e carga dos **112 clientes**, depois da limpeza combinada.
3. **Aviso de agendamento novo** no celular do dono (push) — hoje o painel relê a cada 30 s.
4. **Imagens no Storage** (hoje a logo enviada pelo painel vai como imagem embutida na configuração, até 2 MB).
5. Profissional só com a própria agenda na RLS (hoje a equipe inteira vê a agenda toda).
6. Tema por negócio (a planejar).
