-- ============================================================
-- Запрет создания событий с датой начала в прошлом (2026-08-24)
--
-- Железная гарантия на ВСЕ пути создания события (форма, импорт,
-- прямые insert в api.ts, RPC create_event/import_events — все
-- делают insert в public.events): BEFORE INSERT на таблице.
-- Триггер ТОЛЬКО на INSERT: UPDATE уже существующих прошедших
-- событий (редактирование, архивация) остаётся возможным.
--
-- Проверка по дате: NEW.start_date < CURRENT_DATE (таймзона БД/UTC).
-- Проверка времени для «сегодня» — клиентская (форма).
-- ============================================================

create or replace function public.events_no_past_start()
returns trigger
language plpgsql
as $$
begin
  if new.start_date < current_date then
    raise exception 'start_date cannot be in the past';
  end if;
  return new;
end;
$$;

drop trigger if exists events_no_past_start on public.events;
create trigger events_no_past_start
  before insert on public.events
  for each row execute function public.events_no_past_start();
