-- Rate limit для публичной Edge Function translate (защита DeepSeek-бюджета).
-- In-memory счётчик в функции не работает: Supabase распределяет запросы по
-- нескольким изолятам/инстансам (память не общая) — счётчик в Postgres.
-- Паттерн как у org_push_subscriptions: RLS включён БЕЗ политик, функция
-- ходит только через security definer RPC (service role).
create table if not exists public.translate_rate (
  ip text primary key,              -- клиентский IP (первый из x-forwarded-for)
  window_start timestamptz not null default now(),
  hits int not null default 1
);
alter table public.translate_rate enable row level security;

revoke all on public.translate_rate from anon;
revoke all on public.translate_rate from public;

-- Скользящее окно 60 секунд: инкрементит счётчик IP, возвращает true, если
-- запрос в пределах лимита (hits <= p_max). Старые строки подчищаются.
create or replace function public.translate_rate_check(p_ip text, p_max int default 10)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hits int;
begin
  insert into public.translate_rate (ip, window_start, hits)
  values (p_ip, now(), 1)
  on conflict (ip) do update set
    window_start = case
      when public.translate_rate.window_start < now() - interval '60 seconds' then now()
      else public.translate_rate.window_start
    end,
    hits = case
      when public.translate_rate.window_start < now() - interval '60 seconds' then 1
      else public.translate_rate.hits + 1
    end
  returning hits into v_hits;

  -- Уборка: строки, не посещавшиеся больше суток
  delete from public.translate_rate where window_start < now() - interval '1 day';

  return v_hits <= p_max;
end;
$$;

revoke all on function public.translate_rate_check(text, int) from public;
grant execute on function public.translate_rate_check(text, int) to service_role;
