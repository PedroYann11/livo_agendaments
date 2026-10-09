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
| D-8 | Cadastro com pagamento | **Conta só depois do pagamento** (Pedro, 09/10). Quem pagou recebe um link de convite e cria o próprio login, senha e negócio — a Livo não cria acesso. Uma compra = um negócio, presa ao e-mail de quem pagou |
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
| Entrar | `/painel/entrar` (também abre direto pelo link de confirmação do e-mail) |
| Criar conta **só com o convite da compra**: negócio (nome, tipo, endereço conferido na hora, WhatsApp) → acesso (nome, senha; e-mail preso ao da compra) → confirmar e-mail. Sem convite: "Sua agenda começa pela contratação" | `/painel/criar-conta?convite=…` |
| Conta sem negócio (endereço tomado antes da confirmação, ou abrir outro) | `/painel/criar-negocio` |
| Senha esquecida → link por e-mail → senha nova | `/painel/esqueci-senha`, `/painel/nova-senha` |
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
| `007_agenda_painel` | o que o painel chama | **aplicada** (09/10, pelo Pedro no SQL Editor — a ferramenta de migrations expirava esperando uma confirmação que não chegava ao app). Funções conferidas pelo md5, idênticas ao arquivo; painel testado em produção dentro de uma transação desfeita no fim |
| `008_cadastro` | cadastro com pagamento: licenças, convite, hook "antes de criar conta", `slug_disponivel`, `negocio_criar_meu` (depende da 007) | **aplicada** (09/10, aprovada pelo Pedro) antes da 007 — sem ela, criar negócio ainda falha. Advisor: só os avisos esperados das portas públicas |

A 008 entrou antes da 007 (que dependia do Pedro no SQL Editor); o registro da 007 no
histórico do banco ganhou a versão `20261009140000`, entre a 006 e a 008, e o histórico
segue a ordem do repositório: 001 a 008.

**Migration com `delete` dentro** (como a 007): a ferramenta da Supabase pede uma
confirmação que não chega ao app e expira. Caminho: o Pedro cola no SQL Editor e o
Claude confere e registra no histórico.

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

**O que o cadastro com pagamento (008) traz**

- `licencas` — cada compra paga vira uma licença presa ao e-mail de quem pagou (uma
  licença = um negócio). Só a plataforma lê (RLS); os negócios nunca veem.
- `licenca_emitir(email, plano, valor, origem, referencia)` — registra o pagamento e
  devolve o link de convite. Só pelo SQL Editor (ou, depois, pelo webhook do meio de
  pagamento com a service_role). Com a referência do pagamento, chamar de novo devolve o
  mesmo convite (o mesmo pagamento nunca vira duas licenças).
- `convite_publico(codigo)` — a tela de cadastro lê para quem é o convite (e-mail e
  plano; nada mais). O código tem 144 bits: não dá para adivinhar.
- `hook_antes_de_criar_conta(evento)` — chamado pela Supabase Auth antes de **cada**
  conta nascer ("Before User Created"): só passa e-mail com licença paga e não usada.
  Precisa ser ligado no painel da Supabase (abaixo).
- `slug_disponivel(slug)` — o formulário confere o endereço enquanto a pessoa digita
  (`ok`, `invalido`, `reservado`, `em_uso`). Os endereços reservados (`painel`,
  `admin`…) são os mesmos no site (`lib/enderecos.ts`) e no banco (`slug_reservado`);
  um teste compara as duas listas.
- `negocio_criar_meu(dono, negocio)` — só conta logada, **com e-mail confirmado e
  licença paga**; cria o negócio (com o plano da licença), torna a pessoa dona, grava
  identidade e configuração pela mesma porta do painel (`negocio_salvar`, com as mesmas
  checagens), cria a primeira profissional (a própria pessoa, no horário da semana do
  negócio) e **gasta a licença**. Tudo ou nada: se algo falha, a compra continua
  valendo. Dois pedidos ao mesmo tempo não gastam a mesma compra duas vezes (testado
  com duas conexões simultâneas).
- O negócio que a pessoa descreve no cadastro fica guardado na conta até o e-mail ser
  confirmado; no primeiro login ele nasce e o rascunho é apagado.

**Por que 5 partes**: o pedido com a agenda inteira de uma vez não passava pela
ferramenta da Supabase. Cada parte é uma migration; o histórico do banco e o
repositório têm as mesmas 5.

**Testes** — `./supabase/tests/rodar.sh`: 38 testes (suítes 001, 002, a da agenda, `007_agenda.sql`,
e a do cadastro, `008_cadastro.sql`), a conferência dos endereços reservados e a
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

O "Supabase de bolso" responde como o Supabase (RPC, login e cadastro) em cima do
Postgres de teste, com os mesmos papéis e a mesma RLS. Contas criadas pelo cadastro
já funcionam; com `BOLSO_CONFIRMAR=1` elas nascem sem e-mail confirmado, como em
produção, e o "link do e-mail" é
`http://localhost:54321/auth/v1/bolso-link?email=…&tipo=signup&redirect_to=http://localhost:3000/painel/entrar`
(`tipo=recovery` e `redirect_to=…/painel/nova-senha` para a senha esquecida).

## Como alguém passa a usar

**Negócio novo** — depois do pagamento:

1. A Livo registra a compra e pega o link de convite (até o meio de pagamento
   automático existir, pelo SQL Editor):
   ```sql
   select public.licenca_emitir('email@do.cliente', 'mensal', 49.90, 'pix');
   ```
   A resposta traz o `link` (`https://agenda.livo.tec.br/painel/criar-conta?convite=…`).
2. Manda o link para o cliente (WhatsApp ou e-mail).
3. O cliente cria o próprio acesso e o negócio. Com outro e-mail que não o da compra, a
   conta não nasce. Para trocar o e-mail da compra antes do cadastro:
   `update public.licencas set email = 'novo@email.com' where email = 'antigo@email.com' and situacao = 'paga';`

Quem só quer conhecer cai em "Sua agenda começa pela contratação". Com a variável
`NEXT_PUBLIC_LIVO_WHATSAPP` na Vercel (o WhatsApp comercial da Livo), a tela mostra o
botão "Quero contratar".

**DepiLED** (o negócio já existe, criado pela 002 — caso único do piloto): o
cadastro do site criaria um negócio novo, então aqui a Livo liga a conta uma vez.
Em Authentication › Users › Add user (e-mail do dono, senha provisória, "Auto
Confirm User") e, no SQL Editor:

```sql
select public.vincular_membro('email@dono.com', 'depiled', 'owner');
```

Depois o dono troca a senha sozinho em "Esqueci minha senha" (precisa do e-mail
próprio configurado, abaixo). **Fazer isso antes de ligar o hook** (passo 5 abaixo):
com ele ligado, só e-mail com compra ganha conta.

### Configurar o login na Supabase (uma vez, no painel da Supabase)

1. **Authentication › Sign In / Providers › Email**: "Allow new users to sign up" ligado e
   **"Confirm email" ligado**.
2. **Authentication › URL Configuration**: Site URL `https://agenda.livo.tec.br`; em
   Redirect URLs, `https://agenda.livo.tec.br/painel/**`. Sem isso, o link do e-mail
   cai na página inicial em vez do painel.
3. **E-mail próprio (SMTP)** — obrigatório para vender: o e-mail padrão da Supabase só
   entrega para quem é da equipe do projeto e manda poucos por hora. Criar conta no
   Resend (ou outro), verificar o domínio `livo.tec.br` (registros SPF/DKIM no DNS) e
   preencher em **Authentication › Emails › SMTP Settings** (remetente, por exemplo,
   `nao-responda@livo.tec.br`). Depois, em **Rate Limits**, subir o limite de e-mails
   por hora.
4. **Authentication › Emails › Templates** em português (abaixo).
5. **Authentication › Hooks › "Before User Created"** › Postgres ›
   `public.hook_antes_de_criar_conta`. É o que impede conta sem pagamento. Sem ele, o
   site já não deixa cadastrar sem convite e o banco não deixa criar negócio sem compra,
   mas alguém que chame a API da Supabase direto ainda conseguiria uma conta vazia.

Textos dos e-mails:
   - *Confirm signup* — assunto "Confirme seu e-mail · Livo Agenda"; texto: "Toque no
     link para ativar sua conta e criar sua agenda: {{ .ConfirmationURL }}".
   - *Reset password* — assunto "Crie uma senha nova · Livo Agenda"; texto: "Toque no
     link para criar uma senha nova: {{ .ConfirmationURL }}. Se não foi você, ignore."

### Aplicar uma migration pelo SQL Editor (feito assim com a 007)

1. Abrir `supabase/migrations/007_agenda_painel.sql` no GitHub (branch
   `claude/peaceful-cerf-4g1pqx`) › "Copy raw file".
2. Supabase › SQL Editor › colar › **Run**. Se o editor perguntar sobre operação
   destrutiva, pode confirmar: os `delete` ficam dentro das funções e só rodam quando o
   dono remove algo no painel; aplicar a 007 não apaga nada.
3. Avisar o Claude: ele confere as funções, roda o advisor de segurança e registra a
   007 no histórico de migrations, para o banco e o repositório continuarem iguais.

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

1. **Login da DepiLED**: criar o usuário do dono em Authentication › Users e ligar com
   `vincular_membro` → entrar no painel em produção. **Antes** de ligar o hook.
2. **Configurar o login na Supabase** (SMTP próprio, endereço de retorno, textos em
   português e o hook "Before User Created") → emitir um convite de teste e fazer um
   cadastro de verdade.
3. **Meio de pagamento**: escolher (Mercado Pago, Asaas, Stripe…) e ligar o aviso de
   pagamento confirmado a `licenca_emitir` + envio do convite por e-mail. Depois:
   mensalidade, vencimento e o que acontece com o negócio quando a assinatura para.
4. Carga dos **112 clientes** da DepiLED, depois da limpeza combinada.
5. **Aviso de agendamento novo** no celular do dono (push) — hoje o painel relê a cada 30 s.
6. **Imagens no Storage** (hoje a logo enviada pelo painel vai como imagem embutida na configuração, até 2 MB).
7. Profissional só com a própria agenda na RLS (hoje a equipe inteira vê a agenda toda).
8. Tema por negócio (a planejar).
9. Proteção contra robôs no cadastro (CAPTCHA da Supabase) quando o link começar a ser divulgado.
