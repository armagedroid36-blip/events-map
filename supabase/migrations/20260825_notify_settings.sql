-- ============================================================
-- Уведомления о модерации: app_settings + RPC get/set_notify_email.
-- Получатель уведомлений (email) настраивается в админке.
-- По образцу 20260819_list_moderation_events.sql.
-- ============================================================

create table if not exists public.app_settings (
  key text primary key,
  value text
);

alter table public.app_settings enable row level security;

insert into public.app_settings (key, value) values
  ('notify_email', 'dima.armagedroid@yandex.ru'),
  ('notify_chat_id', '321398408')
on conflict (key) do nothing;

-- Email получателя уведомлений о модерации.
-- Доступ: админ (UI) и service role (скрипт-монитор); остальные отклоняются.
create or replace function public.get_notify_email()
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (is_admin() or auth.role() = 'service_role') then
    raise exception 'Permission denied';
  end if;
  return (select value from public.app_settings where key = 'notify_email');
end;
$$;

revoke all on function public.get_notify_email() from public;
grant execute on function public.get_notify_email() to anon, authenticated, service_role;

-- Смена email получателя уведомлений (только админ)
create or replace function public.set_notify_email(p_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'Permission denied';
  end if;
  if p_email is null or p_email = '' then
    raise exception 'Email required';
  end if;
  if p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Invalid email';
  end if;
  insert into public.app_settings (key, value) values ('notify_email', p_email)
  on conflict (key) do update set value = excluded.value;
end;
$$;

revoke all on function public.set_notify_email(text) from public;
grant execute on function public.set_notify_email(text) to authenticated;
