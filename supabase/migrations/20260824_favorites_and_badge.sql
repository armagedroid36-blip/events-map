-- ============================================================
-- Избранное + бейдж «движение по заявкам» (2026-08-24)
--
-- 1. profiles.last_seen_my_events_at — когда организатор последний раз
--    открывал «Мои события» (для бейджа уведомлений).
-- 2. events.updated_at — время последнего изменения события (статус,
--    правка). Автообновляется триггером при любом UPDATE.
-- 3. Таблица favorites (user_id + event_id, уникальность пары) с RLS:
--    владелец читает/добавляет/удаляет только свои записи.
-- 4. delete_my_account дополнен чисткой favorites.
-- ============================================================

-- 1. Поле «последний просмотр моих событий» (RLS «profiles own» ALL
--    уже разрешает владельцу читать/писать свою строку)
alter table public.profiles
  add column if not exists last_seen_my_events_at timestamptz;

-- 2. Время изменения события + триггер автообновления
alter table public.events
  add column if not exists updated_at timestamptz not null default now();

create or replace function public.set_events_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists events_set_updated_at on public.events;
create trigger events_set_updated_at
  before update on public.events
  for each row execute function public.set_events_updated_at();

-- 3. Таблица избранного + RLS
create table if not exists public.favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, event_id)
);

alter table public.favorites enable row level security;

drop policy if exists "favorites own" on public.favorites;
create policy "favorites own"
  on public.favorites
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- 4. Удаление аккаунта теперь чистит и избранное
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  delete from public.favorites where user_id = uid;
  delete from public.history where user_id = uid;
  delete from public.events where owner_id = uid and status <> 'active';
  delete from public.profiles where id = uid;
  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;
