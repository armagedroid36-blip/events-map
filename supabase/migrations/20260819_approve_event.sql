-- ============================================================
-- approve_event: одобрение события только администратором.
-- По аналогии с reject_event (security definer + is_admin).
--
-- ПРИМЕНЕНИЕ: применить в Supabase SQL Editor или через `supabase db push`.
-- Перед применением сверить с реальной схемой:
--   - таблицу ролей (profiles.id / profiles.role) — если роли лежат
--     в другой таблице, поправить проверку ниже;
--   - убедиться, что на таблице events НЕТ политики UPDATE,
--     разрешающей не-админам менять статус (иначе клиент сможет
--     обойти RPC прямым update). Если такая политика есть — удалить.
-- ============================================================

create or replace function public.approve_event(ev_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Разрешено только администратору
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  ) then
    raise exception 'Permission denied';
  end if;

  update public.events
  set status = 'active'
  where id = ev_id;
end;
$$;

-- Права: вызывать могут только авторизованные пользователи,
-- проверка роли выполняется внутри функции
revoke all on function public.approve_event(uuid) from public;
grant execute on function public.approve_event(uuid) to authenticated;
