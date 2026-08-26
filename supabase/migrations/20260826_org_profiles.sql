-- ============================================================
-- Публичные профили организаторов + подписки на email-рассылку (2026-08-26).
-- Аватарка, имя, описание, контакты (публикуются по желанию),
-- события организатора, подписка на новые события.
-- Всё доступно всем, без входа.
-- ============================================================

-- 1. Новые колонки profiles (не role — конфликтов с protect_profile_role нет)
alter table public.profiles add column if not exists display_name text;
alter table public.profiles add column if not exists bio text;
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists contacts_public boolean not null default false;

-- 2. Таблица подписок. RLS включён БЕЗ политик: клиенты работают
--    только через RPC ниже; рассылочный скрипт читает напрямую
--    как service_role (bypass RLS).
create table if not exists public.org_subscriptions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.profiles(id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now(),
  unsub_token text not null default encode(gen_random_bytes(16), 'hex'),
  unique (org_id, email)
);

alter table public.org_subscriptions enable row level security;

-- 3. RPC подписки: проверяет email, существование/роль/блокировку
--    организатора, вставляет подписку (повторная — без ошибки)
create or replace function public.subscribe_org(p_org_id uuid, p_email text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ok boolean;
begin
  if p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Invalid email';
  end if;
  select exists(
    select 1 from public.profiles
    where id = p_org_id and role = 'org' and blocked_at is null
  ) into v_ok;
  if not v_ok then
    return 'Organizer not found';
  end if;
  insert into public.org_subscriptions (org_id, email)
  values (p_org_id, lower(trim(p_email)))
  on conflict (org_id, email) do nothing;
  if found then
    return 'subscribed';
  else
    return 'already';
  end if;
end;
$$;

revoke all on function public.subscribe_org(uuid, text) from public;
grant execute on function public.subscribe_org(uuid, text) to anon, authenticated;

-- 4. RPC отписки по токену (токен из письма; запись удаляется,
--    повторная рассылка на этот email не придёт)
create or replace function public.unsubscribe_org(p_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.org_subscriptions where unsub_token = p_token;
end;
$$;

revoke all on function public.unsubscribe_org(text) from public;
grant execute on function public.unsubscribe_org(text) to anon, authenticated;

-- 5. RPC публичного профиля организатора. Без is_admin — это публичная
--    информация. Контакты отдаются ТОЛЬКО при contacts_public = true,
--    иначе NULL (данные не утекают через RPC). Заблокированный
--    организатор и не-org возвращают пустую выборку.
create or replace function public.get_org_profile(p_org_id uuid)
returns table (
  id uuid,
  display_name text,
  bio text,
  avatar_url text,
  contacts_public boolean,
  contact_telegram text,
  contact_whatsapp text,
  contact_email text,
  contact_phone text,
  instagram text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
    select
      p.id,
      p.display_name,
      p.bio,
      p.avatar_url,
      p.contacts_public,
      case when p.contacts_public then p.contact_telegram end as contact_telegram,
      case when p.contacts_public then p.contact_whatsapp end as contact_whatsapp,
      case when p.contacts_public then p.contact_email end as contact_email,
      case when p.contacts_public then p.contact_phone end as contact_phone,
      case when p.contacts_public then p.instagram end as instagram
    from public.profiles p
    where p.id = p_org_id
      and p.role = 'org'
      and p.blocked_at is null;
end;
$$;

revoke all on function public.get_org_profile(uuid) from public;
grant execute on function public.get_org_profile(uuid) to anon, authenticated;
