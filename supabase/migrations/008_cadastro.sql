-- =====================================================================
-- 008 — Cadastro próprio: quem compra cria a conta e o negócio sozinho
--
-- Antes, só a plataforma criava negócio (criar_negocio, 001) e o login
-- era ligado à mão no SQL Editor (vincular_membro). Agora a pessoa cria a
-- conta (e-mail e senha, Supabase Auth) e, já logada e com o e-mail
-- confirmado, o próprio negócio — e vira dona dele.
--
--   slug_reservado(slug)          endereços que nunca são de negócio
--   slug_disponivel(slug)         anon/logado → 'ok' | 'invalido' | 'reservado' | 'em_uso'
--   negocio_criar_meu(dono, neg)  logado → cria o negócio; até 3 por conta
--
-- O negócio nasce com plano 'teste' (a cobrança é outra etapa) e com a
-- configuração NEUTRA que o app manda, gravada por negocio_salvar (007):
-- a mesma porta, com as mesmas checagens, que o painel usa depois.
-- Depende da 007.
-- =====================================================================

create or replace function public.slug_reservado(p_slug text)
returns boolean language sql immutable set search_path = '' as $$
  -- espelho de RESERVADOS em lib/negocio-server.ts (o teste confere os dois)
  select lower(coalesce(p_slug, '')) = any (array[
    'painel', 'api', 'entrar', 'sair', 'admin', 'app', 'agenda', 'livo', 'www', 'demo', 'ajuda', 'precos',
    'termos', 'privacidade', 'cadastro', 'criar', 'conta', 'login', 'suporte', 'blog', 'contato', 'sobre',
    'planos', 'status', 'static', 'assets'])
$$;

/** Para o formulário de cadastro conferir o endereço enquanto a pessoa digita. */
create or replace function public.slug_disponivel(p_slug text)
returns text language sql stable security definer set search_path = '' as $$
  select case
    when coalesce(p_slug, '') !~ '^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$' then 'invalido'
    when public.slug_reservado(p_slug) then 'reservado'
    when exists (select 1 from public.tenants t where t.slug = p_slug) then 'em_uso'
    else 'ok'
  end
$$;

/**
 * Cria o negócio de quem chamou e o torna dono. Tudo ou nada.
 * p_dono: o nome da pessoa (vira a primeira profissional da agenda).
 * p_negocio: o negócio no formato do app (slug, nome, nicho, pele, tema,
 *            horario, regras, modulos, contato…).
 */
create or replace function public.negocio_criar_meu(p_dono text, p_negocio jsonb)
returns text language plpgsql volatile security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  slug text := coalesce(p_negocio ->> 'slug', '');
  nome text := btrim(regexp_replace(coalesce(p_negocio ->> 'nome', ''), '\s+', ' ', 'g'));
  nicho text := coalesce(p_negocio ->> 'nicho', '');
  dono text := left(btrim(regexp_replace(coalesce(p_dono, ''), '\s+', ' ', 'g')), 80);
  email text;
  tid uuid;
begin
  if uid is null then
    raise exception 'Entre na sua conta para criar o negócio.' using errcode = '42501';
  end if;
  select u.email into email from auth.users u where u.id = uid and u.email_confirmed_at is not null;
  if email is null then
    raise exception 'Confirme seu e-mail antes de criar o negócio. O link está na sua caixa de entrada.';
  end if;
  -- um pedido por conta de cada vez: dois cliques ao mesmo tempo não furam o limite
  perform pg_advisory_xact_lock(hashtextextended('negocio_criar_meu:' || uid::text, 0));
  if (select count(*) from public.tenant_members m where m.user_id = uid and m.papel = 'owner') >= 3 then
    raise exception 'Esta conta já tem 3 negócios. Para abrir mais, fale com a Livo.';
  end if;

  if char_length(dono) < 2 then raise exception 'Diga seu nome.'; end if;
  if char_length(nome) not between 2 and 80 then
    raise exception 'O nome do negócio precisa ter de 2 a 80 letras.' using hint = 'nome';
  end if;
  if nicho not in ('depilacao', 'barbearia', 'unhas', 'salao', 'estetica', 'sobrancelha', 'saude', 'outro') then
    raise exception 'Escolha o tipo do negócio.' using hint = 'nicho';
  end if;
  case public.slug_disponivel(slug)
    when 'ok' then null;
    when 'invalido' then
      raise exception 'O endereço só pode ter letras minúsculas, números e hífen (até 40).' using hint = 'slug';
    else
      raise exception 'Esse endereço já está em uso. Escolha outro.' using hint = 'slug';
  end case;

  begin
    insert into public.tenants (slug, nome, nicho, plano) values (slug, nome, nicho, 'teste')
    returning id into tid;
  exception when unique_violation then
    raise exception 'Esse endereço acabou de ser escolhido por outra pessoa. Escolha outro.' using hint = 'slug';
  end;
  insert into public.tenant_members (tenant_id, user_id, papel) values (tid, uid, 'owner');

  -- identidade, tema e configuração: pela porta do painel, com as checagens dela
  perform public.negocio_salvar(tid, p_negocio || jsonb_build_object('nome', nome));

  -- a agenda nasce com uma pessoa atendendo: quem criou, no horário da semana do negócio
  insert into public.profissionais (tenant_id, id, nome, ordem, servicos_ids, horario, acesso)
  values (tid, 'dono', dono, 0, '{}',
          case when jsonb_typeof(p_negocio -> 'horario') = 'object' then p_negocio -> 'horario' else '{}'::jsonb end,
          jsonb_build_object('email', email, 'papel', 'owner'));

  return slug;
end $$;

revoke execute on function
  public.slug_reservado(text), public.slug_disponivel(text), public.negocio_criar_meu(text, jsonb)
from public, anon, authenticated;

grant execute on function public.slug_disponivel(text) to anon, authenticated;
grant execute on function public.negocio_criar_meu(text, jsonb) to authenticated;
