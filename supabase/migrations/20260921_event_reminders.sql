-- ============================================================
-- event_reminders: «Напомнить за день» — подписка пользователя на напоминание
-- по конкретному событию.
--
-- Доставка: push (та же инфраструктура, что у уведомлений организаторам:
-- supabase/functions/notify-push + workflow .github/workflows/notify-reminders).
-- Читает и пишет свои напоминания сам пользователь (RLS по user_id = auth.uid()),
-- отправляет — service role из Edge Function.
--
-- remind_on — дата, В КОТОРУЮ надо отправить напоминание (её считает клиент:
-- ближайшее вхождение события минус один день; для регулярных серий это
-- ближайшая дата по правилу повтора — логика повторов живёт в src/lib/recurrence.ts).
-- sent_at — отметка отправки: одно напоминание отправляется один раз.
-- ============================================================

create table if not exists public.event_reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  remind_on date not null,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (user_id, event_id)
);

comment on table public.event_reminders is
  'Напоминания «за день» по событиям: user_id, event_id, дата отправки, отметка sent_at';

create index if not exists event_reminders_due_idx
  on public.event_reminders (remind_on)
  where sent_at is null;

alter table public.event_reminders enable row level security;

-- Пользователь видит и меняет ТОЛЬКО свои напоминания
drop policy if exists "own reminders select" on public.event_reminders;
create policy "own reminders select" on public.event_reminders
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "own reminders insert" on public.event_reminders;
create policy "own reminders insert" on public.event_reminders
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "own reminders update" on public.event_reminders;
create policy "own reminders update" on public.event_reminders
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own reminders delete" on public.event_reminders;
create policy "own reminders delete" on public.event_reminders
  for delete to authenticated using (user_id = auth.uid());

-- 1. set_event_reminder: поставить/переставить напоминание текущему пользователю.
--    Повторный вызов обновляет дату и снимает отметку отправки (sent_at = null):
--    пользователь мог перенести напоминание на другую дату.
create or replace function public.set_event_reminder(p_event_id uuid, p_remind_on date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Permission denied';
  end if;
  if p_event_id is null or p_remind_on is null then
    return;
  end if;
  if not exists (select 1 from public.events e where e.id = p_event_id) then
    return;
  end if;
  insert into public.event_reminders(user_id, event_id, remind_on)
  values (v_uid, p_event_id, p_remind_on)
  on conflict (user_id, event_id)
  do update set remind_on = excluded.remind_on, sent_at = null;
end
$$;

revoke all on function public.set_event_reminder(uuid, date) from public;
grant execute on function public.set_event_reminder(uuid, date) to authenticated;

-- 2. remove_event_reminder: снять напоминание
create or replace function public.remove_event_reminder(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Permission denied';
  end if;
  delete from public.event_reminders
  where user_id = auth.uid() and event_id = p_event_id;
end
$$;

revoke all on function public.remove_event_reminder(uuid) from public;
grant execute on function public.remove_event_reminder(uuid) to authenticated;

-- 3. my_event_reminders: мои напоминания (клиент подсвечивает колокольчик)
create or replace function public.my_event_reminders()
returns table (
  event_id uuid,
  remind_on date
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Permission denied';
  end if;
  return query
    select r.event_id, r.remind_on
    from public.event_reminders r
    where r.user_id = auth.uid()
    order by r.remind_on;
end
$$;

revoke all on function public.my_event_reminders() from public;
grant execute on function public.my_event_reminders() to authenticated;

-- 4. reminders_due: порция напоминаний на дату для рассылки (только service role
--    и админы). Возвращает пары (напоминание, пользователь, событие, язык).
create or replace function public.reminders_due(p_on date default current_date)
returns table (
  reminder_id uuid,
  user_id uuid,
  event_id uuid,
  title text,
  title_ru text,
  title_en text,
  start_date date
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'service_role' and not is_admin() then
    raise exception 'Permission denied';
  end if;

  return query
    select r.id, r.user_id, r.event_id,
           e.title, e.title_ru, e.title_en, e.start_date
    from public.event_reminders r
    join public.events e on e.id = r.event_id
    where r.remind_on = p_on
      and r.sent_at is null
      and e.status = 'active'
    order by r.created_at
    limit 500;
end
$$;

revoke all on function public.reminders_due(date) from public;
grant execute on function public.reminders_due(date) to service_role;
