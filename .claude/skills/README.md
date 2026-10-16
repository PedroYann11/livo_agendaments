# Skills do projeto

Carregadas em toda sessão do Claude Code neste repositório. Cópias **sem alteração** das
fontes oficiais (16/10/2026); cada uma mantém a licença da origem. Para atualizar, copiar de
novo a pasta da origem no commit indicado ou mais novo.

| Skill | Área | Origem (commit) | Licença | Para quê |
|---|---|---|---|---|
| `find-skills` | — | [vercel-labs/skills](https://github.com/vercel-labs/skills) | MIT | Procurar e instalar outras skills (`npx skills find`). A busca usa o site `skills.sh`, que precisa estar liberado na rede do ambiente |
| `supabase` | Segurança | [supabase/agent-skills](https://github.com/supabase/agent-skills) `c9be0e9` | MIT (`LICENSE` na pasta) | Checklist de segurança do Supabase: Auth, RLS, chaves, Storage |
| `sharp-edges` | Segurança | [trailofbits/skills](https://github.com/trailofbits/skills) `5c99c03` | CC BY-SA 4.0 (`LICENSE` na pasta) · © Trail of Bits | APIs e configurações perigosas ("armadilhas") |
| `differential-review` | Segurança | [trailofbits/skills](https://github.com/trailofbits/skills) `5c99c03` | CC BY-SA 4.0 (`LICENSE` na pasta) · © Trail of Bits | Revisão de segurança de cada mudança |
| `frontend-design` | Frontend | [anthropics/skills](https://github.com/anthropics/skills) `dbd4588` | Apache 2.0 (`LICENSE.txt` na pasta) | Identidade visual própria, sem cara de modelo pronto |
| `web-design-guidelines` | Frontend | [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) `063bee9` | MIT (README da origem) | Revisão de interface: acessibilidade, formulários, celular. Baixa as regras de `raw.githubusercontent.com` a cada uso |
| `vercel-react-best-practices` | Back-end / performance | [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) `063bee9` | MIT | Performance em Next.js e React |
| `supabase-postgres-best-practices` | Back-end / performance | [supabase/agent-skills](https://github.com/supabase/agent-skills) `c9be0e9` | MIT (`LICENSE` na pasta) | Consultas, índices e RLS sem deixar o banco lento |
| `vercel-react-view-transitions` | Animações | [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) `063bee9` | MIT | Transições entre telas com a View Transition API do React |

Observações para este ambiente:

- `supabase` pede para ler `supabase.com/changelog.md` antes de mexer; aqui esse site é
  bloqueado — usar a busca de documentação do MCP da Supabase no lugar.
- As regras do projeto (`CLAUDE.md`) valem acima das skills: SQL primeiro, migration aprovada
  antes de aplicar, nada de dado pessoal em arquivo versionado.
