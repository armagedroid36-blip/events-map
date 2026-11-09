-- list_active_event_cards: добавить description (обрезанный) в фид карточек.
--
-- Зачем: в снапшоте data/events.json (его собирает build-events-snapshot.mjs из
-- этой функции) описания НЕ было, поэтому страница события всегда шла в живые RPC
-- get_public_event + increment_counter — два запроса к Supabase на каждое открытие
-- карточки. При ~1300 проиндексированных страницах обход краулером сжёг месячный
-- egress и закрыл проект по квоте (09.11.2026). Описание в снапшоте убирает
-- основную часть этого расхода.
--
-- Возвращаемый набор меняется, поэтому CREATE OR REPLACE недостаточно (PostgreSQL
-- не позволяет менять OUT-колонки у существующей функции) — нужен DROP + CREATE
-- в ОДНОМ скрипте (Management API выполняет его одной транзакцией).
--
-- ПРИМЕНЕНИЕ: Management API POST /v1/projects/{ref}/database/query с PAT `sbp_...`.
-- Старый PAT (из scripts/backup-events-map.py) отдаёт 401 — нужен новый, иначе
-- миграцию применить нечем (service-role DDL не может).
--
-- Ограничение размера: 700 символов — карточке хватает на первый экран и
-- пререндер, а полный текст по-прежнему отдаёт get_public_event.

drop function if exists public.list_active_event_cards(int, int);

create or replace function public.list_active_event_cards(
  p_limit int default 1000,
  p_offset int default 0
)
returns table(
  id uuid,
  title text,
  title_ru text,
  title_en text,
  source_lang text,
  start_date date,
  end_date date,
  start_time time without time zone,
  end_time time without time zone,
  recurrence jsonb,
  city text,
  address text,
  description text,
  lat double precision,
  lng double precision,
  category_id text,
  price numeric,
  currency text,
  donation boolean,
  country text,
  language text,
  owner_id uuid
)
language sql
security definer
set search_path to 'public'
as $function$
  select
    e.id,
    e.title,
    e.title_ru,
    e.title_en,
    e.source_lang,
    e.start_date,
    e.end_date,
    e.start_time,
    e.end_time,
    e.recurrence,
    e.city,
    e.address,
    nullif(left(coalesce(e.description, ''), 700), '') as description,
    e.lat,
    e.lng,
    e.category_id,
    e.price,
    e.currency,
    e.donation,
    e.country,
    e.language,
    e.owner_id
  from public.events e
  where e.status = 'active'
    and not exists (
      select 1 from public.profiles b
      where b.id = e.owner_id and b.blocked_at is not null
    )
    and (
      coalesce(e.end_date, e.start_date) >= current_date
      or (e.recurrence is not null and e.recurrence <> 'null'::jsonb and e.end_date is null)
    )
  order by e.start_date asc, e.id asc
  limit greatest(coalesce(p_limit, 1000), 1)
  offset greatest(coalesce(p_offset, 0), 0);
$function$;
