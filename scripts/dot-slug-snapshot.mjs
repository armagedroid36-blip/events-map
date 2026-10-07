// Снимок адресов событий ДО правки данных: пара RU/EN URL по текущим значениям
// полей (eventSlug). Нужен, чтобы после правки (перевод архивных греческих
// карточек меняет слаг) проверить КАЖДЫЙ прежний адрес как страницу-алиас.
// Запуск: source .env && node scripts/dot-slug-snapshot.mjs <путь-json>
import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'node:fs';
import { selectAll } from './db-rows.mjs';
import { installCurlFetch } from './dot-curl-fetch.mjs';
import { eventHasEn, eventSlug } from '../src/lib/slug.ts';

installCurlFetch();
const db = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE,
  { auth: { persistSession: false } },
);

const rows = await selectAll(
  db,
  'events',
  'id, title, title_ru, title_en, source_lang, status, start_date, language, description, description_ru, description_en, website, city, country, created_at',
);

const SITE = 'https://mypins.site';
const snap = rows.map((e) => ({
  id: e.id,
  status: e.status,
  start: e.start_date,
  source_lang: e.source_lang,
  title: String(e.title || '').slice(0, 70),
  titleLang: (() => {
    const s = String(e.title || '');
    if (/[\u0370-\u03FF\u1F00-\u1FFF]/.test(s)) return 'el';
    if (/[\u0400-\u04FF]/.test(s)) return 'ru';
    return /[a-z]/i.test(s) ? 'en' : 'other';
  })(),
  ruTail: eventSlug(e, 'ru'),
  enTail: eventHasEn(e) ? eventSlug(e, 'en') : null,
  ru: `${SITE}/event/${e.id}/${eventSlug(e, 'ru')}/`,
  en: eventHasEn(e) ? `${SITE}/en/event/${e.id}/${eventSlug(e, 'en')}/` : null,
}));

const out = process.argv[2];
if (!out) {
  console.error('Укажи путь для JSON: node scripts/dot-slug-snapshot.mjs <путь>');
  process.exit(1);
}
writeFileSync(out, JSON.stringify(snap, null, 1));
console.log(`Снимок адресов: ${snap.length} событий → ${out}`);
console.log(`  с EN-адресом: ${snap.filter((s) => s.en).length}`);
