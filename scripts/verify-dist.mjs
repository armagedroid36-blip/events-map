// Проверка целостности dist перед публикацией в gh-pages.
//
// Зачем: 28.09.2026 запуск Actions завершился success, но в ветке gh-pages не
// было ни sitemap.xml, ни 404.html, ни каталогов пре-рендера — прод 23 часа
// отдавал 404 на всех страницах, кроме index.html и ассетов. Шаг «Сборка» упасть
// не мог: run: npm run build 2>&1 | tee build.log выполнялся дефолтным bash -e
// (без pipefail), поэтому код шага равнялся коду tee, а не коду сборки.
//
// Теперь барьеров два:
//  1) у шага сборки стоит shell: bash — GitHub запускает его с -eo pipefail,
//     и падение любого звена (tsc / vite / пре-рендер / 404) валит шаг;
//  2) этот скрипт — шаг «Проверка целостности dist» ПЕРЕД публикацией: он
//     смотрит не на код возврата, а на фактический результат сборки.
//
// Проверки (каждая печатает OK/FAIL; при любом провале процесс завершается 1,
// публикация в gh-pages не выполняется):
//  * dist/sitemap.xml есть и содержит >= MIN_LOC <loc>;
//  * dist/404.html есть;
//  * файлов dist/**/index.html (кроме 404.html) >= MIN_PAGES;
//  * в dist/event и dist/en/event есть страницы событий (не меньше MIN_EVENT_PAGES
//    на язык). Именно страницы: каталоги /event/ и /en/event/ собственного
//    index.html не имеют — на сайте это не разделы-лендинги, а только
//    /event/<id>/ (проверено на проде 30.09: /event/ и /en/event/ отдают 404);
//  * посадочные dist/bali, dist/en/bali, dist/cyprus, dist/blog содержат index.html;
//  * в dist/bali/index.html есть <link rel="canonical">;
//  * dist/CNAME есть и указывает на боевой домен (без него Pages теряет домен);
//  * в dist/assets есть хотя бы один .js (страховка от пустого бандла).
//
// Запуск: node scripts/verify-dist.mjs (локально — после npm run build).

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');

const MIN_LOC = 1000; // строк <loc> в sitemap.xml
const MIN_PAGES = 1000; // index.html в dist (кроме 404.html)
const MIN_EVENT_PAGES = 300; // страниц событий на язык
const SITE_HOST = 'mypins.site';

const failures = [];
const notes = [];

function check(name, fn) {
  try {
    const result = fn();
    console.log(`OK   ${name}${result ? ` — ${result}` : ''}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    failures.push(`${name}: ${message}`);
    console.log(`FAIL ${name} — ${message}`);
  }
}

function need(relPath) {
  const abs = join(DIST, relPath);
  if (!existsSync(abs)) throw new Error(`нет ${relative(ROOT, abs)}`);
  return abs;
}

function countIndexHtml(dir, { required = true } = {}) {
  const abs = join(DIST, dir);
  const label = dir === '.' ? 'dist' : `dist/${dir}`;
  if (!existsSync(abs)) {
    if (required) throw new Error(`нет каталога ${label}`);
    return 0;
  }
  let count = 0;
  for (const entry of readdirSync(abs, { withFileTypes: true, recursive: true })) {
    if (entry.isFile() && entry.name === 'index.html') count += 1;
  }
  return count;
}

check('dist/sitemap.xml: не меньше ' + MIN_LOC + ' <loc>', () => {
  const html = readFileSync(need('sitemap.xml'), 'utf8');
  const loc = html.match(/<loc>/g)?.length ?? 0;
  if (loc < MIN_LOC) throw new Error(`<loc> всего ${loc}, ожидалось >= ${MIN_LOC}`);
  return `${loc} URL`;
});

check('dist/404.html существует', () => {
  need('404.html');
  return 'на месте';
});

check(`страниц dist/**/index.html не меньше ${MIN_PAGES}`, () => {
  const total = countIndexHtml('.');
  if (total < MIN_PAGES) throw new Error(`страниц ${total}, ожидалось >= ${MIN_PAGES}`);
  return `${total} страниц`;
});

check(`страницы событий: RU и EN не меньше ${MIN_EVENT_PAGES}`, () => {
  const ru = countIndexHtml('event');
  const en = countIndexHtml('en/event');
  if (ru < MIN_EVENT_PAGES || en < MIN_EVENT_PAGES) {
    throw new Error(`RU ${ru}, EN ${en} — ожидалось >= ${MIN_EVENT_PAGES} на язык`);
  }
  return `RU ${ru}, EN ${en}`;
});

check('посадочные bali / en/bali / cyprus / blog содержат index.html', () => {
  for (const dir of ['bali', 'en/bali', 'cyprus', 'blog']) need(join(dir, 'index.html'));
  return '4 из 4';
});

check('dist/bali/index.html содержит canonical', () => {
  const html = readFileSync(need(join('bali', 'index.html')), 'utf8');
  const canonical = html.match(/<link rel="canonical" href="([^"]+)"/);
  if (!canonical) throw new Error('нет <link rel="canonical">');
  return canonical[1];
});

check(`dist/CNAME указывает на ${SITE_HOST}`, () => {
  const host = readFileSync(need('CNAME'), 'utf8').trim();
  if (!host.includes(SITE_HOST)) throw new Error(`в CNAME «${host}»`);
  return host;
});

check('dist/assets содержит бандл .js', () => {
  const abs = need('assets');
  const js = readdirSync(abs).filter((name) => name.endsWith('.js'));
  if (js.length === 0) throw new Error('нет ни одного .js');
  return `${js.length} файлов`;
});

notes.push(`dist на диске: ${relative(ROOT, DIST)}`);

if (failures.length > 0) {
  console.error('');
  console.error(`Проверка dist провалена (${failures.length}):`);
  for (const failure of failures) console.error(` — ${failure}`);
  console.error('Публикация в gh-pages не выполняется: на прод частичный dist не уходит.');
  process.exit(1);
}

console.log('');
console.log(`Проверка dist пройдена (${notes.join(', ')}). Можно публиковать.`);
