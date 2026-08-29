-- ============================================================
-- is_international: метка «артист международный (гастролирующий)».
-- Ставит LLM-детект в collect-bali.mjs для концертов/музыки
-- (типы Балифорума «Концерт», «Музыка», «Живая музыка»).
-- UI: бейдж на карточке события (EventCard).
--
-- ВАЖНО: новая колонка ломает list_active_events (RETURNS TABLE с ручным
-- перечислением колонок events) — ниже полное пересоздание функции
-- с is_international (порядок колонок = порядок таблицы events).
-- Другие RPC-списки (list_all_events, list_moderation_events) используют
-- returns setof events — они безопасны, их не трогаем.
-- ============================================================

alter table public.events add column if not exists is_international boolean not null default false;

comment on column public.events.is_international is
  'Международный (гастролирующий) артист — метка LLM для концертов и музыки';

-- Публичный список активных событий (события заблокированных организаторов скрыты).
-- Тип возврата меняется (добавлена is_international) — create or replace дал бы
-- 42P13 «final statement returns too many columns», поэтому сначала drop.
drop function if exists public.list_active_events();

create or replace function public.list_active_events()
returns table (
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
as $$
  select
    e.*,
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
  order by e.start_date asc;
$$;

revoke all on function public.list_active_events() from public;
grant execute on function public.list_active_events() to anon, authenticated, service_role;
