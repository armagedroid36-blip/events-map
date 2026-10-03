-- ============================================================
-- list_active_events: стабильный порядок для постраничного чтения
-- (2026-10-03, задача kanban t_3c3fbfce, SEO P0).
--
-- Зачем: активных событий стало больше лимита PostgREST (1000 строк на
-- запрос), и клиенты (SPA src/lib/api.ts, пре-рендер scripts/seo-prerender.mjs)
-- читают набор страницами через limit/offset. Порядок был `start_date asc` —
-- НЕ полный: у событий с одинаковой датой порядок строк произволен, и при
-- пагинации строки «прыгают» между страницами (дубли и, что хуже, пропуски —
-- у события не появляется страница /event/<id>/ и его нет в sitemap).
-- Tie-breaker по id делает порядок полным, пагинация становится
-- детерминированной.
--
-- Тип возврата НЕ меняется (только ORDER BY) → create or replace без drop.
-- Тело — из 20260912_recurrence_jsonb_null.sql (последняя правка функции),
-- сверено с живой сигнатурой RPC (колонки совпадают 1:1).
-- ============================================================

CREATE OR REPLACE FUNCTION public.list_active_events()
 RETURNS TABLE(id uuid, title text, title_ru text, title_en text, description text, description_ru text, description_en text, source_lang text, start_date date, end_date date, city text, address text, lat double precision, lng double precision, category_id text, website text, contact text, photos jsonb, status text, created_at timestamp with time zone, start_time time without time zone, end_time time without time zone, owner_id uuid, contact_telegram text, contact_whatsapp text, contact_email text, contact_phone text, price numeric, currency text, language text, reject_reason text, country text, contact_instagram text, donation boolean, languages text[], moderator_note text, updated_at timestamp with time zone, recurrence jsonb, is_international boolean, org_avatar_url text, org_display_name text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    e.id,
    e.title,
    e.title_ru,
    e.title_en,
    left(e.description, 500) as description,    -- перф: полный текст не нужен (было до 3000 симв на строку)
    left(e.description_ru, 500) as description_ru,
    left(e.description_en, 500) as description_en,
    e.source_lang,
    e.start_date,
    e.end_date,
    e.city,
    e.address,
    e.lat,
    e.lng,
    e.category_id,
    e.website,
    e.contact,
    e.photos,
    e.status,
    e.created_at,
    e.start_time,
    e.end_time,
    e.owner_id,
    e.contact_telegram,
    e.contact_whatsapp,
    e.contact_email,
    e.contact_phone,
    e.price,
    e.currency,
    e.language,
    e.reject_reason,
    e.country,
    e.contact_instagram,
    e.donation,
    e.languages,
    e.moderator_note,
    e.updated_at,
    e.recurrence,
    e.is_international,
    p.avatar_url as org_avatar_url,
    p.display_name as org_display_name
  from public.events e
  left join public.profiles p
    on p.id = e.owner_id and p.role = 'org' and p.blocked_at is null
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

-- Права: create or replace их сохраняет, но фиксируем явно (как в 20260826).
revoke all on function public.list_active_events() from public;
grant execute on function public.list_active_events() to anon, authenticated, service_role;
