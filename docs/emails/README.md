# E-mails da Livo Agenda (confirmação de cadastro e senha)

## Por que mexer

O envio que vem pronto na Supabase **só entrega para e-mails da equipe do projeto
Supabase** e só poucos por hora. Por isso funcionou para o Pedro e o Marcelo; para a
dona da DepiLED ou qualquer cliente novo, o e-mail de "esqueci minha senha" e o de
confirmação **não chegam**. Com um remetente próprio, chegam para todo mundo, como
**"Livo Agenda" <nao-responda@livo.tec.br>**, com o texto em português.

## Passo a passo (uma vez só, uns 15 minutos)

1. **Conta no Resend** (resend.com — grátis até 3.000 e-mails/mês). Entre com o e-mail
   da Livo.
2. Resend › **Domains › Add domain** › `livo.tec.br`. Ele mostra 3 ou 4 registros de
   DNS (TXT/MX). **Mande para o Claude** (não são segredo): o domínio está na Vercel e
   ele cadastra. Depois, no Resend, **Verify**.
3. Resend › **API Keys › Create** (permissão "Sending access"). **Essa chave é
   segredo: não mande para ninguém**, cole direto no passo 4.
4. Supabase › **Authentication › Emails › SMTP Settings** › ligar "Enable custom SMTP":
   | Campo | Valor |
   |---|---|
   | Sender email | `nao-responda@livo.tec.br` |
   | Sender name | `Livo Agenda` |
   | Host | `smtp.resend.com` |
   | Port | `465` |
   | Username | `resend` |
   | Password | a chave do passo 3 |
5. Supabase › **Authentication › Emails › Templates**: em cada um, troque o assunto e
   cole o HTML deste diretório.
   | Modelo na Supabase | Assunto | Arquivo |
   |---|---|---|
   | Confirm signup | Confirme seu e-mail · Livo Agenda | `confirmar-cadastro.html` |
   | Reset password | Crie uma senha nova · Livo Agenda | `redefinir-senha.html` |
   | Change email address | Confirme o novo e-mail · Livo Agenda | `trocar-email.html` |
   | Magic link | Seu link de acesso · Livo Agenda | `link-de-acesso.html` |
6. Supabase › **Authentication › URL Configuration**:
   - Site URL: `https://agenda.livo.tec.br`
   - Redirect URLs: `https://agenda.livo.tec.br/**`
   (sem isso, o link de "esqueci minha senha" abre o site, mas não a tela de senha nova)
7. **Teste**: em agenda.livo.tec.br/painel/entrar › "Esqueci minha senha" com um
   e-mail que **não** é da equipe da Supabase. Deve chegar "Crie uma senha nova ·
   Livo Agenda".

## No painel

- Esqueceu a senha: tela de entrar › **Esqueci minha senha** → e-mail → **Crie uma
  senha nova**.
- Logado e quer trocar: **Configurações › Conta › Trocar senha**.
