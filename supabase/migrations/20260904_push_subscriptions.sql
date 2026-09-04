-- Push-уведомления: подписки браузеров вошедших пользователей.
-- Таблица, RLS (свои строки), гранты. UPDATE намеренно запрещён —
-- повторное включение той же подписки идёт через INSERT ... ON CONFLICT DO NOTHING.
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

drop policy if exists "push subs own select" on public.push_subscriptions;
create policy "push subs own select"
  on public.push_subscriptions for select
  using (auth.uid() = user_id);

drop policy if exists "push subs own insert" on public.push_subscriptions;
create policy "push subs own insert"
  on public.push_subscriptions for insert
  with check (auth.uid() = user_id);

drop policy if exists "push subs own delete" on public.push_subscriptions;
create policy "push subs own delete"
  on public.push_subscriptions for delete
  using (auth.uid() = user_id);

-- Читать/писать таблицу может только сервисная роль (рассылка) и сам
-- владелец строки. Анонимам и публике — ничего.
revoke all on public.push_subscriptions from anon;
revoke all on public.push_subscriptions from public;
grant select, insert, delete on public.push_subscriptions to authenticated;
