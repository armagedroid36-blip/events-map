-- ============================================================
-- SECURITY HARDENING 2026-09-04 (итог security-аудита).
-- 1) create_profile: IDOR — uid обязан совпадать с auth.uid();
--    заблокированные (по живому токену) профиль не сохраняют.
-- 2) is_admin(): зафиксирована в миграциях (до сих пор жила только
--    в живой БД) + проверка blocked_at: заблокированный админ
--    админом не считается (требование аудита; для легитимных
--    админов поведение не меняется — их blocked_at = null).
-- 3) get_notify_email / set_notify_email: единая финальная версия
--    политики (как в notify_settings.sql, но без grant anon).
-- Сигнатуры функций не меняются (фронт/скрипты зависят от них).
-- ============================================================

-- ============================================================
-- 1a. create_profile: IDOR + блокировка.
-- Фронт зовёт функцию сразу после verifyOtp (сессия создана),
-- поэтому auth.uid() в момент вызова установлен и равен data.user.id.
-- Сигнатура (uuid, text, text, text, text, text, text, text) и
-- revoke/grant не меняются.
-- ============================================================
create or replace function public.create_profile(
  uid uuid,
  p_role text,
  tg text default '',
  wa text default '',
  em text default '',
  ph text default '',
  ig text default '',
  c_version text default null
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
  -- IDOR: создавать/перезаписывать профиль можно только СВОЙ.
  -- Чужой uid (или анонимный вызов) отклоняется.
  if uid is distinct from auth.uid() then
    raise exception 'Permission denied';
  end if;
  -- Запрет для заблокированных (паттерн delete_event/add_gallery_photo):
  -- проверка только если профиль уже существует — у нового пользователя
  -- профиля ещё нет, регистрация не ломается.
  if exists (select 1 from profiles where id = uid and blocked_at is not null) then
    raise exception 'Account blocked';
  end if;
  insert into profiles (id, role, contact_telegram, contact_whatsapp, contact_email, contact_phone, instagram, consent_at, consent_version)
  values (
    uid, p_role,
    nullif(tg, ''), nullif(wa, ''), nullif(em, ''), nullif(ph, ''), nullif(ig, ''),
    -- consent_at фиксируется только когда клиент передал версию политики:
    -- старый клиент (до деплоя, без c_version) не «получает» задним числом
    -- отметку о согласии, которого не запрашивал
    case when nullif(c_version, '') is not null then now() else null end,
    nullif(c_version, '')
  )
  on conflict (id) do update set
    role = excluded.role,
    contact_telegram = excluded.contact_telegram,
    contact_whatsapp = excluded.contact_whatsapp,
    contact_email = excluded.contact_email,
    contact_phone = excluded.contact_phone,
    instagram = excluded.instagram;
    -- consent_at/consent_version намеренно НЕ обновляются: согласие
    -- фиксируется один раз при создании профиля
end;
$$;

revoke all on function public.create_profile(uuid, text, text, text, text, text, text, text) from public;
revoke all on function public.create_profile(uuid, text, text, text, text, text, text, text) from anon;
grant execute on function public.create_profile(uuid, text, text, text, text, text, text, text) to authenticated, service_role;

-- ============================================================
-- 1b. is_admin(): определение зафиксировано в миграциях.
-- Живое определение (прочитано перед применением): language sql,
-- security definer, set search_path = public,
-- select exists(select 1 from profiles where id = auth.uid()
--               and role = 'admin');
-- Эквивалентная логика + blocked_at is null (заблокированный админ
-- не считается админом — пункт аудита; admin_block_user и так не
-- даёт блокировать админов, для легитимных поведение прежнее).
-- ============================================================
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and blocked_at is null
  );
$$;

-- ============================================================
-- 1c. get_notify_email / set_notify_email: единая финальная версия
-- (notify_settings.sql, но БЕЗ лишнего grant anon на чтение).
-- get_notify_email: только админ или service_role (скрипт-монитор).
-- set_notify_email: только админ (+ валидация email).
-- ============================================================
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
revoke all on function public.set_notify_email(text) from anon;
grant execute on function public.set_notify_email(text) to authenticated;
