# Origem do código

> Tudo o que veio do repositório `PedroYann11/livo`, no commit **`d74d591`**.
> O `livo` **não foi alterado**. Quando a fundação de lá receber uma correção,
> esta tabela diz o que portar para cá.

| Aqui | Lá (livo@d74d591) | Como veio |
|---|---|---|
| `next.config.mjs` | `next.config.mjs` | adaptado — CSP com BrasilAPI/ViaCEP, fontes servidas pelo próprio app |
| `lib/negocio-server.ts` | `lib/tenant-server.ts` | adaptado — negócio pelo **caminho** em vez do subdomínio; falha fechado igual |
| `lib/supabase.ts` | `lib/supabase.ts` | adaptado — sem "modo local"; cliente anônimo por request no servidor |
| `lib/masks.ts` | `lib/masks.ts` | copiado + CEP e validação de telefone |
| `lib/pix.ts` | `lib/pix.ts` | copiado igual (BR Code do Bacen) |
| `lib/cor.ts` | `lib/cor-painel.ts` | adaptado — contraste, mistura e "tinta" para tema de vitrine e painel |
| `lib/whatsapp.ts` (`linkWhatsApp`) | `lib/data.ts` | copiado; modelos de mensagem são novos |
| `lib/disponibilidade.ts` (`situacaoAgora`) | `lib/settings-context.tsx` (`situacaoDaLoja`) | adaptado |
| `components/ui/basicos.tsx` | `components/ui/basicos.tsx` | adaptado — mesmos papéis (Botao, Interruptor, Segmentado, Selo…), com Motion |
| `components/ui/Avisos.tsx` | `components/ui/Avisos.tsx` + `Dialogo.tsx` | adaptado — toasts e confirmação sem `confirm()` nativo |
| `components/ui/Icone.tsx` | `components/ui/Icone.tsx` | adaptado — catálogo novo de ícones de agenda |
| `components/vitrine/` (peles) | `app/experiencias/registro.ts` | padrão — "um motor, várias peles" |
| `supabase/migrations/001_plataforma.sql` | migrations 001, 003, 005, 008, 014, 026, 051 | adaptado em uma baseline limpa |
| `supabase/tests/00_ambiente.sql`, `rodar.sh` | `supabase/tests/` | reduzido ao que a 001 precisa |

Padrões repetidos sem copiar arquivo: RLS por `is_member`, `anon` só por RPC
`SECURITY DEFINER` com colunas em whitelist, configuração chave/valor em
`store_settings`, token de link público (036), remoção suave, mensagem de
WhatsApp em texto puro, painel com a identidade da Livo (decisão E-2).
