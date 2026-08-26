-- ============================================================
-- RLS для public.categories и public.stats.
-- Закрытие уязвимости «rls_disabled_in_public»: аноним может только
-- ЧИТАТЬ (SELECT), писать — только через security definer RPC
-- (create_category/update_category/delete_category, increment_counter).
-- Политики INSERT/UPDATE/DELETE намеренно не создаются.
-- ============================================================

alter table public.categories enable row level security;
alter table public.stats enable row level security;

drop policy if exists "read categories public" on public.categories;
drop policy if exists "public read categories" on public.categories;
create policy "public read categories" on public.categories
  for select using (true);

drop policy if exists "public read stats" on public.stats;
create policy "public read stats" on public.stats
  for select using (true);
