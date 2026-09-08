-- Разметка источника события для модерации: collector (сборщики TG/Бали),
-- theatre (постоянные шоу/театры), organizer (создано организатором).
alter table public.events
  add column if not exists source_type text not null default 'collector';

-- Существующие события: организаторские — по owner_id; театральные — по
-- доменам сайтов; telegram-сборщик — по website t.me; остальное (default)
-- остаётся collector (события Бали-сборщика с сайтов-афиш).
update public.events set source_type = case
  when website like '%vinwonders.com%'
    or website like '%danangfantasticity.com%'
    or website like '%ubudcenter.com%'
    or website like '%dotheatre.vn%'
    or website like '%uluwatutemple.id%'
    then 'theatre'
  when owner_id is not null then 'organizer'
  when website like 'https://t.me/%' then 'collector'
  else source_type
end;

comment on column public.events.source_type is
  'Источник события: collector (автосбор), theatre (постоянные шоу), organizer (организатор)';

-- Модерация по источнику: параметр p_source фильтрует список,
-- без параметра — все (старое поведение, шапка-счётчики).
-- ВАЖНО: drop перед create — PostgREST НЕ умеет выбирать между перегрузками
-- f() и f(text default null): вызов без параметров даёт PGRST203 «could not
-- choose the best candidate» (бесконечная загрузка модерации, баг 0.32).
drop function if exists public.list_moderation_events();
create or replace function public.list_moderation_events(p_source text default null)
returns setof events
language plpgsql
security definer
set search_path = public
as $function$
begin
  if not is_admin() then
    raise exception 'Permission denied';
  end if;
  return query
    select * from public.events
    where status = 'moderation'
      and (p_source is null or source_type = p_source)
    order by created_at desc;
end;
$function$;

revoke all on function public.list_moderation_events(text) from public;
grant execute on function public.list_moderation_events(text) to authenticated;

-- create_event (создание события админом через форму) — источник «organizer»
-- (человек через UI), а не default 'collector'.
create or replace function public.create_event(data jsonb)
returns events
language plpgsql
security definer
set search_path = public
as $function$
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
    case when data ? 'recurrence' then data->'recurrence' else null end,
    coalesce(data->>'status','active'),
    'organizer'
  )
  returning * into ev;
  return ev;
end $function$;
