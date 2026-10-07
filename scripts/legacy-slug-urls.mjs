// Список прежних URL событий после смены ФОРМУЛЫ слага — источник страниц-алиасов
// в scripts/seo-prerender.mjs (ФАЙЛ: scripts/data/legacy-slug-urls.txt).
//
// Зачем: 07.10.2026 формула хвоста URL события изменилась — RU-хвост строится из
// ПЕРЕВОДА (title_ru), а не из оригинала (title), EN — из title_en. Заголовки
// кипрских событий собираются на греческом, поэтому прод-URL выглядели как
// /event/<id>/event/ (греческий оригинал целиком выпадал из слага). Формула
// поменялась — и ~650 адресов, которые Google уже знает (из sitemap), в новой
// сборке перестали бы существовать: 404 без объяснений. У каждой такой страницы
// должен остаться URL, отдающий 200 с canonical на новый адрес.
//
// Запуск: node scripts/legacy-slug-urls.mjs (по базе; нужны VITE_SUPABASE_* в .env).
// Запускать СРАЗУ ПОСЛЕ смены формулы и до сборки страниц. Скрипт только пишет
// файл — ничего не деплоит. Для URL из GSC есть отдельный список
// (scripts/data/gsc-404-urls.txt), он ведётся вручную.
//
// ВНИМАНИЕ: LEGACY_SLUGIFY ниже — замороженная копия формулы, которая работала в
// продакшене ДО смены. Её нельзя «улучшать»: иначе список перестанет совпадать с
// тем, что реально отдаёт сайт. При следующей смене формулы — сохранить текущую
// (eventSlug) как следующую legacy-копию и добавить её в расчёт.
//
// ТРЕТИЙ вид прежнего адреса — фолбэк `event-<id8>` промежуточной формулы
// (07.10.2026), который жил на проде у греческих карточек без перевода до
// заполнения title_ru/title_en: он не выводится ни из одной формулы (зависит от
// уже перезаписанных данных), поэтому признак — «в оригинале нет латиницы»
// (см. slugHasLatin). Такие URL из архива/активных тоже попадают в список.

import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { eventHasEn, eventSlug, slugHasLatin } from '../src/lib/slug.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'scripts/data/legacy-slug-urls.txt');

for (const rawLine of readFileSync(join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
  const line = rawLine.trim();
  if (!line || line.startsWith('#')) continue;
  const eq = line.indexOf('=');
  if (eq <= 0) continue;
  const key = line.slice(0, eq).trim();
  let value = line.slice(eq + 1).trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  if (process.env[key] === undefined) process.env[key] = value;
}

/** Формула слага, работавшая в продакшене до 07.10.2026 (ЗАМОРОЖЕНА) */
const RU_TRANSLIT = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z',
  и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
  с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh',
  щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};
function legacySlugify(title) {
  const s = String(title ?? '')
    .toLowerCase()
    .replace(/[а-яё]/g, (ch) => RU_TRANSLIT[ch] ?? '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s || 'event';
}

/** Греческие буквы (U+0370–U+03FF, U+1F00–U+1FFF) — признак оригинала-афиши,
 *  у которого до правки не было title_en. */
const GREEK = /[\u0370-\u03FF\u1F00-\u1FFF]/;

const db = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});

/** Постранично (PostgREST отдаёт не больше 1000 строк на запрос) */
async function loadAll(rpc) {
  const rows = [];
  const seen = new Set();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.rpc(rpc).range(from, from + 999);
    if (error) throw new Error(`${rpc}: ${error.message}`);
    const page = data ?? [];
    for (const row of page) {
      if (typeof row.id !== 'string' || seen.has(row.id)) continue;
      seen.add(row.id);
      rows.push(row);
    }
    if (page.length < 1000) break;
  }
  return rows;
}

const events = [...(await loadAll('list_active_events')), ...(await loadAll('list_past_events'))];
const current = new Set();
const legacy = new Set();
for (const ev of events) {
  if (!ev || typeof ev.id !== 'string' || typeof ev.title !== 'string') continue;
  const ruNew = `event/${ev.id}/${eventSlug(ev, 'ru')}`;
  const ruOld = `event/${ev.id}/${legacySlugify(ev.title)}`;
  current.add(ruNew);
  legacy.add(ruOld);
  if (eventHasEn(ev)) {
    current.add(`en/event/${ev.id}/${eventSlug(ev, 'en')}`);
    legacy.add(`en/event/${ev.id}/${legacySlugify(ev.title_en || ev.title)}`);
    // У греческих карточек поле title_en до этой правки было ПУСТЫМ, поэтому
    // прежний EN-адрес считался из ОРИГИНАЛА (латиница внутри греческого
    // заголовка: «…Opening Street Fiesta at El Taller»). После заполнения
    // title_en воспроизвести его замороженной формулой уже нельзя — добавляем
    // вариант от оригинала явно.
    if (GREEK.test(String(ev.title))) {
      legacy.add(`en/event/${ev.id}/${legacySlugify(ev.title)}`);
    }
  }
  // Третий вид прежнего адреса — фолбэк формулы 07.10.2026
  // (`event-<первые 8 символов id>`): он появлялся у карточек, где в поле
  // перевода ещё НЕ было латиницы (греческий оригинал без перевода, греческий
  // лежал в title_ru), и именно этот адрес отдавал прод до заполнения
  // переводов. Признак — в ОРИГИНАЛЕ нет ни одной латинской буквы (иначе слаг
  // собрался бы из латиницы оригинала и совпал с прежним адресом).
  if (!slugHasLatin(ev.title)) {
    const fallback = `event-${ev.id.slice(0, 8)}`;
    legacy.add(`event/${ev.id}/${fallback}`);
    if (eventHasEn(ev)) legacy.add(`en/event/${ev.id}/${fallback}`);
  }
}

const dead = [...legacy].filter((p) => !current.has(p)).sort();
writeFileSync(OUT, dead.map((p) => `/${p}/`).join('\n') + '\n');
console.log(
  `legacy-slug-urls: событий ${events.length}, путей сейчас ${current.size}, ` +
    `прежних ${legacy.size}, из них изменились ${dead.length} → scripts/data/legacy-slug-urls.txt`,
);
