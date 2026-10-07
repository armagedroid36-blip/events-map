// Разовый зонд: что за 3 архивных кипрских события с греческим заголовком и
// source_lang='en'; плюс проверка класса «source_lang не совпадает с языком
// текста» по ВСЕЙ таблице (критерий: язык текста = source_lang).
// Запуск: source .env && node scripts/dot-greek-archived-probe.mjs
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
import { installCurlFetch } from './dot-curl-fetch.mjs';

installCurlFetch();

const URL_ = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE;
const db = createClient(URL_, KEY, { auth: { persistSession: false } });

const GREEK = /[\u0370-\u03FF\u1F00-\u1FFF]/;
const CYR = /[\u0400-\u04FF]/;
const detectLang = (t) => {
  const s = String(t || '');
  if (GREEK.test(s)) return 'el';
  if (CYR.test(s)) return 'ru';
  return 'en';
};

const IDS = [
  '35a39f42-9b93-43bb-b421-227aa02eaec5',
  'b43e579e-f217-45f2-88bd-cd580cfef0d7',
  'fd448831-7618-4584-add2-58068b4547df',
];

const rows = await selectAll(
  db,
  'events',
  'id, title, description, title_ru, description_ru, title_en, description_en, source_lang, language, status, start_date, city, country, website, created_at',
);

console.log(`Всего строк: ${rows.length}`);

console.log('\n=== 3 архивных кипрских события ===');
for (const id of IDS) {
  const ev = rows.find((r) => r.id === id);
  if (!ev) {
    console.log(`${id}: НЕ НАЙДЕНО`);
    continue;
  }
  console.log(`\n${id}`);
  console.log(`  status=${ev.status} start=${ev.start_date} city=${ev.city} country=${ev.country} created=${ev.created_at}`);
  console.log(`  source_lang=${ev.source_lang} language=${ev.language} website=${ev.website || '-'}`);
  console.log(`  title    [${detectLang(ev.title)}]: ${String(ev.title).slice(0, 120)}`);
  console.log(`  title_ru [${detectLang(ev.title_ru)}]: ${String(ev.title_ru).slice(0, 120)}`);
  console.log(`  title_en [${detectLang(ev.title_en)}]: ${String(ev.title_en).slice(0, 120)}`);
  console.log(`  desc len=${String(ev.description || '').length} ru_len=${String(ev.description_ru || '').length} en_len=${String(ev.description_en || '').length}`);
  console.log(`  desc     [${detectLang(ev.description)}]: ${String(ev.description).slice(0, 80)}`);
  console.log(`  desc_ru  [${detectLang(ev.description_ru)}]: ${String(ev.description_ru).slice(0, 80)}`);
  console.log(`  desc_en  [${detectLang(ev.description_en)}]: ${String(ev.description_en).slice(0, 80)}`);
}

// --- класс: язык title != source_lang ---
console.log('\n=== Класс: язык title != source_lang (по статусам) ===');
const byStatus = {};
const mismatch = [];
for (const ev of rows) {
  const tl = detectLang(ev.title);
  const sl = String(ev.source_lang || '').trim() || '(пусто)';
  const bad = tl !== sl;
  if (!byStatus[ev.status]) byStatus[ev.status] = { total: 0, bad: 0, langs: {} };
  byStatus[ev.status].total += 1;
  if (bad) {
    byStatus[ev.status].bad += 1;
    const k = `${sl}->${tl}`;
    byStatus[ev.status].langs[k] = (byStatus[ev.status].langs[k] || 0) + 1;
    mismatch.push({ id: ev.id, status: ev.status, source_lang: sl, titleLang: tl, title: String(ev.title).slice(0, 60), start_date: ev.start_date });
  }
}
for (const [st, v] of Object.entries(byStatus).sort()) {
  console.log(`  ${st}: всего ${v.total}, расхождений ${v.bad} ${JSON.stringify(v.langs)}`);
}
console.log(`  ВСЕГО расхождений: ${mismatch.length}`);

console.log('\n=== Расхождения вне статуса archived (важные) ===');
for (const m of mismatch.filter((m) => m.status !== 'archived')) {
  console.log(`  [${m.status}] ${m.source_lang}->${m.titleLang} ${m.start_date} ${m.id.slice(0, 8)} ${m.title}`);
}

// --- класс: греческий в title_ru/title_en при НЕгреческом оригинале ---
console.log('\n=== Греческий в переводах (title_ru/title_en/описания) ===');
const greekStored = rows.filter((ev) =>
  ![ev.title_ru, ev.title_en, ev.description_ru, ev.description_en].some((v) => GREEK.test(String(v || ''))),
);
console.log(`  строк с греческим в переводах: ${rows.length - greekStored.length}`);
for (const ev of rows.filter((ev) => [ev.title_ru, ev.title_en, ev.description_ru, ev.description_en].some((v) => GREEK.test(String(v || ''))))) {
  console.log(`  [${ev.status}] sl=${ev.source_lang} tl=${detectLang(ev.title)} ${ev.id.slice(0, 8)} ${String(ev.title).slice(0, 50)}`);
}
