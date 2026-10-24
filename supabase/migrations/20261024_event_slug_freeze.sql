-- ============================================================
-- Заморозка хвоста URL события (2026-10-24).
--
-- Проблема: eventSlug() (src/lib/slug.ts) каждый раз считал хвост
-- /event/<id>/<slug>/ из текущих title_ru/title_en. Правка названия меняла
-- адрес страницы — в sitemap, canonical и ссылках SPA. Компенсация была только
-- ретроактивной (реестр алиасов после смены): в прогоне 92 так сменилось
-- 642 URL.
--
-- Решение: при первой публикации слаг фиксируется в events.slug_ru/slug_en
-- (scripts/freeze-event-slugs.mjs). eventSlug() возвращает заполненное
-- значение как есть и считает из названия только пока колонка пуста.
-- Колонки нужны только в RPC-проекциях: без них SPA-ссылки (get_public_event,
-- карточки с карты) разойдутся со статикой.
--
-- Тип возврата RETURNS TABLE меняется, поэтому каждую функцию сначала
-- удаляем: CREATE OR REPLACE не умеет менять тип возврата.
-- ============================================================

alter table public.events add column if not exists slug_ru text;
alter table public.events add column if not exists slug_en text;

comment on column public.events.slug_ru is
  'Замороженный хвост RU-URL события (/event/<id>/<slug_ru>/). Заполняется один раз при первой публикации (scripts/freeze-event-slugs.mjs), дальше не перезаписывается: правка title_ru адрес не меняет.';
comment on column public.events.slug_en is
  'Замороженный хвост EN-URL события (/en/event/<id>/<slug_en>/). Заполняется один раз, если у события есть EN-версия (title_en или англоязычный оригинал).';

-- ------------------------------------------------------------
-- updated_at: заморозка слагов — служебная правка.
--
-- Триггер ставил now() на ЛЮБОЙ update. Бэкфилл (все 5 533 опубликованных
-- события) объявил бы все страницы «обновлёнными сегодня» (sitemap lastmod =
-- updated_at) и сровнял бы updated_at у дублей, по которому dedupe выбирает
-- главную копию. Поэтому если единственное, что изменилось, — slug_ru/slug_en,
-- время изменения сохраняем.
-- ------------------------------------------------------------
create or replace function public.set_events_updated_at()
returns trigger
language plpgsql
as $$
begin
  -- Сравниваем строку БЕЗ slug_ru/slug_en/updated_at: если там ничего не
  -- изменилось, это заморозка слагов (или пустой апдейт) — время изменения
  -- карточки сохраняем. Любая правка содержимого по-прежнему ставит now().
  if (to_jsonb(new) - 'slug_ru' - 'slug_en' - 'updated_at')
     is not distinct from (to_jsonb(old) - 'slug_ru' - 'slug_en' - 'updated_at')
  then
    new.updated_at := old.updated_at;
  else
    new.updated_at := now();
  end if;
  return new;
end;
$$;

-- ------------------------------------------------------------
-- 1) list_active_events
-- ------------------------------------------------------------
drop function if exists public.list_active_events();

CREATE OR REPLACE FUNCTION public.list_active_events()
 RETURNS TABLE(id uuid, title text, title_ru text, title_en text, description text, description_ru text, description_en text, source_lang text, start_date date, end_date date, city text, address text, lat double precision, lng double precision, category_id text, website text, contact text, photos jsonb, status text, created_at timestamp with time zone, start_time time without time zone, end_time time without time zone, owner_id uuid, contact_telegram text, contact_whatsapp text, contact_email text, contact_phone text, price numeric, currency text, language text, reject_reason text, country text, contact_instagram text, donation boolean, languages text[], moderator_note text, updated_at timestamp with time zone, recurrence jsonb, is_international boolean, org_avatar_url text, org_display_name text, slug_ru text, slug_en text)
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
    p.display_name as org_display_name,
    e.slug_ru,
    e.slug_en
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

revoke all on function public.list_active_events() from public;
grant execute on function public.list_active_events() to anon, authenticated, service_role;

-- ------------------------------------------------------------
-- 2) list_past_events
-- ------------------------------------------------------------
drop function if exists public.list_past_events();

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
  org_display_name text,
  slug_ru text,
  slug_en text
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
    p.display_name as org_display_name,
    e.slug_ru,
    e.slug_en
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

-- ------------------------------------------------------------
-- 3) get_public_event (SPA: прямая ссылка на активное/прошедшее событие)
-- ------------------------------------------------------------
drop function if exists public.get_public_event(uuid);

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
  org_display_name text,
  slug_ru text,
  slug_en text
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
    p.display_name as org_display_name,
    e.slug_ru,
    e.slug_en
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

-- ------------------------------------------------------------
-- 4) list_active_event_cards (карта/лента SPA, пагинация параметрами)
-- ------------------------------------------------------------
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
  lat double precision,
  lng double precision,
  category_id text,
  price numeric,
  currency text,
  donation boolean,
  country text,
  language text,
  owner_id uuid,
  slug_ru text,
  slug_en text
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
    e.lat,
    e.lng,
    e.category_id,
    e.price,
    e.currency,
    e.donation,
    e.country,
    e.language,
    e.owner_id,
    e.slug_ru,
    e.slug_en
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

revoke all on function public.list_active_event_cards(int, int) from public;
grant execute on function public.list_active_event_cards(int, int) to anon, authenticated, service_role;

-- ------------------------------------------------------------
-- 5) list_past_cell_events (блок «прошедшие в этом городе»)
-- ------------------------------------------------------------
drop function if exists public.list_past_cell_events(text, text, int);

create or replace function public.list_past_cell_events(
  p_city_path text,
  p_category text,
  p_limit int default 20
)
returns table (
  id uuid,
  title text,
  title_ru text,
  title_en text,
  source_lang text,
  start_date date,
  end_date date,
  city text,
  address text,
  category_id text,
  price numeric,
  currency text,
  donation boolean,
  status text,
  updated_at timestamp with time zone,
  slug_ru text,
  slug_en text
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
    e.source_lang,
    e.start_date,
    e.end_date,
    e.city,
    e.address,
    e.category_id,
    e.price,
    e.currency,
    e.donation,
    e.status,
    e.updated_at,
    e.slug_ru,
    e.slug_en
  from public.events e
  where e.status = 'archived'
    and e.category_id = p_category
    and p_city_path in ('bali', 'da-nang', 'nha-trang')
    and case p_city_path
          when 'bali' then
            lower(e.city) ~ 'бали|bali|ubud|убуд|canggu|чангу|seminyak|семиньяк|kuta|кута|denpasar|gianyar'
          when 'da-nang' then
            lower(e.city) ~ 'дананг|da nang|danang'
          else
            lower(e.city) ~ 'нячанг|nha trang'
        end
    and not exists (
      select 1 from public.profiles b
      where b.id = e.owner_id and b.blocked_at is not null
    )
  order by coalesce(e.end_date, e.start_date) desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$function$;

revoke all on function public.list_past_cell_events(text, text, int) from public;
grant execute on function public.list_past_cell_events(text, text, int) to anon, authenticated;

-- PostgREST: обновить кэш схемы, иначе RPC-ответы какое-то время идут по старой
-- сигнатуре (без slug_*).
notify pgrst, 'reload schema';
