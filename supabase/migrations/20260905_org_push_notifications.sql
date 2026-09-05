-- Мгновенные браузерные push-уведомления о новых событиях организатора
-- (#/org/<id>). Отдельный механизм от push_subscriptions (диджест раз в сутки,
-- v23.09-99): org_push_subscriptions привязана к ПРОФИЛЮ ОРГАНИЗАТОРА и шлёт
-- пуш МГНОВЕННО при публикации события (approve_event / прямой INSERT active).
-- Паттерн как у org_subscriptions: RLS включён БЕЗ политик, клиенты ходят
-- только через security definer RPC; читает/пишет таблицы Edge Function
-- (service role) и definer-функции.
-- Доставка: триггер events -> pg_net (net.http_post) -> Edge Function
-- notify-push (web push). pg_net — тот же движок, что у Database Webhooks
-- Supabase; Management API webhooks не имеет, поэтому триггер в миграции.

-- 1. Подписки браузеров на организатора
create table if not exists public.org_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null,           -- PushSubscription.endpoint (браузер+origin)
  p256dh text not null,
  auth text not null,
  lang text not null default 'ru',  -- язык подписчика для текста пуша
  site_origin text not null default 'https://mypins.site',  -- для клика по пушу
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, endpoint)         -- один браузер может подписаться на N оргов
);
alter table public.org_push_subscriptions enable row level security;

-- 2. Дедуп доставок: повторный webhook/ретрай не шлёт пуш дважды
create table if not exists public.push_deliveries (
  endpoint text not null,
  event_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (endpoint, event_id)
);
alter table public.push_deliveries enable row level security;

revoke all on public.org_push_subscriptions from anon;
revoke all on public.org_push_subscriptions from public;
revoke all on public.push_deliveries from anon;
revoke all on public.push_deliveries from public;

-- 3. RPC подписки/отписки/проверки (проверка организатора как в subscribe_org)
create or replace function public.subscribe_push(
  p_org_id uuid, p_sub jsonb, p_lang text default 'ru', p_site_origin text default null
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ok boolean;
  v_new boolean;
  v_endpoint text;
  v_p256dh text;
  v_auth text;
  v_lang text;
  v_origin text;
begin
  -- Валидация тела подписки (endpoint/p256dh/auth — непустые строки)
  if p_sub is null or jsonb_typeof(p_sub) <> 'object' then
    raise exception 'Invalid subscription';
  end if;
  v_endpoint := p_sub->>'endpoint';
  v_p256dh := p_sub->'keys'->>'p256dh';
  v_auth := p_sub->'keys'->>'auth';
  if v_endpoint is null or v_endpoint = '' or v_endpoint !~ '^https://' then
    raise exception 'Invalid endpoint';
  end if;
  if v_p256dh is null or v_p256dh = '' or v_auth is null or v_auth = '' then
    raise exception 'Invalid keys';
  end if;
  -- Организатор существует, не заблокирован (как subscribe_org)
  select exists(
    select 1 from public.profiles
    where id = p_org_id and role = 'org' and blocked_at is null
  ) into v_ok;
  if not v_ok then
    return 'Organizer not found';
  end if;
  v_lang := case when p_lang = 'en' then 'en' else 'ru' end;
  v_origin := coalesce(nullif(p_site_origin, ''), 'https://mypins.site');
  insert into public.org_push_subscriptions (org_id, endpoint, p256dh, auth, lang, site_origin)
  values (p_org_id, v_endpoint, v_p256dh, v_auth, v_lang, v_origin)
  on conflict (org_id, endpoint) do update set
    p256dh = excluded.p256dh,
    auth = excluded.auth,
    lang = excluded.lang,
    site_origin = excluded.site_origin,
    updated_at = now()
  returning (xmax = 0) into v_new;
  return case when v_new then 'subscribed' else 'already' end;
end;
$$;

create or replace function public.unsubscribe_push(p_org_id uuid, p_endpoint text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.org_push_subscriptions
  where org_id = p_org_id and endpoint = p_endpoint;
end;
$$;

create or replace function public.is_push_subscribed(p_org_id uuid, p_endpoint text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ok boolean;
begin
  select exists(
    select 1 from public.org_push_subscriptions
    where org_id = p_org_id and endpoint = p_endpoint
  ) into v_ok;
  return v_ok;
end;
$$;

revoke all on function public.subscribe_push(uuid, jsonb, text, text) from public;
revoke all on function public.unsubscribe_push(uuid, text) from public;
revoke all on function public.is_push_subscribed(uuid, text) from public;
grant execute on function public.subscribe_push(uuid, jsonb, text, text) to anon, authenticated;
grant execute on function public.unsubscribe_push(uuid, text) to anon, authenticated;
grant execute on function public.is_push_subscribed(uuid, text) to anon, authenticated;

-- 4. Секрет webhook-вызова функции (хранится в app_settings — таблица RLS
-- без политик, читает только service role / definer-функции)
insert into public.app_settings (key, value)
values ('push_webhook_secret', 'd8fcab983aafa60f00816dc792990dab322f697209bd0183')
on conflict (key) do update set value = excluded.value;

-- 5. Триггер: событие стало active -> асинхронный POST в notify-push
-- (INSERT сразу active — редкая страховка; UPDATE -> active — approve_event).
create or replace function public.notify_event_published()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_secret text;
  v_type text;
begin
  if TG_OP = 'INSERT' and NEW.status <> 'active' then
    return null;
  end if;
  if TG_OP = 'UPDATE' and not (NEW.status = 'active' and OLD.status is distinct from 'active') then
    return null;
  end if;
  v_type := TG_OP;
  select value into v_secret from public.app_settings where key = 'push_webhook_secret';
  if v_secret is null or v_secret = '' then
    return null;
  end if;
  perform net.http_post(
    url := 'https://xsbtejugutlpkgykiouw.supabase.co/functions/v1/notify-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', v_secret
    ),
    body := jsonb_build_object(
      'type', v_type,
      'table', 'events',
      'schema', 'public',
      'record', to_jsonb(NEW),
      'old_record', case when TG_OP = 'UPDATE' then to_jsonb(OLD) else null end
    ),
    timeout_milliseconds := 10000  -- холодный старт Edge Function дольше 5 c
  );
  return null;
end;
$$;

drop trigger if exists events_notify_published on public.events;
create trigger events_notify_published
after insert or update of status on public.events
for each row execute function public.notify_event_published();
