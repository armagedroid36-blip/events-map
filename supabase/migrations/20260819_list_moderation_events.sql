-- ============================================================
-- list_moderation_events: только события на модерации (для админа).
-- По аналогии с list_all_events, но с фильтром на стороне базы,
-- чтобы не тянуть все события (все статусы) в админку.
-- ============================================================

create or replace function public.list_moderation_events()
returns setof events
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'Permission denied';
  end if;
  return query
    select * from public.events
    where status = 'moderation'
    order by created_at desc;
end;
$$;

revoke all on function public.list_moderation_events() from public;
grant execute on function public.list_moderation_events() to authenticated;
