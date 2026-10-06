-- Пагинация list_active_event_cards параметрами, а не заголовком Range.
--
-- Зачем: PostgREST игнорирует заголовок Range для этой функции — проверено
-- шестью разными диапазонами, все три отдают одну и ту же первую тысячу строк
-- (`Content-Range: 0-999/*`). Из-за этого supabase-js `.range()` в SPA не
-- пагинировал: клиент молча видел максимум 1000 строк, а без защиты от
-- «пустой» страницы мог и зациклиться.
--
-- Решение: явные параметры p_limit/p_offset с дефолтами (1000/0) — прежний
-- вызов без аргументов продолжает работать как раньше, а вызывающий может
-- попросить следующую страницу (`{"p_limit":1000,"p_offset":1000}`).
--
-- Старую версию без параметров удаляем: PostgreSQL считает () и (int,int)
-- разными сигнатурами, и без drop PostgREST получал бы два перегруженных
-- варианта функции и отвечал ошибкой неоднозначности.

drop function if exists public.list_active_event_cards();

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
