/**
 * Гейт «архив покрывает предыдущий sitemap».
 *
 * 13.11.2026: 429 event-id (~858 URL) из sitemap прогонов 06–09.11 отдавали
 * 404 — их выбросил slice(0, 6000) в build-events-snapshot.mjs. Чтобы это
 * не повторилось молча, сверяем: каждый event-id из PREV_SITEMAP должен
 * получить страницу в dist/event (RU или EN).
 *
 * Разбор расхождений:
 *   - id есть в локальных данных (archive.json / events.json / legacy), но
 *     страницы нет → «НЕДОСТРОЕНО», шаг падает (это баг сборки);
 *   - id нет ни в одном наборе → события, вероятно, удалены из БД; такие URL
 *     перечисляем в отчёте и артефакте, но шаг не валим (данных для страницы
 *     физически нет).
 *
 * Переменные: PREV_SITEMAP — файл sitemap предыдущей опубликованной сборки.
 * Флаг ALLOW_NEW_404=1 — осознанно публиковать с недостроенными id.
 * Отчёт: seo-missing-from-build.json в корне репозитория (уходит в артефакт).
 */
import fs from 'node:fs';
import path from 'node:path';

const PREV = process.env.PREV_SITEMAP;
const REPORT = 'seo-missing-from-build.json';
const EVENT_RE = /\/(?:en\/)?event\/([0-9a-fA-F-]{36})\//;

function idsFromSitemap(file) {
  const xml = fs.readFileSync(file, 'utf8');
  const ids = new Set();
  for (const m of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
    const hit = EVENT_RE.exec(m[1]);
    if (hit) ids.add(hit[1].toLowerCase());
  }
  return ids;
}

// Структура dist: dist/event/<id>/<slug>/index.html (два уровня) и
// dist/en/event/<id>/<slug>/index.html.
function idsFromDir(dir) {
  const ids = new Set();
  if (!fs.existsSync(dir)) return ids;
  for (const name of fs.readdirSync(dir)) {
    if (!/^[0-9a-fA-F-]{36}$/.test(name)) continue;
    const idDir = path.join(dir, name);
    if (!fs.statSync(idDir).isDirectory()) continue;
    if (fs.existsSync(path.join(idDir, 'index.html'))) {
      ids.add(name.toLowerCase());
      continue;
    }
    for (const slug of fs.readdirSync(idDir)) {
      if (fs.existsSync(path.join(idDir, slug, 'index.html'))) {
        ids.add(name.toLowerCase());
        break;
      }
    }
  }
  return ids;
}

function idsFromJson(file, key) {
  const ids = new Set();
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    const list = Array.isArray(raw) ? raw : raw?.[key] || raw?.cards || [];
    for (const r of list) if (r && r.id) ids.add(String(r.id).toLowerCase());
  } catch {
    /* нет файла — пустой набор */
  }
  return ids;
}

if (!PREV) {
  console.log('check-archive-coverage: PREV_SITEMAP не задан — сверка пропущена');
  process.exit(0);
}
if (!fs.existsSync(PREV)) {
  console.log(`check-archive-coverage: ${PREV} не найден — сверка пропущена`);
  process.exit(0);
}

const prevIds = idsFromSitemap(PREV);
const built = new Set([...idsFromDir('dist/event'), ...idsFromDir('dist/en/event')]);
const known = new Set([
  ...idsFromJson('public/data/archive.json', 'events'),
  ...idsFromJson('public/data/events.json', 'cards'),
  ...idsFromJson('scripts/data/legacy-events.json', 'events'),
]);

const missing = [...prevIds].filter((id) => !built.has(id));
const rebuild = missing.filter((id) => known.has(id));
const vanished = missing.filter((id) => !known.has(id));

const report = {
  generated_at: new Date().toISOString(),
  prev_sitemap_ids: prevIds.size,
  built_event_pages: built.size,
  missing_total: missing.length,
  not_built_but_data_exists: rebuild,
  missing_no_data: vanished,
};
fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));

console.log(
  `check-archive-coverage: в предыдущем sitemap ${prevIds.size} event-id, страниц в dist ${built.size}, без страницы ${missing.length}`,
);
if (rebuild.length) {
  console.log(`  НЕДОСТРОЕНО (данные есть, страницы нет): ${rebuild.length}`);
  for (const id of rebuild.slice(0, 20)) console.log(`   /event/${id}/`);
  if (rebuild.length > 20) console.log(`   … ещё ${rebuild.length - 20}`);
}
if (vanished.length) {
  console.log(`  нет данных вовсе (вероятно, удалены из БД): ${vanished.length} — отчёт ${REPORT}`);
  for (const id of vanished.slice(0, 10)) console.log(`   /event/${id}/`);
}

if (rebuild.length && String(process.env.ALLOW_NEW_404 || '') !== '1') {
  console.error('check-archive-coverage: ВЫХОД 1 — есть id из прошлого sitemap, которым не построили страницу');
  process.exit(1);
}
console.log('check-archive-coverage: новых 404 из-за сборки нет');
