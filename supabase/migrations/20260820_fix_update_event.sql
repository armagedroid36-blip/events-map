-- ============================================================
-- Фикс update_event: проверка владельца через подзапрос.
-- Голый `owner_id = auth.uid()` в PL/pgSQL вне SQL-команды
-- падает с 42703 (column "owner_id" does not exist) — админ
-- не мог сохранить изменения события на модерации.
-- ============================================================

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
    status = coalesce(data->>'status', status),
    reject_reason = case when data ? 'status' and data->>'status' = 'moderation' then null else reject_reason end
  where id = ev_id;
end $function$;

revoke all on function public.update_event(uuid, jsonb) from public;
grant execute on function public.update_event(uuid, jsonb) to authenticated;
