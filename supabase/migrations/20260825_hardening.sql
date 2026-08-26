-- ============================================================
-- HARDENING 2026-08-25: уязвимости аудита.
-- 1) create_profile: разрешены только роли org/user —
--    'admin' (и любые другие) отклоняются.
-- 2) Триггер: роль профиля меняет только service_role
--    (админ через SQL); клиент не может сменить себе роль.
-- 3) get_notify_email / set_notify_email: только админ
--    (+service_role на чтение).
-- 4) Админские RPC: revoke execute from anon.
-- ============================================================

-- 1. create_profile: убрать старую SQL-перегрузку (6 аргументов),
--    plpgsql-версия с валидацией роли.
drop function if exists public.create_profile(uuid, text, text, text, text, text);

create or replace function public.create_profile(
  uid uuid,
  p_role text,
  tg text default '',
  wa text default '',
  em text default '',
  ph text default '',
  ig text default ''
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_role is null or p_role not in ('org', 'user') then
    raise exception 'Admin role cannot be self-assigned';
  end if;
  insert into profiles (id, role, contact_telegram, contact_whatsapp, contact_email, contact_phone, instagram)
  values (uid, p_role, nullif(tg, ''), nullif(wa, ''), nullif(em, ''), nullif(ph, ''), nullif(ig, ''))
  on conflict (id) do update set
    role = excluded.role,
    contact_telegram = excluded.contact_telegram,
    contact_whatsapp = excluded.contact_whatsapp,
    contact_email = excluded.contact_email,
    contact_phone = excluded.contact_phone,
    instagram = excluded.instagram;
end;
$$;

revoke all on function public.create_profile(uuid, text, text, text, text, text, text) from public;
revoke all on function public.create_profile(uuid, text, text, text, text, text, text) from anon;
grant execute on function public.create_profile(uuid, text, text, text, text, text, text) to authenticated, service_role;

-- 2. Триггер: смена роли — только service role (админ через SQL/скрипты)
create or replace function public.protect_profile_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role and auth.role() <> 'service_role' then
    raise exception 'Role change not allowed';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_role_change on public.profiles;
create trigger profiles_role_change
  before update on public.profiles
  for each row execute function public.protect_profile_role();

-- 3. get_notify_email: только админ (+service_role для скриптов)
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
revoke all on function public.get_notify_email() from anon;
grant execute on function public.get_notify_email() to authenticated, service_role;

revoke all on function public.set_notify_email(text) from public;
revoke all on function public.set_notify_email(text) from anon;
grant execute on function public.set_notify_email(text) to authenticated;

-- 4. Админские RPC: anon больше не вызывает (authenticated остаётся)
revoke execute on function public.list_all_events() from public;
revoke execute on function public.list_all_events() from anon;
revoke execute on function public.list_moderation_events() from anon;
revoke execute on function public.count_moderation_events(timestamp with time zone) from anon;
revoke execute on function public.delete_my_account() from anon;
revoke execute on function public.delete_moderation_events() from public;
revoke execute on function public.delete_moderation_events() from anon;
revoke execute on function public.admin_users_stats() from anon;
