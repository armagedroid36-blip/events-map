/**
 * Гейт «sitemap не сжимается незаметно».
 *
 * 09.11.2026 аварийная сборка (база по квоте 402) опубликовала сайт без
 * архивных страниц: sitemap упал с 5 830 до 2 790 loc, 3 028 URL стали 404.
 * Ни один шаг пайплайна этого не заметил — dist был «целый».
 *
 * 14.11.2026 карта начала сокращаться сама: база недоступна, и каждую сборку
 * из sitemap выпадают события, у которых последний день стал старше
 * ARCHIVE_INDEX_WINDOW_DAYS (14). Это НЕ потеря — страница остаётся в dist
 * с noindex,follow. Гейт обязан отличать такой «архивный дрейф» от настоящей
 * поломки, иначе робот-сборка падает и перестают доезжать любые правки.
 *
 * Классификация выпавших URL:
 *   (A) архивный дрейф — URL события (/event/<id>/ и /en/event/<id>/), для id
 *       которого в dist есть страница (любой слаг), страница содержит
 *       <meta name="robots" content="noindex, follow">, и id НЕ значится среди
 *       активных в dist/data/events.json;
 *   (B) необъяснимое сокращение — всё остальное (города, категории, блог,
 *       посадочные; события без страницы, страница без noindex; активные id).
 *
 * Вердикт: (B) пусто → сборка проходит независимо от процента. Иначе — прежнее
 * правило: до 5 % проходим с предупреждением, больше — падаем. В отчёте обе
 * группы отдельно, сначала необъяснимые. ALLOW_SITEMAP_SHRINK=1 — осознанная
 * публикация.
 *
 * Вход:
 *   dist/sitemap.xml           — sitemap текущей сборки
 *   $PREV_SITEMAP              — снимок sitemap предыдущей публикации (необязателен)
 *   $SITEMAP_DIST              — каталог сборки (по умолчанию dist; для тестов)
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const DIST = path.resolve(process.env.SITEMAP_DIST || 'dist');
const NEW = path.join(DIST, 'sitemap.xml');
const PREV = process.env.PREV_SITEMAP || '';
const ALLOW = String(process.env.ALLOW_SITEMAP_SHRINK || '') === '1';
const MIN_PREV = 100;
const MAX_DROP_RATIO = 0.05; // допустимое сокращение — до 5 %

const locs = (file) => {
  const xml = fs.readFileSync(file, 'utf8');
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]);
};

const pathOf = (url) => url.replace(/^https?:\/\/[^/]+/, '');

const typeOf = (url) => {
  const p = pathOf(url);
  if (/^\/en\/event\//.test(p)) return '/en/event/';
  if (/^\/event\//.test(p)) return '/event/';
  if (/^\/(en\/)?(bali|da-nang|nha-trang|cyprus)(\/|$)/.test(p)) return 'город/категория';
  if (/^\/(en\/)?blog(\/|$)/.test(p)) return '/blog/';
  return 'прочее';
};

const eventId = (url) => {
  const m = url.match(/\/event\/([0-9a-f-]{36})\//i);
  return m ? m[1].toLowerCase() : null;
};

/** id активных событий из dist/data/events.json (файла нет — пустой набор). */
function loadActiveIds() {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(DIST, 'data/events.json'), 'utf8'));
    const list = Array.isArray(raw) ? raw : raw?.cards || [];
    return new Set(list.map((c) => String(c?.id || '').toLowerCase()).filter(Boolean));
  } catch {
    return null; // нет файла → класс (A) неприменим
  }
}

/** Путь к index.html события по id (любой слаг, RU или EN). */
function findEventPage(id) {
  for (const base of ['event', path.join('en', 'event')]) {
    const dir = path.join(DIST, base, id);
    if (!fs.existsSync(dir)) continue;
    for (const slug of ['.', ...fs.readdirSync(dir)]) {
      const file = path.join(dir, slug, 'index.html');
      if (fs.existsSync(file)) return file;
    }
  }
  return null;
}

const isNoindexFollow = (file) => {
  try {
    const html = fs.readFileSync(file, 'utf8');
    return /<meta[^>]+name=["']robots["'][^>]+content=["'][^"']*noindex[^"']*["']/i.test(html);
  } catch {
    return false;
  }
};

if (!fs.existsSync(NEW)) {
  console.error('verify-sitemap-shrink: dist/sitemap.xml не найден');
  process.exit(1);
}
const next = locs(NEW);

if (!PREV || !fs.existsSync(PREV)) {
  console.log(`verify-sitemap-shrink: prev-sitemap недоступен — сравнение пропущено (осталось ${next.length} loc)`);
  process.exit(0);
}

const prev = locs(PREV);
if (prev.length < MIN_PREV) {
  console.log(`verify-sitemap-shrink: в прошлом sitemap ${prev.length} < ${MIN_PREV} loc — сравнение не показательно`);
  process.exit(0);
}

const nextSet = new Set(next);
const lost = prev.filter((u) => !nextSet.has(u));
const dropRatio = lost.length / prev.length;
const share = Math.round(dropRatio * 1000) / 10;

const activeIds = loadActiveIds();

const driftA = [];
const brokenB = [];
for (const url of lost) {
  const id = eventId(url);
  let archival = false;
  if (id && activeIds) {
    const page = findEventPage(id);
    archival = Boolean(page) && isNoindexFollow(page) && !activeIds.has(id);
  }
  (archival ? driftA : brokenB).push(url);
}

console.log(
  `verify-sitemap-shrink: было ${prev.length}, стало ${next.length} loc, выпало ${lost.length} ` +
    `(${driftA.length} архивный дрейф / ${brokenB.length} необъяснимых), −${share}%`,
);

const printGroups = (stream) => {
  if (brokenB.length) {
    stream.error('  (B) НЕОБЪЯСНИМОЕ сокращение:');
    const byType = new Map();
    for (const u of brokenB) byType.set(typeOf(u), (byType.get(typeOf(u)) ?? 0) + 1);
    for (const [type, n] of [...byType.entries()].sort((a, b) => b[1] - a[1])) {
      stream.error(`    ${type}: ${n}`);
    }
    for (const u of brokenB.slice(0, 20)) stream.error(`    ${u}`);
    if (brokenB.length > 20) stream.error(`    … ещё ${brokenB.length - 20}`);
  }
  if (driftA.length) {
    stream.log(`  (A) архивный дрейф (страницы живы, noindex): ${driftA.length}`);
    for (const u of driftA.slice(0, 5)) stream.log(`    ${u}`);
    if (driftA.length > 5) stream.log(`    … ещё ${driftA.length - 5}`);
  }
};

if (lost.length === 0) {
  console.log('verify-sitemap-shrink: сокращения нет');
  process.exit(0);
}

if (brokenB.length === 0) {
  console.log(
    `verify-sitemap-shrink: архивный дрейф ${driftA.length} URL — сокращение объяснено, 0 необъяснимых`,
  );
  process.exit(0);
}

if (dropRatio <= MAX_DROP_RATIO) {
  console.log(
    `verify-sitemap-shrink: сокращение в пределах ${Math.round(MAX_DROP_RATIO * 100)}% — ок`,
  );
  printGroups({ log: console.log, error: console.error });
  process.exit(0);
}

if (ALLOW) {
  console.warn('verify-sitemap-shrink: сокращение большое, но ALLOW_SITEMAP_SHRINK=1 — пропускаю');
  printGroups({ log: console.log, error: console.error });
  process.exit(0);
}

console.error(
  `\nСБОРКА ОТКЛОНЕНА: sitemap сжимается — было ${prev.length}, стало ${next.length} loc (−${share}%), ` +
    `выпало ${lost.length} (A архивный дрейф ${driftA.length} / B необъяснимых ${brokenB.length}).`,
);
printGroups({ log: console.log, error: console.error });
console.error(
  '\nЕсли сокращение осознанное (удаление событий/страниц), повтори сборку с ALLOW_SITEMAP_SHRINK=1.',
);
process.exit(1);
