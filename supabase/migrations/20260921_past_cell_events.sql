-- Часть 2 миграции 20260921: прошедшие события одной ячейки «город × категория»
-- для блока «Прошедшие события этой категории в <городе>» на восстановленных
-- посадочных страницах (SPA). Фильтр по городу и категории + лимит делает БД:
-- весь архив (~1600 строк) на страницу грузить нельзя.
--
-- Соответствие «путь города → текст e.city» зеркалит cityCrumb из
-- scripts/seo-prerender.mjs (Бали + районы, Дананг, Нячанг). При расширении
-- списка городов функцию обновить вместе с cityCrumb.

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
  updated_at timestamp with time zone
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
    e.updated_at
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
