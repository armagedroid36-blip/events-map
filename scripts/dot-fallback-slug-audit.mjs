// Счёт класса «в названии нет латиницы вообще» → адрес event-<id8> (заголовок из
// других алфавитов: греческий без перевода, «математические» буквы из Telegram).
// Запуск: source .env && node --import ./scripts/dot-proxy-import.mjs scripts/dot-fallback-slug-audit.mjs
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
import { installCurlFetch } from './dot-curl-fetch.mjs';
import { eventHasEn, eventSlug, slugHasLatin } from '../src/lib/slug.ts';

installCurlFetch();
const db = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE,
  { auth: { persistSession: false } },
);
const rows = await selectAll(db, 'events', 'id, title, title_ru, title_en, source_lang, status, start_date');
const GREEK = /[\u0370-\u03FF\u1F00-\u1FFF]/;
const CYR = /[\u0400-\u04FF]/;

const fallback = (lang) => (ev) => !slugHasLatin(lang === 'en' ? ev.title_en || ev.title : ev.title_ru || ev.title);
const ruFallback = rows.filter(fallback('ru'));
const enFallback = rows.filter((e) => eventHasEn(e) && fallback('en')(e));

const byStatus = (list) => list.reduce((m, e) => ((m[e.status] = (m[e.status] || 0) + 1), m), {});
console.log(`Событий всего: ${rows.length}`);
console.log(`RU-адрес = фолбэк event-<id8>: ${ruFallback.length} ${JSON.stringify(byStatus(ruFallback))}`);
console.log(`EN-адрес = фолбэк event-<id8>: ${enFallback.length} ${JSON.stringify(byStatus(enFallback))}`);
const shown = new Set();
for (const e of [...ruFallback, ...enFallback]) {
  if (shown.has(e.id)) continue;
  shown.add(e.id);
  const kind = GREEK.test(String(e.title)) ? 'греч' : CYR.test(String(e.title)) ? 'кир' : 'другое';
  console.log(`  [${e.status}] ${kind} sl=${e.source_lang} ${e.start_date} ${e.id.slice(0, 8)} RU=${eventSlug(e, 'ru')} EN=${eventHasEn(e) ? eventSlug(e, 'en') : '-'} | ${String(e.title).slice(0, 45)}`);
}
