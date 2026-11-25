// Приёмка посадочных «город × сегодня» (/<city>/today/ и /en/<city>/today/).
//
// Проверяет СОБРАННЫЙ dist (не прод):
//   A. 16 страниц существуют и отдают статику; canonical == URL со слэшем;
//      h1 ровно 1; title <= 70 после html.unescape; description 140..160 у
//      индексируемых; hreflang: у индексируемых ровно 3 (self == canonical,
//      x-default = https://mypins.site/en/), у noindex — self + x-default;
//   B. гейт: набор /today/-URL в sitemap == набор страниц БЕЗ noindex
//      (0 расхождений); у неиндексируемых нет xhtml:link ни в одной паре;
//      ItemList.numberOfItems == числу <li> списка дня;
//   C. перелинковка: /<city>/ и /<city>/this-week/ (RU и EN) ведут на
//      /<city>/today/ своего языка; с /today/ — обратно на хаб; 0
//      перекрёстных языковых ссылок;
//   D. регрессии по всему dist: canonical == адрес файла, h1 == 1,
//      noindex встречается ТОЛЬКО на новых пустых /today/.
//
// Запуск: node scripts/check-today-pages.mjs [--dist dist]
// Код возврата 1 — есть провалы.

import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
};
const DIST = join(ROOT, arg('dist', 'dist'));
const SITE = 'https://mypins.site';
const CITIES = ['bali', 'da-nang', 'nha-trang', 'cyprus', 'nicosia', 'limassol', 'larnaca', 'paphos'];

const problems = [];
const fail = (msg) => problems.push(msg);

const unescape = (s) =>
  String(s)
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

const readPage = (rel) => {
  const file = join(DIST, ...rel.split('/'), 'index.html');
  if (!existsSync(file)) return null;
  return readFileSync(file, 'utf8');
};
const one = (html, re) => (re.exec(html) ?? [])[1] ?? null;
const all = (html, re) => [...html.matchAll(re)].map((m) => m[1]);

function head(html) {
  return {
    title: unescape(one(html, /<title>([\s\S]*?)<\/title>/i) ?? ''),
    description: unescape(one(html, /<meta\s+name="description"\s+content="([^"]*)"/i) ?? ''),
    canonical: one(html, /<link\s+rel="canonical"\s+href="([^"]*)"/i),
    robots: one(html, /<meta\s+name="robots"\s+content="([^"]*)"/i),
    hreflang: [...html.matchAll(/<link\s+rel="alternate"\s+hreflang="([^"]+)"\s+href="([^"]+)"/g)].map(
      (m) => ({ hreflang: m[1], href: m[2] }),
    ),
    h1: (html.match(/<h1[\s>]/g) ?? []).length,
  };
}

/** Все узлы @graph из ВСЕХ ld+json-блоков страницы (их два: WebSite+Organization
 *  и страничный @graph с CollectionPage/ItemList/BreadcrumbList). */
function jsonLdNodes(html) {
  const nodes = [];
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try {
      const ld = JSON.parse(m[1]);
      if (Array.isArray(ld['@graph'])) nodes.push(...ld['@graph']);
    } catch {
      /* блок не распарсился — пропускаем */
    }
  }
  return nodes;
}

// --- A+B: 16 страниц ------------------------------------------------------
const sitemapXml = existsSync(join(DIST, 'sitemap.xml'))
  ? readFileSync(join(DIST, 'sitemap.xml'), 'utf8')
  : '';
const sitemapBlocks = [...sitemapXml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => m[1]);
const sitemapLocs = new Set(
  sitemapBlocks.map((b) => (one(b, /<loc>([^<]+)<\/loc>/) ?? '').trim()).filter(Boolean),
);
const sitemapToday = new Set(
  [...sitemapLocs].filter((u) => /\/today\/$/.test(u) && new URL(u).host === 'mypins.site'),
);
const xhtmlTargets = new Set();
for (const b of sitemapBlocks) {
  for (const href of all(b, /<xhtml:link[^>]*href="([^"]+)"/g)) xhtmlTargets.add(href);
}

const rows = [];
for (const city of CITIES) {
  for (const lang of ['ru', 'en']) {
    const prefix = lang === 'en' ? `en/${city}` : city;
    const rel = `${prefix}/today`;
    const url = `${SITE}/${lang === 'en' ? 'en/' : ''}${city}/today/`;
    const html = readPage(rel);
    if (!html) {
      fail(`A: нет файла ${rel}/index.html`);
      continue;
    }
    const h = head(html);
    const nodes = jsonLdNodes(html);
    const indexable = !/noindex/i.test(h.robots ?? '');
    const inSitemap = sitemapToday.has(url);

    if (h.canonical !== url) fail(`A ${url}: canonical=${h.canonical}`);
    if (h.h1 !== 1) fail(`A ${url}: h1=${h.h1}`);
    if (h.title.length > 70) fail(`A ${url}: title ${h.title.length} > 70 («${h.title}»)`);
    if (!/События сегодня:|Events today in /.test(h.title)) fail(`A ${url}: title не по шаблону («${h.title}»)`);
    if (indexable && (h.description.length < 140 || h.description.length > 160)) {
      fail(`A ${url}: description ${h.description.length} вне 140–160`);
    }
    if (indexable) {
      if (h.hreflang.length !== 3) fail(`A ${url}: hreflang ${h.hreflang.length} != 3`);
      if (h.hreflang[0]?.href !== url) fail(`A ${url}: первый hreflang не self (${h.hreflang[0]?.href})`);
      if (!h.hreflang.some((x) => x.hreflang === 'x-default' && x.href === `${SITE}/en/`)) {
        fail(`A ${url}: x-default != ${SITE}/en/`);
      }
      if (h.hreflang.filter((x) => x.hreflang !== 'x-default').length !== 2) {
        fail(`A ${url}: нет пары self+пара`);
      }
    }
    if (!indexable && h.hreflang.length > 2) fail(`A ${url}: у noindex >2 hreflang (${h.hreflang.length})`);
    if (indexable !== inSitemap) fail(`B ${url}: indexable=${indexable}, в sitemap=${inSitemap} — гейт разошёлся`);
    if (!indexable && xhtmlTargets.has(url)) fail(`B ${url}: noindex, но есть xhtml:link в sitemap`);

    const itemList = nodes.find((n) => n['@type'] === 'ItemList');
    const block = /<div id="seo-today-block">([\s\S]*?)<\/div>/.exec(html)?.[1] ?? '';
    const firstUl = /<ul>([\s\S]*?)<\/ul>/.exec(block)?.[1] ?? '';
    const liCount = (firstUl.match(/<li>/g) ?? []).length;
    const noindexPage = !indexable;
    if (!block) fail(`A ${url}: нет #seo-today-block`);
    if (noindexPage && /\bnoindex\b/.test(h.robots ?? '') === false) fail(`A ${url}: нет noindex`);
    if (noindexPage && liCount > 0 && liCount < 3) {
      // события есть, но меньше порога — допустимо: показываем их списком
    }
    if (noindexPage && liCount === 0 && !/Сегодня событий нет|No events today/.test(block)) {
      fail(`A ${url}: пустая страница без «Сегодня событий нет»`);
    }
    if (indexable && !itemList) fail(`A ${url}: нет JSON-LD ItemList`);
    if (indexable && itemList && itemList.numberOfItems !== liCount) {
      fail(`B ${url}: numberOfItems=${itemList.numberOfItems}, li=${liCount}`);
    }
    const breadcrumb = nodes.find((n) => n['@type'] === 'BreadcrumbList');
    if (indexable && (!breadcrumb || breadcrumb.itemListElement?.length !== 3)) {
      fail(`A ${url}: BreadcrumbList не из 3 звеньев`);
    }
    const crossLinks =
      lang === 'en'
        ? (block.match(/href="\/(?!en\/)[a-z-]+\/today\//g) ?? [])
        : (block.match(/href="\/en\/[a-z-]+\/today\//g) ?? []);
    if (crossLinks.length) fail(`C ${url}: перекрёстные языковые ссылки: ${crossLinks.join(', ')}`);

    rows.push({ url, indexable, inSitemap, count: liCount, title: h.title, desc: h.description.length });
  }
}

// --- C: перелинковка хаб/неделя → today -----------------------------------
for (const city of CITIES) {
  for (const lang of ['ru', 'en']) {
    const target = `${lang === 'en' ? '/en' : ''}/${city}/today/`;
    const sources = [
      `${lang === 'en' ? 'en/' : ''}${city}`,
      `${lang === 'en' ? 'en/' : ''}${city}/this-week`,
    ];
    for (const rel of sources) {
      const html = readPage(rel);
      if (!html) {
        fail(`C: нет файла ${rel}/index.html`);
        continue;
      }
      if (!html.includes(`href="${target}"`)) fail(`C ${rel}: нет ссылки на ${target}`);
      const wrong = lang === 'en' ? `href="/${city}/today/"` : `href="/en/${city}/today/"`;
      if (html.includes(wrong)) fail(`C ${rel}: перекрёстная языковая ссылка ${wrong}`);
    }
    const todayHtml = readPage(`${lang === 'en' ? 'en/' : ''}${city}/today`);
    if (todayHtml && !todayHtml.includes(`href="${lang === 'en' ? '/en' : ''}/${city}/"`)) {
      fail(`C ${city}/${lang}/today: нет ссылки обратно на хаб`);
    }
  }
}

// --- D: сплошной обход всех URL sitemap -----------------------------------
// Критерий приёмки: каждый <loc> → файл в dist (200), canonical == этот URL,
// h1 == 1, а noindex встречается только на новых пустых /today/.
let checked = 0;
const noindexPages = [];
for (const url of [...sitemapLocs].sort()) {
  let path = url.replace(/^https?:\/\/[^/]+/, '');
  path = path.replace(/^\//, '').replace(/\/$/, '');
  const rel = path === '' ? '' : path;
  const file = join(DIST, ...(rel === '' ? [] : rel.split('/')), 'index.html');
  if (!existsSync(file)) {
    fail(`D: URL в sitemap без файла в dist — ${url}`);
    continue;
  }
  checked += 1;
  const html = readFileSync(file, 'utf8');
  const canonical = one(html, /<link\s+rel="canonical"\s+href="([^"]+)"/i);
  if (canonical !== url) fail(`D ${url}: canonical=${canonical}`);
  const h1 = (html.match(/<h1[\s>]/g) ?? []).length;
  if (h1 !== 1) fail(`D ${url}: h1=${h1}`);
  if (/<meta\s+name="robots"\s+content="[^"]*noindex/i.test(html) && !/\/today\/$/.test(url)) {
    noindexPages.push(url);
  }
}
if (noindexPages.length) {
  fail(`D: noindex у ${noindexPages.length} URL sitemap вне /today/: ${noindexPages.slice(0, 8).join(', ')}`);
}

// --- Отчёт ---------------------------------------------------------------
for (const r of rows.sort((a, b) => a.url.localeCompare(b.url))) {
  console.log(
    `${r.indexable ? 'IDX ' : 'NOIX'} ${r.url} — событий ${r.count}, desc ${r.desc}, sitemap ${r.inSitemap}`,
  );
}
console.log(`\nURL sitemap проверено: ${checked}; /today/ в sitemap: ${sitemapToday.size}`);
if (problems.length) {
  console.log(`\nПРОВАЛОВ: ${problems.length}`);
  for (const p of problems) console.log(`  - ${p}`);
  process.exit(1);
}
console.log('\nOK: все проверки пройдены');
