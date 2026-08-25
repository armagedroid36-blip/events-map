-- ============================================================
-- Уведомления о модерации: app_settings + RPC get/set_notify_email.
-- Скрипт-монитор (events-map-backup) читает app_settings и шлёт
-- Telegram/email при новых событиях на модерации.
-- ============================================================

create table if not exists public.app_settings (
  key text primary key,
  value text not null
);

insert into public.app_settings (key, value) values
  ('notify_email', 'dima.armagedroid@yandex.ru'),
  ('telegram_chat_id', '321398408')
on conflict (key) do nothing;

alter table public.app_settings enable row level security;
-- Политик нет: напрямую читать/писать могут только service role (обходит RLS)
-- и RPC ниже. Обычные пользователи через таблицу ничего не видят.

-- Email получателя уведомлений. Доступ: authenticated (UI админки) и
-- service role (скрипт-монитор). Аноним отклоняется внутри функции.
create or replace function public.get_notify_email()
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() = 'anon' then
    raise exception 'Permission denied';
  end if;
  return (select value from public.app_settings where key = 'notify_email');
end;
$$;

revoke all on function public.get_notify_email() from public;
grant execute on function public.get_notify_email() to anon, authenticated, service_role;

-- Смена email уведомлений — только админ (is_admin).
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
  insert into public.app_settings (key, value) values ('notify_email', p_email)
  on conflict (key) do update set value = excluded.value;
end;
$$;

revoke all on function public.set_notify_email(text) from public;
grant execute on function public.set_notify_email(text) to anon, authenticated, service_role;
