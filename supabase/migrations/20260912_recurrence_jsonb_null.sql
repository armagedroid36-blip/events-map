-- jsonb 'null' в events.recurrence ломал фильтр прошедших событий (12.09.2026).
--
-- СИМПТОМ: карточки событий с прошедшей датой оставались в list_active_events
-- и в пре-рендере: у события есть start_date в прошлом, нет end_date и нет
-- правила повтора, но оно всё равно отдаётся как «бессрочная серия».
--
-- ПРИЧИНА: в колонке лежал jsonb 'null' (JSON-null), а не SQL NULL. В
-- plpgsql `data ? 'recurrence'` для ключа со значением null — true, а
-- `data->'recurrence'` возвращает jsonb 'null'. Дальше `recurrence is not null`
-- истинно → ветка `or (e.recurrence is not null and e.end_date is null)` в
-- list_active_events пропускала событие всегда, а archive-past.mjs (фильтр
-- `.is('recurrence', null)`) такие строки не видел и не архивировал. В обычном
-- `select recurrence` JSON-null и SQL NULL неразличимы — баг незаметен без
-- SQL-проверки `recurrence = 'null'::jsonb` или PostgREST `recurrence=not.is.null`.
--
-- ФИКС: (1) писатели нормализуют JSON-null в SQL NULL (nullif), (2) триггер
-- держит инвариант в хранилище для любых будущих писателей, (3) читатель
-- list_active_events больше не считает jsonb 'null' повтором.
--
-- Применять через Management API /database/query (db push в проекте не работает).

-- 1) Хранимый инвариант: jsonb 'null' → SQL NULL
create or replace function public.events_recurrence_normalize()
returns trigger
language plpgsql
as $$
begin
  if new.recurrence is not null and new.recurrence = 'null'::jsonb then
    new.recurrence := null;
  end if;
  return new;
end;
$$;

drop trigger if exists events_recurrence_normalize on public.events;
create trigger events_recurrence_normalize
  before insert or update of recurrence on public.events
  for each row execute function public.events_recurrence_normalize();

-- 2) Разовая нормализация уже накопленных строк
update public.events set recurrence = null where recurrence = 'null'::jsonb;

-- 3) create_event: nullif вместо сырого data->'recurrence'
CREATE OR REPLACE FUNCTION public.create_event(data jsonb)
 RETURNS events
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare ev events;
begin
  insert into events (title, title_ru, title_en, description, description_ru, description_en,
    source_lang, language, start_date, end_date, start_time, end_time,
    city, country, address, lat, lng, category_id, website, contact,
    contact_telegram, contact_whatsapp, contact_email, contact_phone, contact_instagram,
    price, donation, currency, photos, recurrence, status, source_type)
  values (
    data->>'title', data->>'title_ru', data->>'title_en',
    coalesce(data->>'description',''), data->>'description_ru', data->>'description_en',
    coalesce(data->>'source_lang','ru'), data->>'language',
    (data->>'start_date')::date, nullif(data->>'end_date','')::date,
    nullif(data->>'start_time','')::time, nullif(data->>'end_time','')::time,
    coalesce(data->>'city',''), data->>'country', data->>'address',
    coalesce((data->>'lat')::double precision, 0), coalesce((data->>'lng')::double precision, 0),
    data->>'category_id', data->>'website', data->>'contact',
    data->>'contact_telegram', data->>'contact_whatsapp', data->>'contact_email', data->>'contact_phone',
    data->>'contact_instagram',
    case when data ? 'price' then nullif(data->>'price','')::numeric else null end,
    coalesce((data->>'donation')::boolean, false),
    data->>'currency',
    coalesce(data->'photos', '[]'::jsonb),
    case when data ? 'recurrence' then nullif(data->'recurrence', 'null'::jsonb) else null end,
    coalesce(data->>'status','active'),
    'organizer'
  )
  returning * into ev;
  return ev;
end $function$
;

-- 4) update_event: то же в UPDATE-ветке
CREATE OR REPLACE FUNCTION public.update_event(ev_id uuid, data jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- Доступ: админ или владелец (организатор)
  if not (
    is_admin()
    or exists (select 1 from events e where e.id = ev_id and e.owner_id = auth.uid())
  ) then
    raise exception 'Нет доступа';
  end if;
  update events set
    title = coalesce(data->>'title', title),
    title_ru = coalesce(data->>'title_ru', title_ru),
    title_en = coalesce(data->>'title_en', title_en),
    description = coalesce(data->>'description', description),
    description_ru = coalesce(data->>'description_ru', description_ru),
    description_en = coalesce(data->>'description_en', description_en),
    source_lang = coalesce(data->>'source_lang', source_lang),
    language = coalesce(data->>'language', language),
    start_date = coalesce((data->>'start_date')::date, start_date),
    end_date = case when data ? 'end_date' then nullif(data->>'end_date','')::date else end_date end,
    start_time = case when data ? 'start_time' then nullif(data->>'start_time','')::time else start_time end,
    end_time = case when data ? 'end_time' then nullif(data->>'end_time','')::time else end_time end,
    city = coalesce(data->>'city', city),
    country = coalesce(data->>'country', country),
    address = coalesce(data->>'address', address),
    lat = coalesce((data->>'lat')::double precision, lat),
    lng = coalesce((data->>'lng')::double precision, lng),
    category_id = coalesce(data->>'category_id', category_id),
    website = coalesce(data->>'website', website),
    contact = coalesce(data->>'contact', contact),
    contact_telegram = coalesce(data->>'contact_telegram', contact_telegram),
    contact_whatsapp = coalesce(data->>'contact_whatsapp', contact_whatsapp),
    contact_email = coalesce(data->>'contact_email', contact_email),
    contact_phone = coalesce(data->>'contact_phone', contact_phone),
    contact_instagram = coalesce(data->>'contact_instagram', contact_instagram),
    price = case when data ? 'price' then nullif(data->>'price','')::numeric else price end,
    donation = coalesce((data->>'donation')::boolean, donation),
    currency = coalesce(data->>'currency', currency),
    photos = case when data ? 'photos' then coalesce(data->'photos','[]'::jsonb) else photos end,
    recurrence = case when data ? 'recurrence' then nullif(data->'recurrence', 'null'::jsonb) else recurrence end,
    status = coalesce(data->>'status', status),
    reject_reason = case when data ? 'status' and data->>'status' = 'moderation' then null else reject_reason end
  where id = ev_id;
end $function$
;

-- 5) list_active_events: jsonb 'null' больше не считается бессрочной серией
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
  order by e.start_date asc;
$function$
;