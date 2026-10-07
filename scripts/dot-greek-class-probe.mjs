// Зонд 2: точная классификация расхождений source_lang ↔ язык текста.
// Запуск: source .env && node scripts/dot-greek-class-probe.mjs
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
import { installCurlFetch } from './dot-curl-fetch.mjs';
import { writeFileSync } from 'node:fs';

installCurlFetch();

const URL_ = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const db = createClient(URL_, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });

const GREEK = /[\u0370-\u03FF\u1F00-\u1FFF]/;
const CYR = /[\u0400-\u04FF]/;
const LAT = /[a-z]/i;
const detectLang = (t) => {
  const s = String(t || '');
  if (!s.trim()) return '';
  if (GREEK.test(s)) return 'el';
  if (CYR.test(s)) return 'ru';
  if (LAT.test(s)) return 'en';
  return 'other';
};

const rows = await selectAll(
  db,
  'events',
  'id, title, description, title_ru, description_ru, title_en, description_en, source_lang, language, status, start_date, city, website, created_at',
);
writeFileSync(
  'scripts/data/dot-class-probe.json',
  JSON.stringify(rows.map((r) => ({ ...r, description: String(r.description || '').slice(0, 400) })), null, 1),
);

const out = [];
const push = (s) => out.push(s);

push(`Всего строк: ${rows.length}`);
push('\n--- A. ГРЕЧЕСКИЙ в title (заголовок греческий), source_lang != el ---');
const a = rows.filter((e) => detectLang(e.title) === 'el' && e.source_lang !== 'el');
for (const e of a) {
  push(`  [${e.status}] sl=${e.source_lang} lang=${e.language} title_en=${e.title_en ? 'ЕСТЬ' : 'нет'} title_ru=[${detectLang(e.title_ru)}] ${e.start_date} ${e.id} ${String(e.title).slice(0, 45)}`);
}
push(`  ИТОГО A: ${a.length}  (по статусам: ${JSON.stringify(a.reduce((m, e) => ((m[e.status] = (m[e.status] || 0) + 1), m), {}))})`);

push('\n--- B. КИРИЛЛИЦА в title, source_lang != ru ---');
const b = rows.filter((e) => detectLang(e.title) === 'ru' && e.source_lang !== 'ru');
for (const e of b) push(`  [${e.status}] sl=${e.source_lang} ${e.id} ${String(e.title).slice(0, 45)}`);
push(`  ИТОГО B: ${b.length}`);

push('\n--- C. ЛАТИНИЦА в title, source_lang != en (и title_en пуст или латиница) ---');
const c = rows.filter((e) => detectLang(e.title) === 'en' && e.source_lang !== 'en');
push(`  ИТОГО C: ${c.length} (по статусам: ${JSON.stringify(c.reduce((m, e) => ((m[e.status] = (m[e.status] || 0) + 1), m), {}))})`);
for (const e of c.filter((x) => x.status !== 'archived').slice(0, 8)) {
  push(`  пример [${e.status}] sl=${e.source_lang} tl_ru=[${detectLang(e.title_ru)}] tl_en=[${detectLang(e.title_en)}] d=[${detectLang(e.description)}] ${e.id} ${String(e.title).slice(0, 40)} | сайт=${e.website || '-'}`);
}
// в C: сколько имеют русское описание (значит источник русский — верно) против английского
for (const st of ['active', 'archived']) {
  const part = c.filter((e) => e.status === st);
  const descRu = part.filter((e) => detectLang(e.description) === 'ru' || detectLang(e.description_ru) === 'ru').length;
  push(`  ${st}: всего ${part.length}, с русским текстом в описании ${descRu}, с англ. описанием ${part.filter((e) => detectLang(e.description) === 'en').length}`);
}

push('\n--- D. ГРЕЧЕСКИЕ буквы в переводах (title_ru/title_en/desc_ru/desc_en) ---');
const d = rows.filter((e) => [e.title_ru, e.title_en, e.description_ru, e.description_en].some((v) => GREEK.test(String(v || ''))));
push(`  ИТОГО D: ${d.length} (по статусам: ${JSON.stringify(d.reduce((m, e) => ((m[e.status] = (m[e.status] || 0) + 1), m), {}))})`);
for (const e of d) push(`  [${e.status}] sl=${e.source_lang} tl=[${detectLang(e.title)}] ru=[${detectLang(e.title_ru)}] en=[${detectLang(e.title_en)}] ${e.start_date} ${e.id} ${String(e.title).slice(0, 45)}`);

push('\n--- E. Греческий ЗАГОЛОВОК без EN-названия (страница /en/ с греческим h1) ---');
const e5 = rows.filter((e) => detectLang(e.title) === 'el' && !e.title_en);
push(`  ИТОГО E: ${e5.length} (по статусам: ${JSON.stringify(e5.reduce((m, e) => ((m[e.status] = (m[e.status] || 0) + 1), m), {}))})`);

push('\n--- F. source_lang="el", но title не греческий ---');
const f = rows.filter((e) => e.source_lang === 'el' && detectLang(e.title) !== 'el');
push(`  ИТОГО F: ${f.length}`);
for (const e of f) push(`  [${e.status}] tl=[${detectLang(e.title)}] ${e.id} ${String(e.title).slice(0, 45)}`);

push('\n--- G. source_lang пустой ---');
push(`  ИТОГО G: ${rows.filter((e) => !String(e.source_lang || '').trim()).length}`);

console.log(out.join('\n'));
