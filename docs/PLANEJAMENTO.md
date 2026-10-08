# Livo Agenda — Planejamento

> 08/10/2026 · documento de partida, escrito **antes de qualquer código**.
> Referência de mercado: MinhaAgenda (maapp.com.br).
> Base técnica: repositório `PedroYann11/livo` no commit `d74d591`, lido e
> **não alterado**.

---

## 0. Resumo em seis linhas

1. A Livo Agenda é a Livo aplicada a **serviços com hora marcada**: no lugar do
   cardápio, uma vitrine de serviços; no lugar do carrinho, um horário; no lugar
   do pedido, um agendamento.
2. **Repositório próprio, banco próprio, deploy próprio.** O `livo` não é tocado:
   a fundação dele (multi-tenant, RLS, design system do painel, push, equipe) é
   **copiada com registro de origem** para cá, e o que é de restaurante fica lá.
3. O coração novo é um **motor de disponibilidade no banco**: a mesma função
   mostra os horários livres ao cliente e valida a gravação, e uma constraint do
   Postgres torna **impossível** marcar dois clientes no mesmo horário.
4. Para o **cliente**: agendar em até 4 toques, sem criar conta, com link para
   reagendar ou cancelar. Para o **dono**: abrir o app e ver a agenda do dia.
5. WhatsApp em duas fases: primeiro **assistido** (mensagem pronta, um toque,
   custo zero — padrão que o `livo` já usa); depois **automático** pela API
   oficial, como módulo pago.
6. MVP vendável = **F0 a F4** (fundação → serviços e equipe → agendamento online
   → agenda do dono → clientes e WhatsApp). Financeiro, comissões e anamnese vêm
   em seguida.

---

## 1. Antes de começar — as cinco perguntas

### 1.1 Quem é o público-alvo?

Dois públicos, com necessidades opostas:

| | Quem é | O que quer | Onde usa |
|---|---|---|---|
| **Dono / profissional** | barbeiro, cabeleireira, manicure, esteticista, designer de sobrancelha, fisioterapeuta, nutricionista, psicólogo, personal, pet shop | parar de responder "tem horário amanhã?" no WhatsApp, não perder cliente por falta, saber quanto ganhou | **celular**, entre um atendimento e outro, com a mão ocupada |
| **Cliente final** | qualquer pessoa, muitas vezes chegando pelo link da bio do Instagram | marcar sem conversar, em menos de 1 minuto, e receber lembrete | celular, navegador do Instagram/WhatsApp, sem instalar nada |

Consequência de projeto: **mobile-first nos dois lados**. O painel é PWA
instalável (o `livo` já resolve isso), e a página pública precisa abrir rápido
no navegador embutido do Instagram.

### 1.2 Qual é o objetivo principal?

- **Do site público:** converter visita em agendamento confirmado.
  Métrica-norte: *visitas → agendamentos concluídos*.
- **Do painel:** a agenda do dia sem fricção e **menos faltas**. Falta é o maior
  prejuízo do nicho — horário vazio não se recupera.

### 1.3 O que o cliente (dono) edita sozinho?

| Área | O que edita |
|---|---|
| Identidade | logo, capa, cor da marca, nome, frase, descrição, fotos do espaço |
| Serviços | criar/editar/remover, **pausar**, duração, preço (exibir / "a partir de" / ocultar), foto, categoria, quem atende |
| Equipe | profissionais, foto, bio, serviços que cada um faz, **horário de cada um**, % de comissão, acesso ao painel e papel |
| Funcionamento | horário semanal com intervalo de almoço, feriados e folgas, bloqueios pontuais |
| Regras de agendamento | antecedência mínima, até quantos dias à frente, intervalo entre atendimentos, confirmação automática ou manual, política de cancelamento |
| Mensagens | textos de confirmação, lembrete, aniversário, pós-atendimento |
| Contato e redes | WhatsApp, Instagram, endereço com mapa, Pix |
| Depoimentos | aprovar/ocultar avaliações |
| Promoções | cupons e pacotes (fase posterior) |
| Financeiro | despesas, categorias, metas do mês |
| Anamnese | modelos de ficha por serviço |

### 1.4 Quais métricas importam?

| Métrica | Por que importa |
|---|---|
| **Taxa de ocupação** (horas marcadas ÷ horas disponíveis) | o "faturamento potencial" que está ficando na mesa |
| **Taxa de faltas** e de cancelamento em cima da hora | o maior prejuízo do nicho; mede se os lembretes funcionam |
| Faturamento previsto (agendado) × realizado (concluído) | o dono vê o mês antes de ele acontecer |
| Ticket médio e serviços mais rentáveis **por hora** | um serviço caro e longo pode render menos por hora que um barato e rápido |
| Clientes novos × recorrentes, **frequência de retorno** | serviço é recorrência; quem não volta em 45 dias é cliente em risco |
| Clientes inativos (já existe no `livo`: `clientesInativos`) | base para campanha de retorno |
| Horários e dias de pico / ociosos | onde pôr promoção |
| Origem do agendamento (link online × painel × WhatsApp) | prova o valor do produto para o dono |
| Comissão e produção por profissional | fechamento do mês da equipe |

### 1.5 Como transmitir credibilidade pelo design?

- **Página pública com a cara do negócio** — não um link genérico de plataforma.
  É o diferencial que o `livo` já vende contra Goomer/Anota Aí, e é o mesmo
  contra o MinhaAgenda.
- Fotos reais do espaço e da equipe, avaliações com nome e data, endereço com
  mapa, horário de funcionamento claro, Instagram verificável.
- Preço e duração **transparentes** antes de marcar.
- Confirmação imediata e profissional: tela de sucesso, botão "adicionar à
  minha agenda" (.ics), mensagem de WhatsApp bem escrita.
- Nada quebrado: estados vazios bonitos, carregamento suave, nenhum texto de
  desenvolvedor na tela.
- Identidade por nicho (seção 6): barbearia não pode parecer clínica, clínica
  não pode parecer salão.

---

## 2. Decisão de arquitetura: copiar a fundação, não acoplar

### 2.1 Opções avaliadas

| Opção | Prós | Contras | Veredito |
|---|---|---|---|
| **A. Módulo dentro do `livo`** | um deploy, um banco | viola a premissa ("sem mexer no livo"); produção da Duo sem staging nem PITR — cada migration de agenda arrisca o restaurante | descartada |
| **B. Repositório novo, fundação copiada, banco novo** | zero risco ao `livo`; liberdade de modelar a agenda; aproveita tudo o que já foi auditado | correções da fundação precisam ser portadas à mão entre os dois | **recomendada** |
| **C. Extrair pacote `@livo/core` compartilhado** | uma fonte só da fundação | exige mexer no `livo` agora; abstração antes da hora, com um só consumidor real | adiada — reavaliar quando houver 3 produtos |

### 2.2 Como a cópia é feita

- Cada arquivo trazido do `livo` ganha no topo uma linha
  `// Origem: livo@d74d591 · lib/tenant.ts` e entra numa tabela em
  `docs/ORIGEM.md`. Quando o `livo` corrigir algo na fundação, sabemos o que
  portar.
- Copia-se **o mínimo que funciona**, não a pasta inteira. Restaurante (carrinho,
  entrega, KDS, impressão, fiscal, estoque, PDV) fica lá.
- Nada de `if (produto === "agenda")`: aqui é outro produto, com o próprio
  domínio.

### 2.3 Infraestrutura

| Item | Livo Agenda | Observação |
|---|---|---|
| Repositório | `PedroYann11/livo_agendaments` | este |
| Supabase | **projeto novo** (sa-east-1) | isola a Duo; dá para ter staging de verdade desde o dia 1 |
| Vercel | projeto novo | deploy na `main`; previews apontando para staging |
| Domínio | a decidir (seção 11) | ex.: `studio-x.agenda.livo.tec.br` ou marca própria |
| Ambientes | DEV (Postgres descartável) · STAGING · PROD | o `livo` só tem PROD — aqui começa certo |

### 2.4 Stack (igual ao `livo`, de propósito)

Next.js (App Router) · React 18 · TypeScript · **CSS puro com variáveis** (o tema
por loja depende disso) · Supabase (Postgres + Auth + Storage + Realtime + Edge
Functions + **pg_cron** para lembretes) · Phosphor Icons · Web Push (VAPID) ·
PWA.

Separação de camadas:

```
site público     /            vitrine do negócio            anon + RPCs públicas
                 /agendar     fluxo de agendamento           anon + RPCs públicas
                 /a/[token]   ver, reagendar, cancelar       anon + RPC por token
painel           /admin       agenda, clientes, config,      authenticated + RLS
                              financeiro                      + papel
backend          supabase/    migrations, RPCs, RLS, edge,   fonte da verdade
                              pg_cron
plataforma       (depois)     criar negócio, planos          platform_admin
```

---

## 3. O que reaproveitar do `livo`

Legenda: **copiar** = vem quase igual · **adaptar** = vem e muda de domínio ·
**padrão** = não copia o arquivo, repete a solução · **fora** = não entra.

### 3.1 Fundação multi-tenant e segurança

| No `livo` | Destino | Como | Observação |
|---|---|---|---|
| `middleware.ts` | `middleware.ts` | copiar | anti-spoof do `x-livo-tenant-host` |
| `lib/tenant.ts` | `lib/tenant.ts` | adaptar | remover tudo do piloto Duo; `PLATFORM_ROOTS` com o domínio da Agenda |
| `lib/tenant-server.ts` | `lib/tenant-server.ts` | copiar | falha fechado: host desconhecido = "Negócio não encontrado" |
| `lib/tenant-context.tsx` | `lib/tenant-context.tsx` | copiar | |
| `lib/supabase.ts` | `lib/supabase.ts` | adaptar | sem o "modo local" — agenda sem banco não faz sentido |
| `next.config.mjs` | `next.config.mjs` | copiar | headers de segurança e CSP |
| migrations 001, 005, 008 (tenants, membros, `is_member`, RLS) | `001_plataforma.sql` | adaptar | **uma baseline limpa** — no `livo` as 8 primeiras nunca foram versionadas (D-18) |
| 003 (RPCs públicas tenant-aware) | padrão | padrão | `anon` nunca lê tabela direto |
| 007 + 013 (storage por pasta = tenant, limites) | `002_storage.sql` | copiar | buckets: `logos`, `servicos`, `equipe`, `espaco` |
| 010 + 011 (integridade e rate limit do anônimo) | dentro do `agendamento_criar` | adaptar | limite por negócio e por telefone |
| 014 (`criar_tenant` transacional) | `criar_negocio` | adaptar | config neutra + horário padrão + 1 profissional (o dono) |
| 022 (auditoria append-only) | `audit_logs` | copiar | toda mudança de status de agendamento |
| 026 + 043 (papéis + matriz de permissões) | `has_role` + matriz nova | adaptar | papéis de agenda (seção 5.4) |
| 036 (acompanhamento por token) | `/a/[token]` | padrão | token assinado, whitelist de campos, exige tenant do host |
| 042 + 047 + edge `equipe-criar-acesso` | equipe com login | copiar | criar acesso do profissional |
| 051 (marca da loja como dado) | `store_settings.marca` | copiar | logo, ícone, tagline, descrição, OG |
| `supabase/tests/rodar.sh` + suítes de isolamento | `supabase/tests/` | adaptar | Postgres descartável; refazer as provas cross-tenant |

### 3.2 Painel e design system

| No `livo` | Destino | Como | Observação |
|---|---|---|---|
| `components/ui/basicos.tsx` | `components/ui/` | copiar | Botao, BotaoIcone, Interruptor, Segmentado, Busca, EstadoVazio, Selo, MenuAcoes, PainelLateral, Campo |
| `components/ui/Avisos.tsx`, `Dialogo.tsx`, `Provedores.tsx` | `components/ui/` | copiar | toasts e diálogos — nada de `confirm()` nativo |
| `components/ui/Icone.tsx` | `components/ui/Icone.tsx` | adaptar | catálogo + ícones de agenda (calendário, relógio, tesoura…) |
| `app/livo.css` | `app/painel.css` | adaptar | o painel é **da Livo** (decisão E-2) — fixo e testado para contraste |
| `lib/cor-painel.ts` (+ suíte 39) | `lib/cor-painel.ts` | copiar | a loja escolhe uma cor; o painel garante leitura |
| `lib/tema.ts` (+ suíte 32) | `lib/tema.ts` | adaptar | renomear papéis da Duo (`roxo`, `acai`…) para `marca`, `acento`, `fundo` |
| `app/admin/_areas/painel.tsx` | `app/admin/_areas/painel.tsx` | adaptar | casca: sidebar no desktop, barra inferior no celular, áreas por papel |
| `app/admin/_areas/resumo.tsx` | `app/admin/_areas/relatorios.tsx` | adaptar | gráficos e KPIs |
| `app/admin/_areas/produtos.tsx` | `app/admin/_areas/servicos.tsx` | adaptar | mestre-detalhe, seções, pausar, reordenar |
| `app/admin/_areas/loja.tsx` | `app/admin/_areas/negocio.tsx` | adaptar | contato, horários, datas especiais, marca |
| `app/admin/_areas/cores-do-site.tsx`, `cor-do-painel.tsx` | idem | copiar | |
| `app/admin/_areas/equipe.tsx`, `Acessos.tsx` | `equipe.tsx` | adaptar | profissional ≠ login (um pode existir sem o outro) |
| `app/admin/_areas/promocoes.tsx` | `promocoes.tsx` | adaptar | fase posterior |

### 3.3 Utilitários e serviços

| No `livo` | Destino | Como | Observação |
|---|---|---|---|
| `lib/masks.ts` | `lib/masks.ts` | copiar | telefone BR, capitalização de nome |
| `lib/image.ts` | `lib/image.ts` | adaptar | proporções novas: 1:1 (avatar), 4:3 (serviço), 16:9 (capa) |
| `lib/pix.ts` | `lib/pix.ts` | copiar | sinal/pagamento antecipado via Pix copia e cola |
| `lib/push.ts` + `public/sw.js` + `manifest.webmanifest` | idem | copiar | push de "novo agendamento" com o painel fechado |
| edge `notify-new-order` | edge `notificar-agendamento` | adaptar | escopo por tenant e segredo em tempo constante já resolvidos |
| `linkWhatsApp()` (`lib/data.ts`) | `lib/whatsapp.ts` | copiar | fase assistida do WhatsApp |
| `clientesInativos()` (`lib/data.ts`) | `lib/clientes.ts` | adaptar | base da campanha "sentimos sua falta" |
| `situacaoDaLoja`, `resumoHorario`, `DIAS_SEMANA`, `special_dates` (`settings-context`) | `lib/funcionamento.ts` | adaptar | horário do negócio; o horário de cada profissional é tabela nova |
| `app/experiencias/registro.ts` | `app/experiencias/registro.ts` | copiar | **um motor, várias peles** por nicho |
| `components/RedesSociais.tsx`, `WhatsAppFlutuante.tsx`, `HorarioTexto.tsx` | idem | copiar | |
| edge `buscar-endereco` | — | fora (por ora) | só se houver atendimento a domicílio |

### 3.4 Fica no `livo`

Carrinho, checkout, taxa de entrega por km/bairro, KDS, impressão, fiscal
(NFC-e — serviço usa **NFS-e**, outro mundo, fase futura), estoque e ficha
técnica, PDV/caixa (reavaliar na F5), complementos de produto.

### 3.5 Lições do `livo` que viram regra aqui

1. **A fronteira é a RLS**, filtro no front não é segurança.
2. **Falha fechado**: host desconhecido nunca vira um negócio qualquer.
3. **O servidor decide preço e disponibilidade**; o cliente só escolhe. (No
   `livo`: preço do servidor, 049; taxa de entrega no servidor, 033/037.)
4. **A mesma função** que mostra é a que valida — nunca duas contas paralelas.
5. **Configuração neutra**: negócio novo não herda nada de outro negócio.
6. Remoção é **suave** (`active = false`) para preservar histórico.
7. Segredos só no Vault. Nada de chave privada no bundle.
8. Mensagem de WhatsApp em **texto puro** (emoji se corrompia no caminho).
9. Toda mudança de schema é migration versionada **e** testada no Postgres
   descartável antes de staging.

---

## 4. Modelo de dados

Todas as tabelas de negócio: `tenant_id uuid not null` **sem default**, FK
composta `(id, tenant_id)` onde houver relação (padrão da 028), RLS ligada e
policy no mesmo lote da tabela.

### 4.1 Catálogo e equipe

```
service_categories   (id, tenant_id, name, sort_order, active)
services             (id, tenant_id, category_id?, name, description, photo_url,
                      duration_min, buffer_after_min, price, price_mode
                      ['fixo','a_partir_de','oculto'], online_booking bool,
                      active, paused, sort_order)
professionals        (id, tenant_id, user_id?, name, photo_url, bio, color,
                      commission_pct, active, sort_order)
professional_services(tenant_id, professional_id, service_id,
                      price_override?, duration_override?, commission_override?)
```

- `user_id` opcional: um profissional pode existir sem login (o dono cadastra o
  barbeiro e opera a agenda por ele), e um login pode não ser profissional
  (recepção).
- `paused` ≠ `active`: pausado some da vitrine mas continua no painel
  ("Pausar itens temporariamente").

### 4.2 Disponibilidade

```
working_hours   (id, tenant_id, professional_id, weekday 0-6, start_time, end_time)
                 -- vários intervalos por dia = intervalo de almoço sem gambiarra
time_off        (id, tenant_id, professional_id?, starts_at, ends_at, reason)
                 -- professional_id nulo = o negócio inteiro (feriado, reforma)
store_settings  -- chave/valor jsonb, como no livo:
                 agenda.regras = { intervalo_slots_min: 15,
                                   antecedencia_min_horas: 2,
                                   janela_max_dias: 30,
                                   confirmacao: 'automatica' | 'manual',
                                   cancelamento_ate_horas: 12,
                                   fuso: 'America/Fortaleza' }
```

O horário do **negócio** (vitrine: "aberto agora") continua em `store_settings`,
como no `livo`. O horário de **cada profissional** é o que gera vaga.

### 4.3 Clientes

```
clients   (id, tenant_id, name, phone, email?, birthdate?, notes, tags text[],
           source ['online','painel','importado'], consent_whatsapp bool,
           created_at, last_visit_at)
           unique (tenant_id, phone)
```

O cliente final **não cria conta**. O telefone identifica; o navegador lembra
nome e telefone (`chaveLocal`) para a próxima vez.

### 4.4 Agendamentos

```
appointments          (id, tenant_id, client_id, professional_id,
                       starts_at timestamptz, ends_at timestamptz,
                       periodo tstzrange GENERATED,
                       status, channel ['online','painel','whatsapp'],
                       total, notes, public_token,
                       confirmed_at, reminded_at, cancelled_at, cancel_reason,
                       created_by?, created_at, updated_at)

appointment_services  (id, tenant_id, appointment_id, service_id,
                       name, price, duration_min)        -- congelados

-- a garantia anti-conflito, no banco:
create extension btree_gist;
alter table appointments add constraint sem_conflito
  exclude using gist (tenant_id with =, professional_id with =, periodo with &&)
  where (status in ('pendente','confirmado'));
```

Estados:

```
pendente → confirmado → concluido
    │           │
    └───────────┴──→ cancelado_cliente | cancelado_negocio | faltou
```

- `pendente` só existe se o negócio escolheu confirmação manual.
- `faltou` ("não comparecimento") alimenta a métrica de faltas e permite
  registrar cobrança associada (como no MinhaAgenda).
- Mudança de status passa por RPC (`agendamento_mudar_status`) que grava em
  `audit_logs` — padrão da 030/036 no `livo`.

### 4.5 Financeiro (F5)

```
payments            (id, tenant_id, appointment_id?, method, amount, kind
                     ['servico','sinal','avulso'], paid_at, created_by)
financial_entries   (id, tenant_id, type ['receita','despesa'], category,
                     description, amount, due_date, paid_at, recurring_rule?)
commission_payouts  (id, tenant_id, professional_id, period_start, period_end,
                     amount, paid_at)
-- comissão a pagar = view sobre appointment_services de agendamentos
-- concluídos × % do profissional/serviço, menos o que já foi pago.
```

### 4.6 Anamnese (F6)

```
anamnesis_templates (id, tenant_id, name, fields jsonb, service_ids uuid[])
anamnesis_records   (id, tenant_id, client_id, appointment_id?, template_id,
                     answers jsonb, photos text[], signed_at, created_by)
```

**Dado de saúde é dado sensível na LGPD.** Regras: consentimento explícito do
cliente, leitura só por quem atende (profissional responsável, dono, admin),
toda leitura registrada em auditoria, fotos em bucket **privado** com URL
assinada.

### 4.7 Mensagens (F4/F7)

```
message_templates (id, tenant_id, kind ['confirmacao','lembrete','aniversario',
                   'pos_atendimento','retorno'], body, active)
message_log       (id, tenant_id, appointment_id?, client_id, kind, channel
                   ['whatsapp_link','whatsapp_api','email','push'], status, sent_at)
```

---

## 5. Regras de negócio no servidor

### 5.1 Motor de disponibilidade

Uma função só, `horarios_disponiveis(p_tenant, p_servicos uuid[],
p_profissional uuid?, p_data date)`, `SECURITY DEFINER`, que:

1. soma a duração dos serviços escolhidos (com override por profissional) +
   intervalo de limpeza;
2. pega os intervalos de trabalho do profissional naquele dia da semana, no
   **fuso do negócio**;
3. subtrai folgas, feriados, bloqueios e agendamentos ativos;
4. fatia em slots (`intervalo_slots_min`) onde o atendimento inteiro cabe;
5. corta o que fere a antecedência mínima e a janela máxima;
6. com "qualquer profissional", une as vagas de todos que fazem os serviços e
   guarda quem atenderia (o de menor ocupação no dia, para equilibrar a equipe).

`agendamento_criar(...)` **chama a mesma lógica** para validar o horário pedido,
recalcula preço e duração a partir do banco (o navegador não manda preço),
cria/encontra o cliente pelo telefone, aplica rate limit e grava. Se duas
pessoas clicarem no mesmo horário ao mesmo tempo, a constraint `sem_conflito`
recusa a segunda — e a tela oferece os horários mais próximos.

### 5.2 Link de gestão do cliente

`/a/[token]`: ver o agendamento, adicionar à agenda (.ics), abrir rota no mapa,
**reagendar** ou **cancelar** — respeitando `cancelamento_ate_horas`. Depois do
limite, o botão vira "falar com o negócio no WhatsApp". RPCs por token, no
padrão da 036.

### 5.3 Anti-falta

Em ordem de custo:

1. Confirmação imediata + lembrete na véspera e 2 h antes (F4 assistido, F7
   automático).
2. Botão "confirmar presença" no lembrete → status `confirmado`.
3. Histórico de faltas visível no cliente; o negócio pode exigir sinal de quem
   já faltou.
4. **Sinal via Pix** para serviços escolhidos (F7): `pix.ts` gera o copia e cola
   e o dono confirma o recebimento; integração com gateway (baixa automática)
   numa fase depois.

### 5.4 Papéis

| Papel | Agenda | Clientes | Serviços e config | Financeiro | Anamnese |
|---|---|---|---|---|---|
| Dono (`owner`) | todas | tudo | tudo | tudo | tudo |
| Administrador (`admin`) | todas | tudo | tudo | tudo | tudo |
| Recepção (`reception`) | todas, cria e altera | ver e editar | ler | só registrar pagamento | — |
| Profissional (`professional`) | **só a própria** | só os seus | ler | só a própria comissão | dos seus clientes |

Matriz aplicada **na RLS** com `has_role`, como a 043 — a tela só esconde o que
seria recusado.

---

## 6. Experiência do usuário

### 6.1 Fluxo do cliente (alvo: menos de 1 minuto)

```
[Página do negócio]  capa, logo, avaliações, endereço, horário,
        │            serviços em destaque, botão fixo "Agendar"
        ▼
[1. Serviço]         lista por categoria, busca, duração e preço visíveis;
        │            pode somar serviços (corte + barba)
        ▼
[2. Profissional]    foto e nome, ou "Qualquer profissional"
        │            (pulado se só houver um)
        ▼
[3. Data e hora]     faixa de dias rolável + horários em chips
        │            agrupados (manhã, tarde, noite); dia sem vaga esmaecido
        ▼
[4. Seus dados]      nome + WhatsApp (lembrados no próximo acesso),
        │            observação opcional
        ▼
[Confirmado]         resumo, "adicionar à agenda", "como chegar",
                     link para reagendar/cancelar, aviso no WhatsApp
```

- Barra inferior fixa com o resumo ("Corte + barba · 50 min · R$ 60") e o botão
  de avançar — lição do `livo`, onde o carrinho só se achava rolando ao topo.
- Voltar sem perder escolhas. Sem login, sem senha, sem e-mail obrigatório.

### 6.2 Painel do dono — a agenda é a tela inicial

**Celular:** linha do tempo do dia, um cartão por agendamento (hora, cliente,
serviço, profissional pela cor, status); troca de dia por gesto; filtro por
profissional; botão "+" para agendar por telefone/encaixe; ações rápidas no
cartão: confirmar, mandar WhatsApp, concluir (e registrar pagamento), faltou,
reagendar, cancelar.

**Desktop:** visão de **dia com uma coluna por profissional** e visão de semana;
clicar num espaço vazio cria agendamento ali; bloquear horário arrastando
(arrastar para reagendar fica para depois do MVP).

**Topo do dia:** atendimentos de hoje, a confirmar, faturamento previsto ×
realizado, próximo cliente.

Áreas do painel:

```
Agenda · Clientes · Serviços · Equipe · Financeiro · Relatórios · Negócio (config)
```

### 6.3 Identidade por nicho (peles da vitrine)

O motor da vitrine é um só (`app/experiencias/registro.ts`); muda a pele. Painel
é sempre o da Livo, com a cor da marca do negócio.

| Pele | Para | Direção visual |
|---|---|---|
| `barbearia` | barbearias | escuro, contraste alto, tipografia condensada e firme, textura discreta |
| `beleza` | salão, unhas, sobrancelha, estética | claro, tons suaves, serifa elegante nos títulos, fotos grandes |
| `saude` | clínica, fisio, nutri, psicologia | branco e azul/verde, sans-serif sóbria, ênfase em formação e credenciais |
| `generica` | qualquer outro | neutra; o que todo negócio novo recebe |

A conta Vercel já tem um demo `cangaco-barber` — candidato natural a primeira
pele/piloto de barbearia.

### 6.4 Padrão de qualidade

Componentes da seção 3.2 (sem `confirm()`/`prompt()`), estados vazios com ação,
esqueleto de carregamento, animações curtas (150–250 ms) só em transição de
passo e confirmação, alvo de toque ≥ 44 px, contraste AA garantido pelos testes
de cor herdados, Lighthouse ≥ 90 no celular na página pública.

---

## 7. WhatsApp e notificações

| Fase | Como | Custo | Quando |
|---|---|---|---|
| **Assistido** | o painel monta a mensagem e abre `wa.me` com um toque; lista "lembretes de amanhã" com botão por cliente; aniversariantes do dia | zero | F4 (MVP) |
| **Automático** | WhatsApp Cloud API (oficial, Meta) com templates aprovados; disparo por `pg_cron` → edge function; resposta "1 = confirmo" atualiza o status | por conversa, repassável no plano | F7 |
| Push ao dono | Web Push herdado do `livo` | zero | F3 |
| E-mail (opcional) | confirmação + .ics | baixo | F7 |

Recomendação firme: **não usar API não oficial** (Z-API, Evolution e similares)
como padrão — risco de banimento do número do cliente. Pode entrar como opção
consciente, atrás da mesma camada de integração (`integration_accounts`, padrão
da 025 do `livo`), para trocar de provedor sem mexer no resto.

---

## 8. Fases

Cada fase termina com: build ok, testes do banco passando no Postgres
descartável, validação em staging e roteiro de teste para o Pedro.

| Fase | Entrega | Reaproveita do `livo` | Depende de |
|---|---|---|---|
| **F0 · Fundação** | projeto Next, cópia da fundação com `docs/ORIGEM.md`, projeto Supabase (staging + prod), baseline de tenants/RLS/storage/papéis, `criar_negocio`, painel vazio com login, harness de testes | 3.1, 3.2 | decisões D-1, D-2 |
| **F1 · Catálogo e equipe** | serviços (CRUD, categorias, pausar, foto), profissionais, quem faz o quê, horários por profissional, folgas e bloqueios, regras de agendamento, marca e cores | `produtos.tsx`, `loja.tsx`, `equipe.tsx`, cores | F0 |
| **F2 · Agendamento online** | motor de disponibilidade, `agendamento_criar` com constraint anti-conflito, vitrine pública (pele genérica + 1 de nicho), fluxo de 4 passos, confirmação, `/a/[token]` com reagendar/cancelar, .ics | `registro.ts`, 036, 011 | F1 |
| **F3 · Agenda do dono** | agenda dia/semana, colunas por profissional, ações rápidas, encaixe, agendar pelo painel, push de novo agendamento, realtime | `painel.tsx`, `push.ts`, edge de notificação | F2 |
| **F4 · Clientes e WhatsApp assistido** ⟵ **MVP** | ficha do cliente com histórico, faltas e observações; confirmação e lembretes com um toque; aniversariantes; clientes inativos; importar contatos (CSV) | `linkWhatsApp`, `clientesInativos`, `masks.ts` | F3 |
| **F5 · Financeiro e comissões** | registrar pagamento ao concluir, despesas e receitas, fluxo de caixa, metas do mês, comissão automática e fechamento por profissional, relatórios (seção 1.4) | `resumo.tsx`, padrões de caixa | F4 |
| **F6 · Anamnese** | modelos de ficha por serviço, preenchimento antes ou no atendimento, fotos de evolução, consentimento LGPD, auditoria de leitura | auditoria (022), storage privado | F4 |
| **F7 · Automação e anti-falta** | WhatsApp oficial, lembretes automáticos (`pg_cron`), confirmação por resposta, sinal via Pix, política de cancelamento com cobrança, e-mail | `pix.ts`, padrão de integrações (025) | F4 |
| **F8 · Crescimento** | avaliações pós-atendimento, lista de espera, pacotes e assinaturas (ex.: clube da barba), cupons, sincronizar com Google Agenda, domínio próprio, console da plataforma | `promocoes.tsx`, `custom_domain` | — |

---

## 9. Testes que provam o que importa

Além das provas cross-tenant herdadas (SELECT/INSERT/UPDATE/DELETE de um negócio
no outro = recusado), a agenda precisa provar:

| # | Cenário | Espera-se |
|---|---|---|
| A1 | dois `agendamento_criar` simultâneos no mesmo horário/profissional | um grava, o outro recebe conflito |
| A2 | mesmo horário, profissionais diferentes | os dois gravam |
| A3 | horário dentro do almoço, de uma folga ou de um feriado | recusado |
| A4 | serviço de 60 min às 17h30 com expediente até 18h | não aparece e é recusado |
| A5 | cliente envia preço ou duração adulterados | ignorados; vale o do banco |
| A6 | horário a menos da antecedência mínima / além da janela | recusado |
| A7 | cancelar pelo token depois do limite | recusado com mensagem clara |
| A8 | token de um negócio aberto no domínio de outro | "não encontrado" |
| A9 | cancelado libera a vaga; `faltou` não a reabre no passado | conferido |
| A10 | fuso: negócio em Manaus visto por cliente em São Paulo | horários no fuso do negócio |
| A11 | profissional (papel) lê agenda de colega | 0 linhas |
| A12 | rajada anônima de agendamentos | rate limit corta |

---

## 10. Riscos

| # | Risco | Mitigação |
|---|---|---|
| R-1 | Correção de segurança feita no `livo` não chega aqui | `docs/ORIGEM.md` + revisar o changelog do `livo` a cada fase |
| R-2 | Fuso horário e horário de verão (se voltar) | tudo em `timestamptz`; conta no fuso do negócio, no banco |
| R-3 | Motor de disponibilidade lento com muita agenda | índice em `(tenant_id, professional_id, starts_at)`; calcular por dia, não por mês |
| R-4 | Banimento de número com API não oficial de WhatsApp | oficial como padrão (seção 7) |
| R-5 | Dado de saúde na anamnese | bucket privado, papel restrito, consentimento, auditoria de leitura |
| R-6 | Spam de agendamentos falsos | rate limit por negócio e telefone; confirmação manual opcional; captcha invisível se necessário |
| R-7 | Escopo crescer antes do MVP | F5–F8 não começam antes de um negócio real usar F0–F4 |

---

## 11. Decisões em aberto (preciso do Pedro)

| # | Decisão | Recomendação |
|---|---|---|
| D-1 | **Domínio e marca**: `negocio.agenda.livo.tec.br`, `agenda.livo.tec.br/negocio` ou marca própria? | subdomínio — reaproveita a resolução de tenant do `livo` sem mudança e permite domínio próprio depois |
| D-2 | **Supabase**: projeto novo? | sim, com staging separado desde o início |
| D-3 | **Nicho piloto** para a primeira pele | barbearia (já existe o demo `cangaco-barber`) ou o primeiro cliente real que estiver fechando |
| D-4 | **WhatsApp automático**: oficial (pago por conversa) ou não oficial | oficial, cobrado como módulo do plano |
| D-5 | **Sinal/pagamento online**: Pix com confirmação manual ou gateway (Mercado Pago) | começar manual (`pix.ts`), gateway quando houver demanda |
| D-6 | **Modelo de cobrança** do produto (mensalidade por profissional? plano fixo?) | definir antes da F5, porque muda o que é "módulo" |

---

## 12. Próximo passo

Com D-1 e D-2 respondidas, começa a **F0**: criar o projeto Next com a fundação
copiada do `livo`, o `docs/ORIGEM.md`, o projeto Supabase e a migration de
plataforma — com o SQL entregue para aprovação antes de aplicar.
