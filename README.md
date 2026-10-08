# Livo Agenda

Agendamento online e gestão para negócios de serviço — clínica de depilação,
barbearia, salão, nail designer, estética, consultório. Cada negócio tem a sua
página, com a sua identidade visual, e um painel para comandar o dia pelo celular.

- **Cliente final:** marca em 4 passos, sem conta, recebe link para remarcar,
  cancelar, adicionar à agenda do celular e preencher a ficha.
- **Dono:** agenda por profissional, clientes (com importação de planilha e
  contatos do celular), lembretes de WhatsApp com um toque, financeiro,
  comissões, relatórios, anamnese e tudo da página editável no painel.

Construída sobre a fundação da Livo (multi-tenant, RLS, design system do
painel), copiada com registro em [`docs/ORIGEM.md`](docs/ORIGEM.md). O
repositório `livo` não é alterado.

## Rodar

```bash
npm install
cp .env.example .env.local   # preencha a chave publishable do Supabase
npm run dev
```

- `http://localhost:3000` — página da Livo Agenda
- `http://localhost:3000/depiled` — página da DepiLED, o primeiro negócio (piloto)
- `http://localhost:3000/depiled/agendar` — agendamento: categoria → opções → calendário → horário
- `http://localhost:3000/painel/entrar` — login (só com conta)

Sem as variáveis do Supabase, só os negócios com semente no código
(`lib/sementes/`) abrem; qualquer outro endereço mostra "Negócio não encontrado".

## Banco

```bash
./supabase/tests/rodar.sh   # Postgres descartável: aplica cada migration e roda a suíte dela
```

## Documentos

| | |
|---|---|
| [`docs/ESTADO.md`](docs/ESTADO.md) | o que está pronto, o que falta confirmar com a DepiLED, como criar o login, próximos passos |
| [`docs/PLANEJAMENTO.md`](docs/PLANEJAMENTO.md) | plano completo: público, métricas, modelo de dados, fases |
| [`docs/ORIGEM.md`](docs/ORIGEM.md) | o que veio do `livo` |
| [`docs/REFERENCIAS.md`](docs/REFERENCIAS.md) | skills, bibliotecas e repositórios usados |
