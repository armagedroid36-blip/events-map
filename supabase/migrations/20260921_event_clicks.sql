-- ============================================================
-- event_clicks: клики по кнопке «Записаться»/«Связаться» в карточке события.
--
-- Что храним: id события, вид клика ('booking' — ссылка регистрации события,
-- 'contact' — переход в контакты организатора, если ссылки нет) и время.
-- Персональных данных нет: ни IP, ни user-agent, ни идентификатора браузера —
-- только счётчик интереса к событию (ТЗ: «без PII»).
--
-- RLS: разрешён ТОЛЬКО INSERT (гость и вошедший); SELECT-политик нет —
-- чтение только через админские RPC (is_admin).
-- Запись с сайта — через RPC log_event_click (security definer).
-- ============================================================

create table if not exists public.event_clicks (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  kind text not null check (kind in ('booking', 'contact')),
  created_at timestamptz not null default now()
);

comment on table public.event_clicks is
  'Клики «Записаться»/«Связаться» в карточке события (event_id, kind, created_at). Без PII';

create index if not exists event_clicks_event_idx on public.event_clicks (event_id, created_at desc);
create index if not exists event_clicks_created_idx on public.event_clicks (created_at desc);

alter table public.event_clicks enable row level security;

-- Только вставка. Нет политик SELECT/UPDATE/DELETE — читают и чистят админы
-- через security definer RPC (и service role в обслуживающих скриптах).
drop policy if exists "insert event clicks" on public.event_clicks;
create policy "insert event clicks" on public.event_clicks
  for insert to anon, authenticated with check (true);

-- 1. log_event_click: записать клик. Вид нормализуется (неизвестный → 'booking'),
--    события без записи в events игнорируются (FK не даст вставить — вернём тихо).
--    Функция ничего не возвращает и не раскрывает данных — безопасна для анонима.
create or replace function public.log_event_click(p_event_id uuid, p_kind text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind text := case when p_kind = 'contact' then 'contact' else 'booking' end;
begin
  if p_event_id is null then
    return;
  end if;
  if not exists (select 1 from public.events e where e.id = p_event_id) then
    return;
  end if;
  insert into public.event_clicks(event_id, kind) values (p_event_id, v_kind);
end
$$;

revoke all on function public.log_event_click(uuid, text) from public;
grant execute on function public.log_event_click(uuid, text) to anon, authenticated, service_role;

-- 2. admin_event_clicks: сводка по событиям за период (только админ).
--    Считаем оба вида кликов отдельно + итог и время последнего клика.
create or replace function public.admin_event_clicks(p_days int default 30)
returns table (
  event_id uuid,
  title text,
  booking bigint,
  contact bigint,
  total bigint,
  last_at timestamptz
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
    select
      c.event_id,
      coalesce(e.title, '') as title,
      count(*) filter (where c.kind = 'booking')::bigint as booking,
      count(*) filter (where c.kind = 'contact')::bigint as contact,
      count(*)::bigint as total,
      max(c.created_at) as last_at
    from public.event_clicks c
    left join public.events e on e.id = c.event_id
    where c.created_at >= (current_date - greatest(p_days, 1) + 1)::timestamptz
    group by c.event_id, e.title
    order by count(*) desc, max(c.created_at) desc
    limit 100;
end
$$;

revoke all on function public.admin_event_clicks(integer) from public;
grant execute on function public.admin_event_clicks(integer) to authenticated;

-- 3. admin_event_clicks_map: счётчики по событиям для строк админского списка
--    (клиент мержит с listAllEvents, отдельный RPC на строку не нужен).
create or replace function public.admin_event_clicks_map(p_days int default 30)
returns table (
  event_id uuid,
  booking bigint,
  contact bigint
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
    select
      c.event_id,
      count(*) filter (where c.kind = 'booking')::bigint,
      count(*) filter (where c.kind = 'contact')::bigint
    from public.event_clicks c
    where c.created_at >= (current_date - greatest(p_days, 1) + 1)::timestamptz
    group by c.event_id;
end
$$;

revoke all on function public.admin_event_clicks_map(integer) from public;
grant execute on function public.admin_event_clicks_map(integer) to authenticated;
