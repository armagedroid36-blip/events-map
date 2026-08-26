-- ============================================================
-- Блокировка пользователей и организаторов (2026-08-26).
-- Заблокированный: не входит (signIn/getCurrentUser на фронте),
-- не может действовать по живому токену (RLS-политики + проверки),
-- его опубликованные события скрыты с публичной части.
-- Разблокировка возвращает всё автоматически.
-- ============================================================

-- 1. Колонка блокировки в profiles (null = не заблокирован)
alter table public.profiles add column if not exists blocked_at timestamptz;

-- 2. Хелпер проверки блокировки (security definer — читает profiles
--    независимо от RLS вызывающего)
create or replace function public.is_banned(uid uuid) returns boolean
language sql
security definer
set search_path = public
as $$
  select exists(
    select 1 from public.profiles
    where id = uid and blocked_at is not null
  );
$$;

-- 3. RPC блокировки (паттерн admin_users_stats: security definer + is_admin)
create or replace function public.admin_block_user(target uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'Permission denied';
  end if;
  if target = auth.uid() then
    raise exception 'Cannot block yourself';
  end if;
  if exists (select 1 from public.profiles where id = target and role = 'admin') then
    raise exception 'Cannot block admin';
  end if;
  update public.profiles set blocked_at = now() where id = target;
  if not found then
    raise exception 'User not found';
  end if;
end;
$$;

revoke all on function public.admin_block_user(uuid) from public;
revoke all on function public.admin_block_user(uuid) from anon;
grant execute on function public.admin_block_user(uuid) to authenticated;

-- 4. RPC разблокировки (те же проверки для симметрии)
create or replace function public.admin_unblock_user(target uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'Permission denied';
  end if;
  if target = auth.uid() then
    raise exception 'Cannot unblock yourself';
  end if;
  if exists (select 1 from public.profiles where id = target and role = 'admin') then
    raise exception 'Cannot unblock admin';
  end if;
  update public.profiles set blocked_at = null where id = target;
  if not found then
    raise exception 'User not found';
  end if;
end;
$$;

revoke all on function public.admin_unblock_user(uuid) from public;
revoke all on function public.admin_unblock_user(uuid) from anon;
grant execute on function public.admin_unblock_user(uuid) to authenticated;

-- 5. admin_users_stats: добавить blocked_at — фронту нужен статус блокировки
-- (тип возврата меняется — обязателен DROP перед create or replace)
drop function if exists public.admin_users_stats();

create or replace function public.admin_users_stats()
returns table (
  user_id uuid,
  email text,
  role text,
  blocked_at timestamptz,
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
      p.blocked_at as blocked_at,
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
revoke all on function public.admin_users_stats() from anon;
grant execute on function public.admin_users_stats() to authenticated;

-- 6. Публичный список активных событий: скрываем события заблокированных
--    организаторов. Security definer — работает и для анонимов.
create or replace function public.list_active_events()
returns setof events
language sql
security definer
set search_path = public
as $$
  select * from public.events e
  where e.status = 'active'
    and not exists (
      select 1 from public.profiles p
      where p.id = e.owner_id and p.blocked_at is not null
    )
  order by e.start_date asc;
$$;

revoke all on function public.list_active_events() from public;
grant execute on function public.list_active_events() to anon, authenticated, service_role;

-- 7. Запрет действий по живому токену: RLS-политики на прямые записи
--    (создание/редактирование/удаление событий, контакты профиля, заявки).
--    Чтение профиля/своих событий заблокированному НЕ закрываем — фронту
--    нужно видеть blocked_at (signIn/getCurrentUser).
alter policy "read active events public" on public.events
  using (
    status = 'active'
    and not exists (
      select 1 from public.profiles p
      where p.id = owner_id and p.blocked_at is not null
    )
  );

alter policy "insert events org" on public.events
  with check (not public.is_banned(auth.uid()));

alter policy "update own events org" on public.events
  using (owner_id = auth.uid() and not public.is_banned(auth.uid()))
  with check (owner_id = auth.uid() and not public.is_banned(auth.uid()));

alter policy "delete own events org" on public.events
  using (owner_id = auth.uid() and not public.is_banned(auth.uid()));

-- profiles: SELECT остаётся открытым для владельца (нужен для blocked_at),
-- UPDATE (контакты) — запрещён заблокированному.
drop policy if exists "profiles own" on public.profiles;

create policy "profiles own read" on public.profiles
  for select using (auth.uid() = id);

create policy "profiles own write" on public.profiles
  for update using (auth.uid() = id)
  with check (auth.uid() = id and not public.is_banned(auth.uid()));

-- Заявки: заблокированный не отправляет
alter policy "submit applications public" on public.applications
  with check (not public.is_banned(auth.uid()));
