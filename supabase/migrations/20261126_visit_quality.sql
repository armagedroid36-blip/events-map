-- ============================================================
-- visits_quality_daily: КАЧЕСТВО трафика — реальные посетители /
-- подозрение на VPN / боты (запрос владельца 26.11.2026: «понять, где
-- заходы через VPN, а где реальные пользователи»).
--
-- Как считается (в Edge Function track_visit, см. functions/track_visit):
--   • страна — по IP посетителя (ipwho.is, бесплатный тариф);
--   • tz      — часовой пояс браузера (Intl.DateTimeFormat().resolvedOptions().timeZone);
--   • lang    — язык браузера (первые 2 символа navigator.language);
--   • asn/provider — автономная система и организация провайдера по IP;
--   • verdict:
--       bot          — user-agent похож на бота/краулер/headless;
--       suspect_vpn  — провайдер из списка хостингов/VPN,
--                      ИЛИ страна часового пояса ≠ страна IP при совпадении
--                      языка (типовой признак VPN: IP в Индонезии, часы и
--                      язык — Россия);
--       user         — остальное (включая русского туриста в Бали с
--                      местным часовым поясом и русским языком).
--
-- Приватность: IP, user-agent, полные URL и идентификаторы не хранятся.
-- В таблице только суточные агрегаты (день, две буквы страны, часовой пояс,
-- две буквы языка, ASN, имя провайдера, вердикт) со счётчиком.
-- RLS включён, политик НЕТ: прямая выборка из клиента пуста.
-- Запись — RPC increment_visit_quality (service role из Edge Function),
-- чтение — только админские RPC с проверкой is_admin().
-- ============================================================

create table if not exists public.visits_quality_daily (
  day date not null,
  country text not null,
  tz text not null,
  lang text not null,
  asn integer not null default 0,
  provider text not null,
  verdict text not null,
  count bigint not null default 0,
  primary key (day, country, tz, lang, asn, provider, verdict),
  constraint visits_quality_verdict_chk check (verdict in ('user', 'suspect_vpn', 'bot'))
);

comment on table public.visits_quality_daily is
  'Суточные агрегаты качества трафика: страна по IP, часовой пояс и язык браузера, ASN/провайдер, вердикт (user/suspect_vpn/bot)';

create index if not exists visits_quality_daily_day_idx
  on public.visits_quality_daily (day);

alter table public.visits_quality_daily enable row level security;
revoke all on table public.visits_quality_daily from anon, authenticated;

-- 1. increment_visit_quality: +1 визит в агрегат.
--    Питфол 42702: параметры p_*, чтобы не было «column reference is ambiguous».
--    Все длины и значения нормализуются здесь же.
create or replace function public.increment_visit_quality(
  p_country text,
  p_tz text,
  p_lang text,
  p_asn integer,
  p_provider text,
  p_verdict text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_country text := coalesce(nullif(upper(left(trim(p_country), 2)), ''), 'UNKNOWN');
  v_tz text := coalesce(nullif(left(trim(p_tz), 64), ''), 'unknown');
  v_lang text := coalesce(nullif(lower(left(trim(p_lang), 5)), ''), 'unknown');
  v_asn integer := coalesce(p_asn, 0);
  v_provider text := coalesce(nullif(lower(left(trim(p_provider), 60)), ''), 'unknown');
  v_verdict text := case
    when p_verdict in ('user', 'suspect_vpn', 'bot') then p_verdict
    else 'user'
  end;
begin
  insert into public.visits_quality_daily(day, country, tz, lang, asn, provider, verdict, count)
  values (current_date, v_country, v_tz, v_lang, v_asn, v_provider, v_verdict, 1)
  on conflict (day, country, tz, lang, asn, provider, verdict)
  do update set count = public.visits_quality_daily.count + 1;
end
$$;

revoke all on function public.increment_visit_quality(text, text, text, integer, text, text) from public;
grant execute on function public.increment_visit_quality(text, text, text, integer, text, text)
  to anon, authenticated, service_role;

-- 2. admin_visits_quality: сводка по вердиктам за период (для карточек)
create or replace function public.admin_visits_quality(p_days integer default 30)
returns table (
  verdict text,
  visits bigint
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
    select q.verdict, sum(q.count)::bigint as visits
    from public.visits_quality_daily q
    where q.day >= current_date - p_days
    group by q.verdict
    order by sum(q.count) desc;
end;
$$;

revoke all on function public.admin_visits_quality(integer) from public;
grant execute on function public.admin_visits_quality(integer) to authenticated;

-- 3. admin_visits_quality_rows: детализация (страна / пояс / язык / провайдер)
create or replace function public.admin_visits_quality_rows(
  p_days integer default 30,
  p_limit integer default 50
)
returns table (
  country text,
  tz text,
  lang text,
  asn integer,
  provider text,
  verdict text,
  visits bigint
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
    select q.country,
           q.tz,
           q.lang,
           q.asn,
           q.provider,
           q.verdict,
           sum(q.count)::bigint as visits
    from public.visits_quality_daily q
    where q.day >= current_date - p_days
    group by q.country, q.tz, q.lang, q.asn, q.provider, q.verdict
    order by sum(q.count) desc
    limit greatest(1, least(coalesce(p_limit, 50), 200));
end;
$$;

revoke all on function public.admin_visits_quality_rows(integer, integer) from public;
grant execute on function public.admin_visits_quality_rows(integer, integer) to authenticated;
