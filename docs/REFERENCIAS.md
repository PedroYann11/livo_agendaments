# Referências usadas na construção

## Skills do Claude consultadas

| Skill | Onde entrou |
|---|---|
| **painel-adm** (sua) | Regra de que tudo o que o cliente vê é editável no painel: Configurações cobre página, cores, horários, regras, contato, Pix, funções, cupons e avaliações |
| **dataviz** | Gráficos do painel: barras ≤ 24 px com ponta arredondada, grade de 1 px, um eixo só, legenda sempre que há 2+ séries, dica ao passar o dedo, paleta categórica validada para daltonismo (`lib/paleta.ts`) e cor que segue o profissional em todo o painel |
| `frontend-design`, `emilkowalski-motion`, `emil-design-eng` (via open-design) | Direção visual por nicho, curvas `ease-out` fortes, animações de 150–300 ms, nada animado no que se usa 100×/dia, `prefers-reduced-motion` respeitado |

Não há skill de design instalada na sua conta além de `painel-adm` e
`canvas-design` (essa é para pôsteres e não se aplica aqui).

## Bibliotecas de componentes animados

| Fonte | O que foi aproveitado |
|---|---|
| **Originkit** (MCP) | *Text Emerge* → título da vitrine entra palavra a palavra saindo do desfoque (`components/vitrine/efeitos.tsx`); *Arrow Reveal Button* → botão "Agendar horário" com a seta que se expande (refeito em CSS puro); *Live Chat* → prévia da mensagem em balão de WhatsApp (Mensagens › Modelos) |
| **Skiper UI** | O site não abriu deste ambiente (bloqueado pela rede). Usado o padrão que ela popularizou: abas com fundo que desliza (`layoutId` do Motion) nas categorias, dias, horários e menus |
| **Motion** (ex-Framer Motion) | Transições entre passos do agendamento, folhas que sobem de baixo, arrastar para fechar, check desenhado na confirmação, reordenar serviços arrastando |

Os efeitos pesados (WebGL, partículas) dessas bibliotecas foram deixados de
fora de propósito: a página do cliente precisa abrir rápido no navegador do
Instagram, num celular comum.

## Repositórios públicos

| Repositório | Uso |
|---|---|
| [nexu-io/open-design](https://github.com/nexu-io/open-design) | Skills de design (acima) e o *design system* do Cal.com como referência de produto de agendamento: sóbrio, sombras em vez de bordas, tipografia forte |
| [public-apis/public-apis](https://github.com/public-apis/public-apis) | **BrasilAPI** (feriados nacionais — Configurações › Funcionamento) e **ViaCEP** (endereço pelo CEP). Sem chave, chamadas do navegador. Se a BrasilAPI cair, os feriados são calculados localmente (`lib/feriados.ts`) |
| [ripienaar/free-for-dev](https://github.com/ripienaar/free-for-dev) | Escolhas para a fase de backend: **Resend** (3.000 e-mails/mês grátis) para confirmação por e-mail; **healthchecks.io** para vigiar o disparo automático de lembretes; **Sentry/GlitchTip** para erros em produção |
| [OpenHands/OpenHands](https://github.com/OpenHands/OpenHands) | Plataforma de agentes de programação. Não entra no código do produto; pode servir para automatizar tarefas repetitivas do backend (gerar migrations e testes por módulo) |
