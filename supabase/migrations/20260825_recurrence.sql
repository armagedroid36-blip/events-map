-- ============================================================
-- Повторяющиеся (регулярные) мероприятия: колонка recurrence.
-- null = разовое событие (по умолчанию).
-- {"freq":"daily"} = каждый день.
-- {"freq":"weekly","days":[1,3,5]} = еженедельно по дням (1=Пн … 7=Вс).
-- start_date = первое вхождение, end_date = последнее (пусто = бессрочно).
-- ============================================================

alter table public.events
  add column if not exists recurrence jsonb;

-- create_event: сохраняем recurrence (и заодно country/contact_instagram,
-- которые раньше терялись при создании админом; версия от 20260819_donation)
create or replace function public.create_event(data jsonb)
returns events
language plpgsql
security definer
set search_path to 'public'
as $function$
declare ev events;
begin
  insert into events (title, title_ru, title_en, description, description_ru, description_en,
    source_lang, language, start_date, end_date, start_time, end_time,
    city, country, address, lat, lng, category_id, website, contact,
    contact_telegram, contact_whatsapp, contact_email, contact_phone, contact_instagram,
    price, donation, currency, photos, recurrence, status)
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
    case when data ? 'recurrence' then data->'recurrence' else null end,
    coalesce(data->>'status','active')
  )
  returning * into ev;
  return ev;
end $function$;

-- update_event: обновляем recurrence (версия от 20260820_fix_update_event:
-- проверка владельца через подзапрос)
create or replace function public.update_event(ev_id uuid, data jsonb)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
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
    recurrence = case when data ? 'recurrence' then data->'recurrence' else recurrence end,
    status = coalesce(data->>'status', status),
    reject_reason = case when data ? 'status' and data->>'status' = 'moderation' then null else reject_reason end
  where id = ev_id;
end $function$;

revoke all on function public.update_event(uuid, jsonb) from public;
grant execute on function public.update_event(uuid, jsonb) to authenticated;
