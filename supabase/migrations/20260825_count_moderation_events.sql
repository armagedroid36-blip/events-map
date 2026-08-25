-- ============================================================
-- count_moderation_events: число событий на модерации (для админа).
-- Бейдж колокольчика считался прямым select из events — RLS скрывает
-- moderation-записи от обычных запросов, бейдж всегда 0. Считаем через
-- security definer RPC (по образцу list_moderation_events), чтобы
-- увидеть строки и применить фильтр по last_seen.
-- ============================================================

create or replace function public.count_moderation_events(p_last_seen timestamptz default null)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'Permission denied';
  end if;
  return (select count(*) from public.events
          where status = 'moderation'
            and (p_last_seen is null or updated_at > p_last_seen));
end;
$$;

revoke all on function public.count_moderation_events(timestamptz) from public;
grant execute on function public.count_moderation_events(timestamptz) to authenticated;
