-- ============================================================
-- visits_country_daily: ежедневные визиты по странам (ISO-2).
-- Запись — Edge Function track_visit (через RPC increment_visit_country),
-- чтение — только админские RPC (admin_visits_by_country / admin_visits_country_series).
-- IP-адреса посетителей НЕ хранятся (приватность): страна определяется
-- в Edge Function по IP и сохраняется только код страны.
-- ============================================================

-- 1. Таблица ежедневных визитов по странам
create table if not exists public.visits_country_daily (
  day date not null,
  country text not null,
  count bigint not null default 0,
  primary key (day, country)
);

comment on table public.visits_country_daily is
  'Ежедневные визиты по странам (ISO-2). Запись — Edge Function track_visit, чтение — только админские RPC';

-- RLS включён, политик НЕТ: прямой SELECT из клиента вернёт пусто.
-- Запись идёт service role'ом через security definer RPC
-- increment_visit_country, чтение — через RPC с проверкой is_admin.
alter table public.visits_country_daily enable row level security;

-- 2. increment_visit_country: +1 визит страны за сегодня (upsert по PK).
--    Безопасность: функция только увеличивает счётчик и не раскрывает
--    данные; вызов доступен анониму (из публичной Edge Function),
--    authenticated и service_role.
--    Питфол 42702: имя параметра НЕ должно совпадать с колонкой таблицы
--    (country) — plpgsql выдаёт «column reference is ambiguous».
--    Питфол 42P13: переименование параметра требует DROP FUNCTION.
drop function if exists public.increment_visit_country(text);
create or replace function public.increment_visit_country(p_country text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into visits_country_daily(day, country, count)
  values (current_date, p_country, 1)
  on conflict (day, country)
  do update set count = visits_country_daily.count + 1;
end
$$;

revoke all on function public.increment_visit_country(text) from public;
grant execute on function public.increment_visit_country(text) to anon, authenticated, service_role;

-- 3. admin_visits_by_country: сумма визитов по странам за период
--    (security definer + is_admin; сортировка: убывание суммы, затем по коду)
create or replace function public.admin_visits_by_country(p_days int default 30)
returns table (
  country text,
  count bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'Permission denied';
  end if;
  return query
    select v.country, sum(v.count)::bigint as count
    from public.visits_country_daily v
    where v.day >= current_date - p_days
    group by v.country
    order by sum(v.count) desc, v.country asc;
end;
$$;

revoke all on function public.admin_visits_by_country(integer) from public;
grant execute on function public.admin_visits_by_country(integer) to authenticated;

-- 4. admin_visits_country_series: визиты одной страны по дням за период
--    (для графика в админке; security definer + is_admin)
create or replace function public.admin_visits_country_series(p_country text, p_days int default 30)
returns table (
  day date,
  count bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'Permission denied';
  end if;
  return query
    select v.day, v.count
    from public.visits_country_daily v
    where v.country = p_country
      and v.day >= current_date - p_days
    order by v.day asc;
end;
$$;

revoke all on function public.admin_visits_country_series(text, integer) from public;
grant execute on function public.admin_visits_country_series(text, integer) to authenticated;
