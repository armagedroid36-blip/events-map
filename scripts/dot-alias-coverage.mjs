// Проверка: КАЖДЫЙ прежний адрес события (снимок slugs-before.json) должен быть
// либо текущим адресом, либо страницей-алиасом (scripts/data/legacy-slug-urls.txt
// + gsc-404-urls.txt). Иначе после деплоя прежний URL отдаст 404.
// Запуск: source .env && node --import ./scripts/dot-proxy-import.mjs scripts/dot-alias-coverage.mjs <slugs-before.json>
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { selectAll } from './db-rows.mjs';
import { installCurlFetch } from './dot-curl-fetch.mjs';
import { eventHasEn, eventSlug } from '../src/lib/slug.ts';

installCurlFetch();
const db = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE,
  { auth: { persistSession: false } },
);

const before = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const list = (p) =>
  readFileSync(p, 'utf8')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.replace(/^https:\/\/mypins\.site/, ''));
const SITE = 'https://mypins.site';
const aliases = new Set([...list('scripts/data/legacy-slug-urls.txt'), ...list('scripts/data/gsc-404-urls.txt')]);

const rows = await selectAll(db, 'events', 'id, title, title_ru, title_en, source_lang, status');
const byId = new Map(rows.map((r) => [r.id, r]));

let changed = 0;
let missing = 0;
const missingList = [];
for (const b of before) {
  const ev = byId.get(b.id);
  if (!ev) continue; // нет в базе — не наша забота
  const tails = [];
  tails.push({ old: `/event/${b.id}/${b.ruTail}/`, now: `/event/${ev.id}/${eventSlug(ev, 'ru')}/` });
  if (b.enTail) tails.push({ old: `/en/event/${b.id}/${b.enTail}/`, now: `/en/event/${ev.id}/${eventSlug(ev, 'en')}/` });
  for (const t of tails) {
    if (t.old === t.now) continue;
    changed += 1;
    if (!aliases.has(t.old)) {
      missing += 1;
      missingList.push(t.old);
    }
  }
}
console.log(`Прежних адресов изменилось: ${changed}`);
console.log(`Из них БЕЗ страницы-алиаса: ${missing}`);
for (const m of missingList.slice(0, 40)) console.log(`   ! ${m}`);
console.log(`Алиасов в списках: ${aliases.size}`);
void eventHasEn;
void SITE;
