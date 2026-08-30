-- ============================================================
-- org_gallery: галерея организатора (фото профиля и мероприятий).
-- Пути файлов в storage bucket 'photos' (как аватарка). Чтение публичное
-- (кроме заблокированных), запись — только владелец (RLS + RPC).
-- ============================================================

-- 1. Таблица галереи
create table if not exists public.org_gallery (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.profiles(id) on delete cascade,
  photo_path text not null,
  created_at timestamptz not null default now()
);

comment on table public.org_gallery is
  'Галерея организатора: пути фото в storage bucket photos. Чтение публичное (кроме заблокированных), запись — только владелец';

create index if not exists org_gallery_org_id_idx on public.org_gallery(org_id);

alter table public.org_gallery enable row level security;

-- Политики. ВАЖНО: НЕЛЬЗЯ писать exists-подзапрос к profiles напрямую —
-- RLS на profiles закрыт для гостей (только own read/admin read), подзапрос
-- вернул бы пусто и галерея была бы не видна анонимам. Используем
-- security definer хелпер is_banned(uid) (уже есть в БД, SELECT-only, можно из RLS).
drop policy if exists "org_gallery public read" on public.org_gallery;
create policy "org_gallery public read"
  on public.org_gallery for select
  to anon, authenticated
  using (not is_banned(org_id));

drop policy if exists "org_gallery own insert" on public.org_gallery;
create policy "org_gallery own insert"
  on public.org_gallery for insert
  to authenticated
  with check (auth.uid() = org_id);

drop policy if exists "org_gallery own update" on public.org_gallery;
create policy "org_gallery own update"
  on public.org_gallery for update
  to authenticated
  using (auth.uid() = org_id);

drop policy if exists "org_gallery own delete" on public.org_gallery;
create policy "org_gallery own delete"
  on public.org_gallery for delete
  to authenticated
  using (auth.uid() = org_id);

-- 2. get_org_gallery: публичное чтение галереи (security definer — RLS
--    profiles не мешает; заблокированные скрыты). Без is_admin — как get_org_profile.
create or replace function public.get_org_gallery(p_org_id uuid)
returns table (
  id uuid,
  photo_path text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
    select g.id, g.photo_path, g.created_at
    from public.org_gallery g
    where g.org_id = p_org_id
      and exists (select 1 from public.profiles p where p.id = p_org_id and p.blocked_at is null)
    order by g.created_at asc;
end;
$$;

revoke all on function public.get_org_gallery(uuid) from public;
grant execute on function public.get_org_gallery(uuid) to anon, authenticated;

-- 3. add_gallery_photo: только организатор (не заблокированный), лимит 15.
create or replace function public.add_gallery_photo(p_path text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_role text;
        v_blocked timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Permission denied';
  end if;
  select role, blocked_at into v_role, v_blocked
  from public.profiles where id = auth.uid();
  if v_role is distinct from 'org' or v_blocked is not null then
    raise exception 'Permission denied';
  end if;
  if (select count(*) from public.org_gallery where org_id = auth.uid()) >= 15 then
    raise exception 'Gallery limit';
  end if;
  insert into public.org_gallery(org_id, photo_path) values (auth.uid(), p_path);
end;
$$;

revoke all on function public.add_gallery_photo(text) from public;
grant execute on function public.add_gallery_photo(text) to authenticated;

-- 4. Удаление фото — через Edge Function gallery_delete (verify JWT + service role):
--    storage API НЕ позволяет прямое DELETE из storage.objects (42501 «Use the
--    Storage API instead»), поэтому SQL-функция удаления НЕ создаётся.
--    Edge Function: проверяет владельца по JWT, удаляет объект через
--    DELETE /storage/v1/object/photos/<path> и запись из org_gallery.
drop function if exists public.delete_gallery_photo(uuid);
