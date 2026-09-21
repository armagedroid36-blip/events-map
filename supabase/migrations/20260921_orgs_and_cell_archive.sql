-- ============================================================
-- Восстановленные посадочные «город × категория» и страницы
-- организаторов (2026-09-21, промпт Лёхи «404 → 200»).
--
-- Зачем две функции:
--
-- 1) list_public_orgs() — список ПУБЛИЧНЫХ профилей организаторов для
--    пре-рендера. Раньше кандидаты вычислялись только по owner_id активных
--    событий, поэтому организация с заполненным профилем, но БЕЗ событий
--    вообще не получала страницу /org/<id>/ (в GSC такой URL висел как 404).
--    profiles закрыт RLS для анонима (миграция 20260826_block_users.sql:
--    политика «profiles own read» = auth.uid() = id), пре-рендер работает
--    анонимным ключом, поэтому нужна security definer функция.
--    КОНТАКТЫ (телефон/почта/telegram/instagram) НЕ отдаются: в статический
--    HTML они не попадают никогда (политика проекта, см. seo-prerender.mjs).
--    Отдаётся только флаг contacts_public.
--
-- 2) list_past_cell_events(p_city_path, p_category, p_limit) — прошедшие
--    события ОДНОЙ ячейки «город × категория» для SPA: на восстановленной
--    посадочной (активных событий меньше порога MIN_CATEGORY_EVENTS) блок
--    «Прошедшие события этой категории в <городе>» тянет данные отсюда.
--    Весь архив (list_past_events, ~1600 строк с описаниями и фото) на
--    страницу грузить нельзя — фильтр и лимит делает БД.
--    Соответствие «путь города → текст e.city» зеркалит cityCrumb из
--    scripts/seo-prerender.mjs и src/lib/address.ts: три пути, ключевые
--    слова те же (Бали + районы, Дананг, Нячанг). При расширении списка
--    городов функцию обновить вместе с cityCrumb.
-- ============================================================

create or replace function public.list_public_orgs()
returns table (
  id uuid,
  display_name text,
  bio text,
  avatar_url text,
  contacts_public boolean
)
language sql
security definer
set search_path = public
as $function$
  select
    p.id,
    p.display_name,
    p.bio,
    p.avatar_url,
    p.contacts_public
  from public.profiles p
  where p.role = 'org'
    and p.blocked_at is null
    and coalesce(btrim(p.display_name), '') <> ''
  order by p.display_name;
$function$;

revoke all on function public.list_public_orgs() from public;
grant execute on function public.list_public_orgs() to anon, authenticated;
