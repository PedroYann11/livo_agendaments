-- =====================================================================
-- 009 — Convite para assumir um negócio PRONTO
--
-- O convite da 008 cria um negócio novo. Aqui, a compra já vem presa a um
-- negócio que a Livo montou (catálogo, horários, marca — como a DepiLED):
-- quem recebe o link cria o próprio login e senha pelo mesmo caminho do
-- cliente e, no primeiro login com o e-mail confirmado, vira DONO desse
-- negócio. Serve para o piloto e para vender "a Livo monta, você assume".
--
--   licenca_emitir_negocio(email, slug, …)  SQL Editor / service_role → convite
--   convite_publico(codigo)                 agora diz qual negócio (nome, endereço)
--   negocio_assumir()                       logado + e-mail confirmado → vira dono
--   negocio_criar_meu(dono, neg)            não gasta convite de negócio pronto
--
-- O hook "antes de criar conta" (008) não muda: compra paga, de qualquer
-- tipo, deixa a conta nascer.
-- =====================================================================

/**
 * Convite para assumir um negócio que já existe. Só pelo SQL Editor:
 *   select public.licenca_emitir_negocio('dono@email.com', 'depiled');
 * Com p_referencia (o id do pagamento), chamar de novo devolve o mesmo convite.
 */
create or replace function public.licenca_emitir_negocio(
  p_email text,
  p_slug text,
  p_plano text default 'mensal',
  p_valor numeric default 0,
  p_origem text default 'manual',
  p_referencia text default null
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  t public.tenants;
  l public.licencas;
begin
  select * into t from public.tenants where slug = lower(btrim(p_slug)) and status = 'active';
  if t.id is null then raise exception 'Negócio % não existe ou está suspenso.', p_slug; end if;
  if p_referencia is not null then
    select * into l from public.licencas where referencia = p_referencia;
  end if;
  if l.id is null then
    insert into public.licencas (email, plano, valor, origem, referencia, tenant_id)
    values (lower(btrim(p_email)), p_plano, p_valor, p_origem, p_referencia, t.id)
    returning * into l;
  end if;
  return jsonb_build_object(
    'email', l.email, 'negocio', t.slug, 'plano', l.plano, 'situacao', l.situacao, 'codigo', l.codigo,
    'link', 'https://agenda.livo.tec.br/painel/criar-conta?convite=' || l.codigo);
end $$;

/** A tela de cadastro com o link de convite: para quem é e, se for o caso, qual negócio assume. */
create or replace function public.convite_publico(p_codigo text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case l.situacao
    when 'paga' then jsonb_build_object('email', l.email, 'plano', l.plano)
      || case when t.id is not null then jsonb_build_object('negocio', jsonb_build_object('nome', t.nome, 'slug', t.slug))
              else '{}'::jsonb end
    when 'usada' then jsonb_build_object('usado', true)
  end
  from public.licencas l
  left join public.tenants t on t.id = l.tenant_id
  where l.codigo = p_codigo and l.situacao in ('paga', 'usada')
$$;

/** Quem recebeu o convite de um negócio pronto vira dono dele. Gasta a compra. */
create or replace function public.negocio_assumir()
returns text language plpgsql volatile security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  email_conta text;
  lic public.licencas;
  t public.tenants;
begin
  if uid is null then
    raise exception 'Entre na sua conta para continuar.' using errcode = '42501';
  end if;
  select u.email into email_conta from auth.users u where u.id = uid and u.email_confirmed_at is not null;
  if email_conta is null then
    raise exception 'Confirme seu e-mail antes de continuar. O link está na sua caixa de entrada.';
  end if;
  select * into lic from public.licencas l
  where l.email = lower(email_conta) and l.situacao = 'paga' and l.tenant_id is not null
  order by l.criada_em, l.id
  limit 1
  for update;
  if lic.id is null then
    raise exception 'Não encontramos um convite de negócio para este e-mail.' using hint = 'licenca';
  end if;
  select * into t from public.tenants where id = lic.tenant_id and status = 'active';
  if t.id is null then
    raise exception 'Este negócio está suspenso. Fale com a Livo.' using hint = 'licenca';
  end if;

  insert into public.tenant_members (tenant_id, user_id, papel) values (t.id, uid, 'owner')
  on conflict (tenant_id, user_id) do update set papel = 'owner';
  update public.tenants set plano = lic.plano where id = t.id;
  update public.licencas set situacao = 'usada', usada_em = now(), user_id = uid where id = lic.id;
  return t.slug;
end $$;

/**
 * Igual à 008, com uma diferença: só gasta compra de negócio NOVO (sem
 * negócio preso). O convite de negócio pronto é de negocio_assumir.
 */
create or replace function public.negocio_criar_meu(p_dono text, p_negocio jsonb)
returns text language plpgsql volatile security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  slug text := coalesce(p_negocio ->> 'slug', '');
  nome text := btrim(regexp_replace(coalesce(p_negocio ->> 'nome', ''), '\s+', ' ', 'g'));
  nicho text := coalesce(p_negocio ->> 'nicho', '');
  dono text := left(btrim(regexp_replace(coalesce(p_dono, ''), '\s+', ' ', 'g')), 80);
  email_conta text;
  lic public.licencas;
  tid uuid;
begin
  if uid is null then
    raise exception 'Entre na sua conta para criar o negócio.' using errcode = '42501';
  end if;
  select u.email into email_conta from auth.users u where u.id = uid and u.email_confirmed_at is not null;
  if email_conta is null then
    raise exception 'Confirme seu e-mail antes de criar o negócio. O link está na sua caixa de entrada.';
  end if;
  -- a compra deste e-mail; trancada até o fim: dois cliques não gastam a mesma licença duas vezes
  select * into lic from public.licencas l
  where l.email = lower(email_conta) and l.situacao = 'paga' and l.tenant_id is null
  order by l.criada_em, l.id
  limit 1
  for update;
  if lic.id is null then
    raise exception 'Não encontramos uma compra para este e-mail. Use o link de convite que você recebeu depois do pagamento.'
      using hint = 'licenca';
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
    insert into public.tenants (slug, nome, nicho, plano) values (slug, nome, nicho, lic.plano)
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
          jsonb_build_object('email', email_conta, 'papel', 'owner'));

  update public.licencas set situacao = 'usada', usada_em = now(), tenant_id = tid, user_id = uid
  where id = lic.id;

  return slug;
end $$;

revoke execute on function
  public.licenca_emitir_negocio(text, text, text, numeric, text, text), public.negocio_assumir(),
  public.convite_publico(text), public.negocio_criar_meu(text, jsonb)
from public, anon, authenticated;

grant execute on function public.convite_publico(text) to anon, authenticated;
grant execute on function public.negocio_assumir(), public.negocio_criar_meu(text, jsonb) to authenticated;
grant execute on function public.licenca_emitir_negocio(text, text, text, numeric, text, text) to service_role;
