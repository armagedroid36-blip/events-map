-- ============================================================
-- list_active_event_cards: облегчённый набор для SPA
-- (2026-10-03, задача kanban t_2a143ab5, SEO P1 «Рост пакета данных»).
--
-- Зачем: SPA на каждой странице тянула полный list_active_events — 41 колонка
-- с тремя описаниями, контактами и фото: замер 03.10 на 1127 активных строках
-- 2981 КБ raw / 716 КБ gzip. Это остаточный тормоз TBT/LCP (цель Perf >= 80).
--
-- Что отдаём: только то, что нужно карте, ленте, фильтрам, календарю, блокам
-- «Похожие события» и «Другие даты серии» (+ адрес: из него SPA собирает
-- название площадки в SEO-тексте ячейки, как статика).
-- НЕ отдаём (подгружается точечно при открытии события через get_public_event):
--   description / description_ru / description_en, photos, website, contact*,
--   org_avatar_url, org_display_name, is_international, status, created_at,
--   updated_at, reject_reason, moderator_note, languages, contact.
-- Замер того же набора по таблице: ~644 КБ raw / ~118 КБ gzip при 1127 строках
-- (критерий приёмки: <= 700 КБ raw / <= 200 КБ gzip при >= 1000 строках).
--
-- ПОРЯДОК ВАЖЕН: клиент читает набор постранично (limit/offset через .range()),
-- поэтому нужен полный порядок — start_date asc + tie-breaker id (как в
-- 20261003_list_active_events_stable_order.sql), иначе строки «прыгают» между
-- страницами (дубли/пропуски).
--
-- Тип фильтра — 1:1 как у list_active_events: активные, незаблокированные,
-- не завершившиеся (кроме бессрочных регулярных серий).
-- ============================================================

CREATE OR REPLACE FUNCTION public.list_active_event_cards()
RETURNS TABLE(
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
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
  order by e.start_date asc, e.id asc;   -- tie-breaker: пагинация limit/offset без него теряет строки
$function$
;

-- Права: аноним читает облегчённый набор, как list_active_events (публичная
-- карта). После revoke ... from public явные гранты ролям Supabase сохраняются,
-- поэтому выдаём их перечислением.
revoke all on function public.list_active_event_cards() from public;
grant execute on function public.list_active_event_cards() to anon, authenticated, service_role;
