-- История кандидатов недельного разведчика театральных площадок.
-- Пишет/читает только service role (GitHub Actions): RLS включён, политик нет.
-- status: 'proposed' — предложен разведчиком и ждёт решения человека,
--         'approved' — URL уже в реестре источников (scripts/theatre-sources.mjs),
--         'rejected' — человек отклонил (повторно не предлагается).
create table if not exists public.theatre_source_candidates (
  url        text primary key,
  name       text,
  city       text,
  kind       text,
  status     text not null default 'proposed',
  first_seen timestamptz not null default now(),
  last_seen  timestamptz not null default now(),
  note       text
);

alter table public.theatre_source_candidates enable row level security;

-- Политик нет: доступ только у service role (он RLS обходит).
revoke all on public.theatre_source_candidates from anon, authenticated;

create index if not exists theatre_source_candidates_status_idx
  on public.theatre_source_candidates (status, last_seen desc);
