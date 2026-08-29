-- ============================================================
-- stats_daily: ежедневные значения счётчиков (visits, card_views)
-- + admin_stats_history: история для админки (динамика по дням/месяцам/годам).
-- Таблица public.stats хранит ОДНО число на счётчик (сумма за всё время);
-- stats_daily хранит историю по дням, из неё фронт агрегирует периоды.
-- Проверка: сумма по stats_daily для счётчика = текущему значению в stats.
-- ============================================================

-- 1. Таблица ежедневных счётчиков
create table if not exists public.stats_daily (
  day date not null,
  name text not null,
  count bigint not null default 0,
  primary key (day, name)
);

comment on table public.stats_daily is
  'Ежедневные значения счётчиков (visits, card_views). Пишется increment_counter, читается только через RPC admin_stats_history.';

-- RLS включён, политик НЕТ: прямой SELECT из клиента вернёт пусто
-- (запись идёт через security definer RPC increment_counter, чтение — через
-- admin_stats_history, который сам проверяет is_admin).
alter table public.stats_daily enable row level security;

-- 2. increment_counter: прежнее поведение (суммарный счётчик в stats)
--    + upsert в stats_daily по текущей дате
create or replace function public.increment_counter(counter_name text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare n bigint;
begin
  insert into stats(name, value) values (counter_name, 1)
  on conflict (name) do update set value = stats.value + 1
  returning value into n;

  insert into stats_daily(day, name, count) values (current_date, counter_name, 1)
  on conflict (day, name) do update set count = stats_daily.count + 1;

  return n;
end
$$;

-- 3. admin_stats_history: все строки stats_daily (security definer + is_admin)
create or replace function public.admin_stats_history()
returns table (
  day date,
  name text,
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
    select sd.day, sd.name, sd.count
    from public.stats_daily sd
    order by sd.day asc, sd.name asc;
end;
$$;

revoke all on function public.admin_stats_history() from public;
grant execute on function public.admin_stats_history() to authenticated;
