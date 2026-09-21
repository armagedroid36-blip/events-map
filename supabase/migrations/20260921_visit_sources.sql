-- ============================================================
-- visits_source_daily: ежедневная статистика ИСТОЧНИКОВ переходов
-- (промпт 21.09.2026: «откуда приходят посетители»).
--
-- Что храним: день, страна (ISO-2, определяется по IP), домен источника
-- (referrer, БЕЗ пути и query — только хост; пусто → 'direct'), страница входа
-- (pathname без query) и счётчик. Уникальность — по (день, страна, источник,
-- путь): суточная агрегация, а не построчный лог.
--
-- Чего НЕ храним: IP-адреса, полные рефереры, query-параметры, user-agent,
-- идентификаторы браузера. Данные не позволяют выделить конкретного
-- посетителя — только агрегаты (см. политику конфиденциальности).
--
-- Запись — Edge Function track_visit (service role) через RPC
-- increment_visit_source; чтение — только админский RPC admin_visits_by_source.
-- ============================================================

create table if not exists public.visits_source_daily (
  day date not null,
  country text not null,
  source text not null,
  landing_path text not null,
  count bigint not null default 0,
  primary key (day, country, source, landing_path)
);

comment on table public.visits_source_daily is
  'Ежедневные визиты по источнику и странице входа (агрегаты). IP и полные URL не хранятся';

-- RLS включён, политик НЕТ: прямой SELECT из клиента вернёт пусто.
alter table public.visits_source_daily enable row level security;

-- 1. increment_visit_source: +1 визит (день, страна, источник, путь).
--    Параметры названы с префиксом p_, чтобы не было 42702 «column reference
--    is ambiguous» (имя параметра = имя колонки — известный питфол этих RPC).
--    Длины обрезаются здесь же: источник ≤ 120, путь ≤ 200 символов.
create or replace function public.increment_visit_source(
  p_country text,
  p_source text,
  p_path text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_country text := coalesce(nullif(left(trim(p_country), 2), ''), 'unknown');
  v_source text := coalesce(nullif(left(trim(p_source), 120), ''), 'direct');
  v_path text := coalesce(nullif(left(trim(p_path), 200), ''), '/');
begin
  insert into visits_source_daily(day, country, source, landing_path, count)
  values (current_date, upper(v_country), lower(v_source), v_path, 1)
  on conflict (day, country, source, landing_path)
  do update set count = visits_source_daily.count + 1;
end
$$;

revoke all on function public.increment_visit_source(text, text, text) from public;
grant execute on function public.increment_visit_source(text, text, text) to anon, authenticated, service_role;

-- 2. admin_visits_by_source: сводка источников за период (только админ).
--    Возвращает агрегат по источнику: сколько визитов, стран, страниц входа,
--    и пример самой частой страницы входа (top_page) — этого хватает, чтобы
--    понять, откуда пришли и куда попали.
create or replace function public.admin_visits_by_source(p_days int default 30)
returns table (
  source text,
  visits bigint,
  countries bigint,
  pages bigint,
  top_page text
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
    with period as (
      select * from visits_source_daily
      where day >= current_date - greatest(p_days, 1) + 1
    ),
    by_source as (
      select p.source,
             sum(p.count)::bigint as visits,
             count(distinct p.country)::bigint as countries,
             count(distinct p.landing_path)::bigint as pages
      from period p
      group by p.source
    ),
    top_pages as (
      select distinct on (p.source) p.source, p.landing_path
      from period p
      order by p.source, sum(p.count) over (partition by p.source, p.landing_path) desc
    )
    select b.source, b.visits, b.countries, b.pages, t.landing_path
    from by_source b
    left join top_pages t on t.source = b.source
    order by b.visits desc, b.source;
end
$$;

revoke all on function public.admin_visits_by_source(integer) from public;
grant execute on function public.admin_visits_by_source(integer) to authenticated;

-- 3. admin_visits_source_country: разбивка одного источника по странам
--    (владельцу интересно: «Google → какие страны», «direct → какие страны»).
create or replace function public.admin_visits_source_country(p_days int default 30)
returns table (
  source text,
  country text,
  visits bigint
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
    select v.source, v.country, sum(v.count)::bigint as visits
    from visits_source_daily v
    where v.day >= current_date - greatest(p_days, 1) + 1
    group by v.source, v.country
    order by sum(v.count) desc, v.source, v.country;
end
$$;

revoke all on function public.admin_visits_source_country(integer) from public;
grant execute on function public.admin_visits_source_country(integer) to authenticated;

-- 4. admin_visits_source_pages: самые посещаемые страницы входа по источнику
--    (для разбора «что именно открывают из Telegram/поиска»).
create or replace function public.admin_visits_source_pages(p_days int default 30, p_limit int default 30)
returns table (
  source text,
  landing_path text,
  visits bigint
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
    select v.source, v.landing_path, sum(v.count)::bigint as visits
    from visits_source_daily v
    where v.day >= current_date - greatest(p_days, 1) + 1
    group by v.source, v.landing_path
    order by sum(v.count) desc, v.source, v.landing_path
    limit greatest(p_limit, 1);
end
$$;

revoke all on function public.admin_visits_source_pages(integer, integer) from public;
grant execute on function public.admin_visits_source_pages(integer, integer) to authenticated;
