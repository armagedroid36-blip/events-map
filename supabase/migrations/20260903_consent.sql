-- ============================================================
-- СОГЛАСИЕ НА ОБРАБОТКУ ПД (закон Вьетнама 91/2025), 2026-09-03.
-- 1) profiles.consent_at / consent_version — документирование
--    согласия пользователя при регистрации.
-- 2) create_profile: новый параметр c_version (версия политики
--    конфиденциальности, принятой пользователем). Фиксируется
--    ОДИН раз при создании профиля; ветка ON CONFLICT DO UPDATE
--    (повторное сохранение контактов) consent_at/consent_version
--    НЕ меняет.
-- ============================================================

alter table public.profiles
  add column if not exists consent_at timestamptz,
  add column if not exists consent_version text;

-- Старая сигнатура (7 аргументов) удаляется — расширяем функцию
drop function if exists public.create_profile(uuid, text, text, text, text, text, text);

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
