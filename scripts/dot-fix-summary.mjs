// Итог по правке: новые адреса затронутых карточек + наличие алиасов на прежние.
// Запуск: source .env && node --import ./scripts/dot-proxy-import.mjs scripts/dot-fix-summary.mjs <slugs-before.json>
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
const rows = await selectAll(
  db,
  'events',
  'id, title, title_ru, title_en, description, description_ru, description_en, source_lang, language, status, start_date, city',
);
const byId = new Map(rows.map((r) => [r.id, r]));
const GREEK = /[\u0370-\u03FF\u1F00-\u1FFF]/;
const IDS = [
  '35a39f42-9b93-43bb-b421-227aa02eaec5',
  'b43e579e-f217-45f2-88bd-cd580cfef0d7',
  'fd448831-7618-4584-add2-58068b4547df',
];

console.log('=== 3 события из ТЗ (после правки) ===');
for (const id of IDS) {
  const ev = byId.get(id);
  const b = before.find((x) => x.id === id);
  console.log(`\n${id} [${ev.status}] ${ev.start_date} ${ev.title.slice(0, 55)}`);
  console.log(`  source_lang ${b.source_lang} → ${ev.source_lang} | language ${ev.language}`);
  console.log(`  title_ru: ${ev.title_ru}`);
  console.log(`  title_en: ${ev.title_en}`);
  console.log(`  desc_ru : ${String(ev.description_ru).slice(0, 90).replace(/\n/g, ' ')}`);
  console.log(`  desc_en : ${String(ev.description_en).slice(0, 90).replace(/\n/g, ' ')}`);
  console.log(`  RU было ${b.ru}; стало /event/${id}/${eventSlug(ev, 'ru')}/`);
  if (eventHasEn(ev)) console.log(`  EN было ${b.en}; стало /en/event/${id}/${eventSlug(ev, 'en')}/`);
}

console.log('\n=== Все бывшие греческие карточки: остался ли греческий в переводах ===');
let d = 0;
for (const ev of rows) {
  if ([ev.title_ru, ev.title_en, ev.description_ru, ev.description_en].some((v) => GREEK.test(String(v || '')))) {
    d += 1;
    console.log(`  ! [${ev.status}] sl=${ev.source_lang} ${ev.id.slice(0, 8)} ${String(ev.title).slice(0, 45)}`);
  }
}
console.log(`  строк с греческим в полях перевода: ${d}`);
console.log(`  греческий ЗАГОЛОВОК с source_lang != el: ${rows.filter((e) => GREEK.test(String(e.title)) && e.source_lang !== 'el').length}`);
