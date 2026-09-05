// SEO-пререндер (beta 0.05): после `vite build` генерирует в dist/ физические
// index.html для /bali, /da-nang, /nha-trang и каждого активного
// /event/<id>/<slug> (в <head> — уникальные title/description + canonical),
// чтобы глубокие URL отдавали HTTP 200, и перезаписывает dist/sitemap.xml
// списком всех страниц. Источник данных — тот же RPC, что зовёт сайт:
// db.rpc('list_active_events') (src/lib/api.ts) — прошлые/скрытые/события
// заблокированных организаторов сюда не попадают автоматически.
// Запуск: node scripts/seo-prerender.mjs (внутри "build" в package.json).
// Ключи: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — из process.env (GHA)
// или .env рядом с проектом (локальная сборка; подгружается сам, без
// новых зависимостей).

import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const SITE_URL = 'https://mypins.site';

// --- env: уже заданные (GHA) или .env проекта (локально) ---
function loadDotEnv() {
  if (process.env.VITE_SUPABASE_URL && process.env.VITE_SUPABASE_ANON_KEY) return;
  try {
    const text = readFileSync(join(ROOT, '.env'), 'utf8');
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim();
      if (!key.startsWith('VITE_')) continue;
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = value;
    }
  } catch {
    // .env нет — ключи должны быть в process.env, иначе упадём ниже
  }
}
loadDotEnv();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !ANON_KEY) {
  console.error('seo-prerender: нужны VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY (env или .env).');
  process.exit(1);
}

// --- Транслит и slugify: держать синхронно с src/lib/navigate.ts (НЕ править src/) ---
const RU_TRANSLIT = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z',
  и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
  с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh',
  щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

/** Копия src/lib/navigate.ts:15-22 — «Вечеринка у бассейна» → vecherinka-u-basseyna */
function slugify(title) {
  const s = title
    .toLowerCase()
    .replace(/[а-яё]/g, (ch) => RU_TRANSLIT[ch] ?? '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s || 'event';
}

// --- Города: те же три, что в config.quickLocations (src/config.ts:46-50),
// путь = slugify(labelEn): Bali→bali, Da Nang→da-nang, Nha Trang→nha-trang ---
const CITY_PAGES = [
  {
    path: 'bali',
    title: 'События на Бали: афиша и куда сходить | Events in Bali',
    description:
      'Концерты, вечеринки, йога, маркеты и фестивали на Бали: афиша с датами, местами и ценами. Events in Bali on the map: concerts, parties, yoga and festivals.',
  },
  {
    path: 'da-nang',
    title: 'События в Дананге: афиша и куда сходить | Da Nang Events',
    description:
      'Вечеринки, концерты и фестивали в Дананге: афиша для экспатов и туристов с датами, местами и ценами. Events in Da Nang on the map for expats and travellers.',
  },
  {
    path: 'nha-trang',
    title: 'События в Нячанге: афиша и куда сходить | Nha Trang Events',
    description:
      'Вечеринки, концерты, шоу и встречи в Нячанге: афиша с датами, местами и ценами. Events in Nha Trang on the map: concerts, shows and parties.',
  },
];

// --- Утилиты ---

/** HTML/XML-экранирование (& < > " ') */
function esc(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const RU_MONTHS = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

/** «2026-09-05» → «5 сентября 2026» (без часовых поясов) */
function ruDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  if (!m) return iso;
  const [, y, mo, d] = m;
  const month = RU_MONTHS[Number(mo) - 1];
  return month ? `${Number(d)} ${month} ${y}` : iso;
}

/** Обрезка без разрыва суррогатной пары (эмодзи) */
function cutSafe(s, max) {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const code = cut.charCodeAt(cut.length - 1);
  // Высокий суррогат без низкого — отрезать, чтобы не писать U+FFFD
  return code >= 0xd800 && code <= 0xdbff ? cut.slice(0, -1) : cut;
}

/** Вычистить HTML/переносы, обрезать по границе слова (title ~65, desc ~140) */
function snippet(text, max) {
  const clean = String(text ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) return '';
  if (clean.length <= max) return clean;
  const cut = cutSafe(clean, max);
  const space = cut.lastIndexOf(' ');
  const head = (space > max * 0.6 ? cut.slice(0, space) : cut)
    .replace(/[\s,.;:—–-]+$/, '')
    .trim();
  return `${head}…`;
}

/**
 * Копия dist/index.html для URL-пути: заменить в <head> title и meta
 * description (если были), добавить canonical на этот же URL (без
 * хвостового слэша). Остальной head и тело не трогаем.
 */
function renderPage(baseHtml, meta) {
  let out = baseHtml.replace(/<title>[\s\S]*?<\/title>/i, () => `<title>${esc(meta.title)}</title>`);
  out = out.replace(/<meta\s+name=["']description["'][^>]*>/gi, '');
  out = out.replace(/<link\s+rel=["']canonical["'][^>]*\/?>/gi, '');
  const block = [
    `    <meta name="description" content="${esc(meta.description)}" />`,
    `    <link rel="canonical" href="${esc(meta.canonical)}" />`,
  ].join('\n');
  return out.replace(/<\/head>/i, `${block}\n  </head>`);
}

/** Записать dist/<path>/index.html из шаблона */
function writePage(baseHtml, path, meta) {
  const dir = join(DIST, ...path.split('/'));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.html'), renderPage(baseHtml, meta));
}

// --- Главный ход ---

async function main() {
  const db = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const { data, error } = await db.rpc('list_active_events');
  if (error) {
    console.error(`seo-prerender: ошибка list_active_events: ${error.message}`);
    process.exit(1);
  }
  const events = data ?? [];
  if (!events.length) {
    console.error('seo-prerender: list_active_events вернул пустой список — не деплоим пустые страницы.');
    process.exit(1);
  }

  const baseHtml = readFileSync(join(DIST, 'index.html'), 'utf8');
  const locs = [`${SITE_URL}/`];

  // Города
  for (const c of CITY_PAGES) {
    writePage(baseHtml, c.path, {
      title: c.title,
      description: c.description,
      canonical: `${SITE_URL}/${c.path}`,
    });
    locs.push(`${SITE_URL}/${c.path}`);
    console.log(`  /${c.path}/index.html`);
  }

  // События: URL должен совпадать с тем, что строит SPA, —
  // /event/<id>/<slugify(title)> (src/pages/Home.tsx replaceState)
  const pageEvents = [];
  for (const ev of events) {
    if (!ev || typeof ev.id !== 'string' || typeof ev.title !== 'string') continue;
    const path = `event/${ev.id}/${slugify(ev.title)}`;
    const url = `${SITE_URL}/${path}`;
    const title = snippet(`${ev.title} · ${ev.city ?? ''}`.trim(), 65) || 'Событие';
    const city = typeof ev.city === 'string' ? ev.city.trim() : '';
    // Текст, который видит русскоязычный посетитель (html lang="ru"),
    // как localizedText(description, description_ru, …): перевод или оригинал
    const ruText = ev.description_ru || ev.description || ev.description_en || '';
    const date = ruDate(ev.start_date);
    const prefix = [city, date].filter(Boolean).join(', ');
    const description = snippet(prefix ? `${prefix}. ${ruText}` : ruText, 160);
    writePage(baseHtml, path, { title, description, canonical: url });
    locs.push(url);
    pageEvents.push(path);
  }
  console.log(`  событий: ${pageEvents.length}, страниц всего: ${locs.length}`);

  // sitemap.xml (перезапись)
  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...locs
      .slice()
      .sort((a, b) => a.localeCompare(b))
      .map((u) => `  <url><loc>${esc(u)}</loc></url>`),
    '</urlset>',
    '',
  ].join('\n');
  writeFileSync(join(DIST, 'sitemap.xml'), xml);
  console.log(`  dist/sitemap.xml: ${locs.length} URL`);
}

main().catch((e) => {
  console.error(`seo-prerender: критическая ошибка: ${e.message}`);
  process.exit(1);
});
