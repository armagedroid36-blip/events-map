// 404.html — оболочка SPA для неизвестных путей GitHub Pages.
//
// Раньше это была простая копия dist/index.html, поэтому на любой 404-URL
// (в т.ч. на посадочные «город × категория» ниже порога MIN_CATEGORY_EVENTS)
// отдавался полный текст главной: её h1, canonical на «/», hreflang-пара и
// статический интро-экран — классический признак soft-404 для краулера.
//
// Теперь копия чистится:
//  * вырезаются статические SEO-блоки (#seo-*: это хвост <body>, идущий сразу
//    после <div id="root">) — на 404-странице не должно быть текста главной;
//  * содержимое #root обнуляется: React монтируется через createRoot().render()
//    и всё равно заменяет детей, но статический интро-экран главной на 404-URL
//    успевал мигнуть до гидратации (и попадал в HTML без JS);
//  * убираются canonical и hreflang-alternate (на 404 они указывали на главную);
//  * title → «404 — страница не найдена», og:url/og:title главной тоже убираем;
//  * добавляется <meta name="robots" content="noindex, follow">.
// Внутри #root остаётся видимый текст «страница не найдена» с ссылкой на
// главную (его видит crawler без JS; React заменит его своим NotFound).
// Запуск: node scripts/build-404.mjs (последний шаг npm run build).

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');

let html = readFileSync(join(DIST, 'index.html'), 'utf8');

// 1. Статические SEO-блоки: от первого <div id="seo-…"> до </body>
const cut = html.indexOf('<div id="seo-');
if (cut !== -1) {
  const bodyEnd = html.indexOf('</body>', cut);
  if (bodyEnd === -1) throw new Error('build-404: не найден </body> после SEO-блока');
  html = html.slice(0, cut) + html.slice(bodyEnd);
}

// 2. #root: убрать статический интро-экран (он лежит ВНУТРИ #root), оставить
//    текст «страница не найдена». Закрывающий </div> ищем по балансу вложенности:
//    внутри #root есть свои div (интро-экран), первый </div> закрывает не корень.
function findElementEnd(source, start) {
  const re = /<div\b|<\/div>/g;
  re.lastIndex = start;
  let depth = 0;
  let m;
  while ((m = re.exec(source)) !== null) {
    depth += m[0] === '</div>' ? -1 : 1;
    if (depth === 0) return m.index + '</div>'.length;
    if (depth < 0) break;
  }
  return -1;
}

const rootOpen = html.indexOf('<div id="root">');
if (rootOpen === -1) throw new Error('build-404: не найден <div id="root">');
const rootEnd = findElementEnd(html, rootOpen);
if (rootEnd === -1) throw new Error('build-404: не закрыт <div id="root">');
const notFound =
  '<div id="root"><p>404 — страница не найдена. <a href="/">На главную</a></p>' +
  '<p>404 — page not found. <a href="/en/">Go to the home page</a></p></div>';
html = html.slice(0, rootOpen) + notFound + html.slice(rootEnd);

// 3. canonical / hreflang / og:url главной на 404 не нужны
html = html
  .replace(/[ \t]*<link\s+rel=["']canonical["'][^>]*\/?>\r?\n?/gi, '')
  .replace(/[ \t]*<link\s+rel=["']alternate["'][^>]*\/?>\r?\n?/gi, '')
  .replace(/[ \t]*<meta\s+property=["']og:url["'][^>]*>\r?\n?/gi, '')
  .replace(/[ \t]*<meta\s+property=["']og:title["'][^>]*>\r?\n?/gi, '')
  .replace(/[ \t]*<meta\s+property=["']og:description["'][^>]*>\r?\n?/gi, '')
  .replace(/[ \t]*<meta\s+name=["']robots["'][^>]*>\r?\n?/gi, '');

// 4. title + noindex
html = html.replace(/<title>[\s\S]*?<\/title>/i, '<title>404 — страница не найдена | Page not found — MyPins</title>');
html = html.replace(
  /<\/head>/i,
  '    <meta name="robots" content="noindex, follow" />\n  </head>',
);

writeFileSync(join(DIST, '404.html'), html);
console.log('dist/404.html: оболочка без статики главной (noindex, follow, без canonical/hreflang)');
