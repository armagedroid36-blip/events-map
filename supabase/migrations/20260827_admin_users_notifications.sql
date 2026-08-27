-- ============================================================
-- Уведомления администратора о новых пользователях (2026-08-27)
--
-- last_seen_users_at — когда админ последний раз открывал вкладку
-- «Пользователи». Бейдж колокольчика для админа считает новых
-- пользователей/организаторов (role <> 'admin'), созданных после
-- этой отметки. По образцу 20260824_admin_notifications.sql.
-- ============================================================

alter table public.profiles
  add column if not exists last_seen_users_at timestamptz;

-- ============================================================
-- count_new_users: число новых пользователей/организаторов
-- (для бейджа админа). По образцу count_moderation_events:
-- security definer, RLS не мешает, вызывать может только админ.
-- ============================================================

create or replace function public.count_new_users(p_last_seen timestamptz default null)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'Permission denied';
  end if;
  return (select count(*) from public.profiles
          where role <> 'admin'
            and (p_last_seen is null or created_at > p_last_seen));
end;
$$;

revoke all on function public.count_new_users(timestamptz) from public;
grant execute on function public.count_new_users(timestamptz) to authenticated;
