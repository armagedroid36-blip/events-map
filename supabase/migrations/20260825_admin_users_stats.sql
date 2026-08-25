-- ============================================================
-- admin_users_stats: статистика по всем пользователям/организаторам
-- для админа (вкладка «Пользователи»): email, роль, дата регистрации,
-- контакты, счётчики событий по статусам и разбивка по категориям.
-- По паттерну list_moderation_events: security definer + is_admin().
-- События без owner_id (админка/импорт) в статистику не попадают.
-- ============================================================

create or replace function public.admin_users_stats()
returns table (
  user_id uuid,
  email text,
  role text,
  created_at timestamptz,
  contact_telegram text,
  contact_whatsapp text,
  contact_email text,
  contact_phone text,
  instagram text,
  events_total bigint,
  events_active bigint,
  events_moderation bigint,
  events_rejected bigint,
  events_archived bigint,
  events_needs_changes bigint,
  categories jsonb
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'Permission denied';
  end if;
  return query
    select
      p.id as user_id,
      u.email::text as email,
      p.role::text as role,
      p.created_at as created_at,
      p.contact_telegram,
      p.contact_whatsapp,
      p.contact_email,
      p.contact_phone,
      p.instagram,
      coalesce(es.events_total, 0) as events_total,
      coalesce(es.events_active, 0) as events_active,
      coalesce(es.events_moderation, 0) as events_moderation,
      coalesce(es.events_rejected, 0) as events_rejected,
      coalesce(es.events_archived, 0) as events_archived,
      coalesce(es.events_needs_changes, 0) as events_needs_changes,
      coalesce(cats.categories, '[]'::jsonb) as categories
    from public.profiles p
    left join auth.users u on u.id = p.id
    left join lateral (
      select
        count(*)::bigint as events_total,
        count(*) filter (where e.status = 'active')::bigint as events_active,
        count(*) filter (where e.status = 'moderation')::bigint as events_moderation,
        count(*) filter (where e.status = 'rejected')::bigint as events_rejected,
        count(*) filter (where e.status = 'archived')::bigint as events_archived,
        count(*) filter (where e.status = 'needs_changes')::bigint as events_needs_changes
      from public.events e
      where e.owner_id = p.id
    ) es on true
    left join lateral (
      select jsonb_agg(
        jsonb_build_object(
          'category_id', c.id,
          'name_ru', c.name_ru,
          'name_en', c.name_en,
          'count', ec.cnt
        ) order by ec.cnt desc
      ) as categories
      from (
        select e.category_id, count(*)::int as cnt
        from public.events e
        where e.owner_id = p.id and e.category_id is not null
        group by e.category_id
      ) ec
      join public.categories c on c.id = ec.category_id
    ) cats on true
    order by es.events_total desc nulls last, u.email asc nulls last;
end;
$$;

revoke all on function public.admin_users_stats() from public;
grant execute on function public.admin_users_stats() to authenticated;
