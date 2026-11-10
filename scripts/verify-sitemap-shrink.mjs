/**
 * Гейт «sitemap не сжимается незаметно».
 *
 * 09.11.2026 аварийная сборка (база по квоте 402) опубликовала сайт без
 * архивных страниц: sitemap упал с 5 830 до 2 790 loc, 3 028 URL стали 404.
 * Ни один шаг пайплайна этого не заметил — dist был «целый».
 *
 * Правило: если в предыдущем sitemap было ≥ 100 URL и новый содержит меньше
 * 95 % от него — сборка падает и печатает, какие пути выпали. Осознанная
 * чистка — явным флагом ALLOW_SITEMAP_SHRINK=1.
 *
 * Вход:
 *   dist/sitemap.xml           — sitemap текущей сборки
 *   $PREV_SITEMAP              — снимок sitemap предыдущей публикации (необязателен)
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const NEW = path.resolve('dist/sitemap.xml');
const PREV = process.env.PREV_SITEMAP || '';
const ALLOW = String(process.env.ALLOW_SITEMAP_SHRINK || '') === '1';
const MIN_PREV = 100;
const MAX_DROP_RATIO = 0.05; // допустимое сокращение — до 5 %

const locs = (file) => {
  const xml = fs.readFileSync(file, 'utf8');
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]);
};

const typeOf = (url) => {
  const p = url.replace(/^https?:\/\/[^/]+/, '');
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

console.log(
  `verify-sitemap-shrink: было ${prev.length}, стало ${next.length} loc, выпало ${lost.length} (−${share}%)`,
);

const prevEventIds = new Set(prev.map(eventId).filter(Boolean));
const nextEventIds = new Set(next.map(eventId).filter(Boolean));
const lostIds = [...prevEventIds].filter((id) => !nextEventIds.has(id));

if (lost.length === 0) {
  console.log('verify-sitemap-shrink: сокращения нет');
  process.exit(0);
}

if (dropRatio <= MAX_DROP_RATIO) {
  console.log(`verify-sitemap-shrink: сокращение в пределах ${Math.round(MAX_DROP_RATIO * 100)}% — ок`);
  process.exit(0);
}

const byType = new Map();
for (const u of lost) byType.set(typeOf(u), (byType.get(typeOf(u)) ?? 0) + 1);

if (ALLOW) {
  console.warn('verify-sitemap-shrink: сокращение большое, но ALLOW_SITEMAP_SHRINK=1 — пропускаю');
  process.exit(0);
}

console.error(
  `\nСБОРКА ОТКЛОНЕНА: sitemap сжимается — было ${prev.length}, стало ${next.length} loc (−${share}%), ` +
    `выпало ${lost.length} URL и ${lostIds.length} event-id.`,
);
console.error('Разбивка выпавших URL по типам:');
for (const [type, n] of [...byType.entries()].sort((a, b) => b[1] - a[1])) {
  console.error(`  ${type}: ${n}`);
}
console.error('Первые 20 выпавших путей:');
for (const u of lost.slice(0, 20)) console.error(`  ${u}`);
console.error(
  '\nЕсли сокращение осознанное (удаление событий/страниц), повтори сборку с ALLOW_SITEMAP_SHRINK=1.',
);
process.exit(1);
