-- Организатор может удалить своё событие (hard delete).
-- delete_event раньше существовал только в базе (ручная SQL-версия без проверок),
-- в миграциях отсутствовал — фиксируем здесь.
-- Разрешения: админ (is_admin) или владелец события (owner_id = auth.uid()).
-- Заблокированный организатор удалять не может.
-- Права: только authenticated (anon — нет).

create or replace function public.delete_event(ev_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  -- Заблокированный не удаляет
  if exists(select 1 from public.profiles where id = auth.uid() and blocked_at is not null) then
    raise exception 'Account blocked';
  end if;
  -- Только админ или владелец события
  if not (is_admin() or (select owner_id from public.events where id = ev_id) = auth.uid()) then
    raise exception 'Permission denied';
  end if;
  delete from public.events where id = ev_id;
end $$;

revoke all on function public.delete_event(uuid) from public;
revoke all on function public.delete_event(uuid) from anon;
grant execute on function public.delete_event(uuid) to authenticated;
