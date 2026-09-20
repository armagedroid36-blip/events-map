-- Публичная выдача ПРОШЕДШИХ событий (2026-09-20).
--
-- Зачем: archive-past.mjs переводит завершившиеся события active → archived,
-- после чего они пропадали из пре-рендера и sitemap, и Google Search Console
-- показывал ~1400 страниц «Не найдено (404)».
--
-- Новый набор для пре-рендера: активные (list_active_events) + архивные
-- (list_past_events). Страницы прошедших событий должны отдавать 200, поэтому
-- архивные события обязаны быть читаемы анонимом — RLS-политика
-- «read active events public» их не отдаёт, а list_all_events закрыт от anon
-- (revoke execute ... from anon, миграция 20260825_hardening.sql).
--
-- Видимость зеркалит list_active_events: события заблокированных организаторов
-- не отдаются вовсе. Описания НЕ обрезаются: из них собираются SEO-страницы
-- (в list_active_events обрезка до 500 нужна ради карты).
--
-- get_public_event(p_id) — точечная выдача одного события (active ИЛИ archived)
-- для SPA: прямая ссылка /event/<id>/<slug>/ на прошедшее событие должна
-- открывать карточку «событие прошло», а не заглушку «не найдено». Описания
-- здесь обрезаны до 500 — как в list_active_events (карточке хватает).

create or replace function public.list_past_events()
returns table(
  id uuid,
  title text,
  title_ru text,
  title_en text,
  description text,
  description_ru text,
  description_en text,
  source_lang text,
  start_date date,
  end_date date,
  city text,
  address text,
  lat double precision,
  lng double precision,
  category_id text,
  website text,
  contact text,
  photos jsonb,
  status text,
  created_at timestamp with time zone,
  start_time time without time zone,
  end_time time without time zone,
  owner_id uuid,
  contact_telegram text,
  contact_whatsapp text,
  contact_email text,
  contact_phone text,
  price numeric,
  currency text,
  language text,
  reject_reason text,
  country text,
  contact_instagram text,
  donation boolean,
  languages text[],
  moderator_note text,
  updated_at timestamp with time zone,
  recurrence jsonb,
  is_international boolean,
  org_avatar_url text,
  org_display_name text
)
language sql
security definer
set search_path = public
as $function$
  select
    e.id,
    e.title,
    e.title_ru,
    e.title_en,
    e.description,
    e.description_ru,
    e.description_en,
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
  where e.status = 'archived'
    and not exists (
      select 1 from public.profiles b
      where b.id = e.owner_id and b.blocked_at is not null
    )
  order by coalesce(e.end_date, e.start_date) desc;
$function$;

revoke all on function public.list_past_events() from public;
grant execute on function public.list_past_events() to anon, authenticated;

create or replace function public.get_public_event(p_id uuid)
returns table(
  id uuid,
  title text,
  title_ru text,
  title_en text,
  description text,
  description_ru text,
  description_en text,
  source_lang text,
  start_date date,
  end_date date,
  city text,
  address text,
  lat double precision,
  lng double precision,
  category_id text,
  website text,
  contact text,
  photos jsonb,
  status text,
  created_at timestamp with time zone,
  start_time time without time zone,
  end_time time without time zone,
  owner_id uuid,
  contact_telegram text,
  contact_whatsapp text,
  contact_email text,
  contact_phone text,
  price numeric,
  currency text,
  language text,
  reject_reason text,
  country text,
  contact_instagram text,
  donation boolean,
  languages text[],
  moderator_note text,
  updated_at timestamp with time zone,
  recurrence jsonb,
  is_international boolean,
  org_avatar_url text,
  org_display_name text
)
language sql
security definer
set search_path = public
as $function$
  select
    e.id,
    e.title,
    e.title_ru,
    e.title_en,
    left(e.description, 500) as description,
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
  where e.id = p_id
    and e.status in ('active', 'archived')
    and not exists (
      select 1 from public.profiles b
      where b.id = e.owner_id and b.blocked_at is not null
    );
$function$;

revoke all on function public.get_public_event(uuid) from public;
grant execute on function public.get_public_event(uuid) to anon, authenticated;
