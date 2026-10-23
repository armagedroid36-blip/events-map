-- Data API: явные гранты для схемы public.
--
-- Причина: с 30.10.2026 Supabase перестаёт автоматически выдавать Data API-права
-- новым таблицам в public. Без грантов supabase-js / PostgREST / GraphQL отвечают
-- 42501 "permission denied" (в тексте ошибки предлагается нужный GRANT).
-- Существующие таблицы сохраняют права, но `supabase db reset`, preview-ветки и
-- новые проекты накатывают схему с нуля — там грантов не будет.
--
-- Что делает миграция:
--   1) восстанавливает права на все существующие таблицы public в прежнем объёме;
--   2) задаёт default privileges — права автоматически получают все будущие
--      таблицы и последовательности, созданные ролью postgres.
--
-- Служебные таблицы, которые не должны быть видны анонимам, перечислены явно
-- (см. блок REVOKE ниже). Правило на будущее: если новая таблица служебная —
-- в той же миграции, где она создаётся, добавь:
--     revoke all on public.<table> from anon, authenticated;
-- RLS остаётся главной границей доступа: грант открывает таблицу, политики — строки.

begin;

grant usage on schema public to anon, authenticated, service_role;

-- 1. Существующие таблицы ---------------------------------------------------

-- Чтение для анонимов (публичные данные), кроме служебных таблиц.
grant select on all tables in schema public to anon;

revoke all on public.push_subscriptions       from anon;
revoke all on public.org_push_subscriptions   from anon;
revoke all on public.push_deliveries          from anon;
revoke all on public.translate_rate           from anon;
revoke all on public.theatre_source_candidates from anon;

-- Вошедшие пользователи: запись/правка под RLS.
grant select, insert, update, delete on all tables in schema public to authenticated;

-- Исключения: служебные таблицы только для service role.
revoke all on public.push_deliveries           from authenticated;
revoke all on public.org_push_subscriptions    from authenticated;
revoke all on public.translate_rate            from authenticated;
revoke all on public.theatre_source_candidates from authenticated;

-- push_subscriptions: update намеренно запрещён (см. 20260904_push_subscriptions).
revoke update on public.push_subscriptions     from authenticated;

grant all privileges on all tables in schema public to service_role;

-- Последовательности: нужны для insert с serial/identity.
grant usage, select on all sequences in schema public to anon, authenticated, service_role;

-- 2. Будущие объекты --------------------------------------------------------
-- Гранты для всего, что migrations создадут после этой миграции.
-- Сначала снимаем унаследованные default privileges (Supabase исторически
-- выдавал anon/authenticated полный набор на новые таблицы), иначе GRANT ниже
-- только добавляет права, а anon сохраняет INSERT/UPDATE/DELETE на будущие таблицы.

alter default privileges for role postgres in schema public
  revoke all on tables from anon;
alter default privileges for role postgres in schema public
  revoke all on tables from authenticated;

alter default privileges for role postgres in schema public
  grant select on tables to anon;
alter default privileges for role postgres in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges for role postgres in schema public
  grant all on tables to service_role;
alter default privileges for role postgres in schema public
  grant usage, select on sequences to anon, authenticated, service_role;

commit;
