// Глобальная проверка dist: где ещё остались греческие буквы на страницах
// событий и CITY-страницах (видимый текст vs данные адреса/JSON-LD).
// Запуск: node scripts/dot-greek-leftovers-dist.mjs
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const GREEK = /[\u0370-\u03FF\u1F00-\u1FFF]/;

function* walk(dir, depth = 0) {
  if (depth > 3) return;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p, depth + 1);
    else yield p;
  }
}

const roots = ['dist/event', 'dist/en/event', 'dist/cyprus', 'dist/en/cyprus', 'dist/bali', 'dist/en/bali', 'dist/nha-trang', 'dist/en/nha-trang', 'dist/da-nang', 'dist/en/da-nang'];
let files = 0;
let withGreek = 0;
const samples = [];
for (const root of roots) {
  let ok = true;
  try { statSync(root); } catch { ok = false; }
  if (!ok) continue;
  for (const f of walk(root)) {
    if (!f.endsWith('.html')) continue;
    files += 1;
    const html = readFileSync(f, 'utf8');
    if (!GREEK.test(html)) continue;
    withGreek += 1;
    // Греческий в h1/title/описании = дефект; в <address>/location/organizer.url = данные
    const h1 = (html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1] || '';
    const title = (html.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '';
    const inVisible = GREEK.test(h1) || GREEK.test(title);
    if (samples.length < 25) {
      samples.push(`${inVisible ? 'ДЕФЕКТ' : 'данные'} ${f} | ${(html.match(GREEK) ? html.slice(Math.max(0, html.search(GREEK) - 60), html.search(GREEK) + 60).replace(/\s+/g, ' ') : '')}`);
    }
    if (inVisible) withGreek += 0;
  }
}
console.log(`Проверено html-файлов: ${files}`);
console.log(`С греческими буквами: ${withGreek}`);
console.log(samples.join('\n'));
