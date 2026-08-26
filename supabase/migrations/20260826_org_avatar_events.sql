-- ============================================================
-- Данные организатора в публичном списке событий (2026-08-26, правка 2).
-- list_active_events возвращает колонки events + org_avatar_url и
-- org_display_name из profiles владельца (NULL для событий без owner_id
-- или когда владелец не роль org / заблокирован — сами события
-- заблокированных по-прежнему скрыты).
-- Тип возврата меняется (добавлены колонки) — обязателен DROP (42P13).
-- ============================================================

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
  created_at timestamptz,
  start_time time,
  end_time time,
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
  updated_at timestamptz,
  recurrence jsonb,
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
