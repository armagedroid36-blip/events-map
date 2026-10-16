/**
 * Снапшот УДАЛЁННЫХ событий рядом с сайтом: public/data/legacy-events.json
 *
 * Зачем: scripts/data/legacy-events.json — единственный источник истины о
 * событиях, которых в таблице events уже нет, но чьи URL Google держит в
 * индексе (иначе страницы мёртвые). Пре-рендер (scripts/seo-prerender.mjs)
 * читает файл напрямую и пишет такие страницы в статику, а SPA рисовала
 * «Событие не найдено или уже завершено» — после JS-рендера страница
 * выглядела для Google как Soft 404, хотя отдавала 200.
 *
 * Решение: файл кладётся в public/ (Vite публикует его как /data/legacy-events.json),
 * и SPA читает ТОТ ЖЕ набор, что и статика. Копия делается на сборке, руками
 * список не дублируется: список id живёт ровно в одном файле
 * (scripts/data/legacy-events.json).
 *
 * Запускается перед `vite build` и перед `vite` (dev) — см. package.json.
 * Отсутствие источника не валит сборку (легаси-страниц просто не будет, как
 * раньше), а вот битый JSON — валит: это признак сломанного файла, молча
 * публиковать пустой набор нельзя.
 */
import fs from 'node:fs';
import path from 'node:path';

const SRC = path.resolve('scripts/data/legacy-events.json');
const OUT_DIR = path.resolve('public/data');
const OUT = path.join(OUT_DIR, 'legacy-events.json');

const rel = (p) => path.relative(process.cwd(), p).replace(/\\/g, '/');

if (!fs.existsSync(SRC)) {
  console.warn(`[legacy-snapshot] нет источника ${rel(SRC)} — снапшот не пишу (легаси-страниц не будет)`);
  process.exit(0);
}

let raw;
let events;
try {
  raw = fs.readFileSync(SRC, 'utf8');
  events = JSON.parse(raw);
} catch (err) {
  console.error(`[legacy-snapshot] ${rel(SRC)} не читается: ${err.message}`);
  process.exit(1);
}

if (!Array.isArray(events) || events.some((e) => !e || typeof e.id !== 'string')) {
  console.error(`[legacy-snapshot] ${rel(SRC)}: ожидался массив записей с полем id`);
  process.exit(1);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT, raw.trimEnd() + '\n');
console.log(
  `[legacy-snapshot] ${events.length} снимков удалённых событий → ${rel(OUT)} ` +
    `(${events.map((e) => e.id.slice(0, 8)).join(', ')})`,
);
