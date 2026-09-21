-- ============================================================
-- Автопроверка собранных событий перед публикацией (автомодерация).
-- События сборщиков (source_type: collector, theatre) проверяются
-- правилами + LLM и публикуются без ручного одобрения.
-- Результат проверки по каждой карточке хранится в events.auto_review.
-- Ручная модерация организаторских заявок (source_type='organizer')
-- не меняется.
-- ============================================================

alter table public.events
  add column if not exists auto_review jsonb;

alter table public.events
  add column if not exists auto_reviewed_at timestamptz;

comment on column public.events.auto_review is
  'Автопроверка карточки: {verdict: publish|review|reject, flags: [], reason, engine, at}';

comment on column public.events.auto_reviewed_at is
  'Когда карточку в последний раз проверяла автопроверка';

create index if not exists events_auto_reviewed_at_idx
  on public.events (auto_reviewed_at desc);

-- Настройка: включена ли автоматическая публикация проверенных событий.
insert into public.app_settings (key, value) values ('auto_publish', 'on')
on conflict (key) do nothing;

-- Чтение настройки автопубликации: админ (UI) и service_role (скрипт сборщика).
create or replace function public.get_auto_publish()
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (is_admin() or auth.role() = 'service_role') then
    raise exception 'Permission denied';
  end if;
  return coalesce((select value from public.app_settings where key = 'auto_publish'), 'on');
end;
$$;

revoke all on function public.get_auto_publish() from public, anon;
grant execute on function public.get_auto_publish() to authenticated, service_role;

-- Переключение автопубликации (только админ): 'on' | 'off'
create or replace function public.set_auto_publish(p_value text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'Permission denied';
  end if;
  if p_value not in ('on', 'off') then
    raise exception 'Invalid value: on|off expected';
  end if;
  insert into public.app_settings (key, value) values ('auto_publish', p_value)
  on conflict (key) do update set value = excluded.value;
end;
$$;

revoke all on function public.set_auto_publish(text) from public, anon;
grant execute on function public.set_auto_publish(text) to authenticated;

-- Статистика автопроверки за N дней: сколько опубликовано / отправлено на
-- проверку / отклонено. Читает админка.
create or replace function public.admin_auto_moderation_stats(p_days int default 7)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if not is_admin() then
    raise exception 'Permission denied';
  end if;
  select coalesce(jsonb_object_agg(v, c), '{}'::jsonb)
  into result
  from (
    select coalesce(auto_review->>'verdict', 'unknown') as v, count(*)::int as c
    from public.events
    where auto_reviewed_at > now() - make_interval(days => greatest(1, least(p_days, 90)))
    group by 1
  ) t;
  return result;
end;
$$;

revoke all on function public.admin_auto_moderation_stats(int) from public, anon;
grant execute on function public.admin_auto_moderation_stats(int) to authenticated;
