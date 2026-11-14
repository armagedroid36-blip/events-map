/**
 * Гейт «в статьях блога нет ссылок в никуда».
 *
 * 14.11.2026 статья «События на Кипре» держала 8 ссылок на посадочные
 * /cyprus/party/, /cyprus/sport/, /cyprus/tour/, /cyprus/exhibition/ — эти
 * страницы не публикуются (гейт MIN_CATEGORY_EVENTS=3), ссылки отдавали 404.
 * Пре-рендер их уже переписывает на городской хаб (fixArticleLinks), но без
 * гейта любая новая статья могла бы снова привезти битые ссылки.
 *
 * Проверяем ФАКТИЧЕСКИЙ dist: все <a href="/..."> в dist/blog/ и
 * dist/en/blog/. Цель обязана существовать как dist/<path>/index.html
 * (или как файл, если у пути есть расширение).
 *
 * Выход: 0 — все внутренние ссылки живые; 1 — есть неразрешённые (список).
 * ALLOW_ARTICLE_LINKS=1 — осознанная публикация с битыми ссылками.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const DIST = path.resolve(process.env.ARTICLE_DIST || 'dist');
const ALLOW = String(process.env.ALLOW_ARTICLE_LINKS || '') === '1';
const ARTICLE_DIRS = ['blog', 'en/blog'];
const SKIP_RE = /^(?:https?:|mailto:|tel:|#|javascript:|data:)/i;

if (!fs.existsSync(DIST)) {
  console.error('check-article-links: каталога dist нет — сборка не выполнялась?');
  process.exit(1);
}

/** index.html статьи или сама страница блога */
function articleFiles() {
  const files = [];
  for (const rel of ARTICLE_DIRS) {
    const root = path.join(DIST, rel);
    if (!fs.existsSync(root)) continue;
    const top = path.join(root, 'index.html');
    if (fs.existsSync(top)) files.push(top);
    for (const name of fs.readdirSync(root)) {
      const file = path.join(root, name, 'index.html');
      if (fs.existsSync(file)) files.push(file);
    }
  }
  return files;
}

function targetExists(href) {
  const clean = href.split(/[?#]/)[0];
  if (!clean) return true;
  let rel = clean.replace(/^\//, '');
  if (rel === '' || rel.endsWith('/')) rel += 'index.html';
  else if (!/\.[a-z0-9]+$/i.test(rel)) rel += '/index.html';
  return fs.existsSync(path.join(DIST, rel));
}

const files = articleFiles();
if (!files.length) {
  console.log('check-article-links: страниц блога в dist не найдено — проверять нечего');
  process.exit(0);
}

const bad = [];
let checked = 0;
for (const file of files) {
  const html = fs.readFileSync(file, 'utf8');
  const relPage = `/${path.relative(DIST, file).split(path.sep).join('/')}`.replace('/index.html', '/');
  for (const m of html.matchAll(/<a [^>]*href="([^"]+)"[^>]*>/g)) {
    const href = m[1];
    if (SKIP_RE.test(href) || !href.startsWith('/')) continue;
    checked += 1;
    if (!targetExists(href)) bad.push({ page: relPage, href });
  }
}

console.log(`check-article-links: страниц блога ${files.length}, внутренних ссылок ${checked}, битых ${bad.length}`);
if (bad.length) {
  for (const b of bad.slice(0, 40)) console.error(`  ${b.page} → ${b.href}`);
  if (bad.length > 40) console.error(`  … ещё ${bad.length - 40}`);
  if (ALLOW) {
    console.warn('check-article-links: ALLOW_ARTICLE_LINKS=1 — пропускаю битые ссылки');
    process.exit(0);
  }
  console.error('check-article-links: ВЫХОД 1 — ссылки ведут на страницы, которых нет в сборке');
  process.exit(1);
}
console.log('check-article-links: битых внутренних ссылок нет');
