/**
 * Постоянный реестр страниц-алиасов: public/data/alias-urls.json
 *
 * Зачем. Алиас (страница по ПРЕЖНЕМУ адресу события/посадочной с canonical на
 * живую страницу) собирался только из источников, которые сами себя не
 * пополняют: scripts/data/gsc-404-urls.txt (выгрузка Search Console),
 * scripts/data/legacy-slug-urls.txt (разовая смена формулы слага 07.10.2026) и
 * sitemap ПРОШЛОЙ сборки (env PREV_SITEMAP). Алиасы в sitemap не попадают по
 * замыслу — значит, в sitemap следующей сборки их адресов уже нет, и алиас
 * переставал пересоздаваться. Публикация идёт с keep_files:false: прежний файл
 * из ветки gh-pages исчезает → HTTP 404 на адрес, который Google уже знает и
 * держит в индексе. Пример потери: /en/bali/cinema/ (GSC: «Submitted and
 * indexed», прод: 404).
 *
 * Решение: реестр — отдельный публичный JSON рядом с сайтом
 * (/data/alias-urls.json). Его скачивает пайплайн ДО сборки, пре-рендер
 * добавляет пути из него к остальным источникам алиасов, а в конце цикла
 * перезаписывает реестр ровно теми путями, для которых в ЭТОЙ сборке реально
 * написана страница-алиас. Так набор не теряется между сборками и при этом
 * самоочищается: адрес, снова ставший обычной страницей (вошёл в sitemap),
 * или алиас, у которого больше нет канонической цели, из реестра выпадает.
 *
 * Источники реестра:
 *   1) scripts/data/alias-urls.json — «затравка», коммитится в репозиторий
 *      (адреса, которые надо восстановить принудительно, и страховка от
 *      полной потери реестра на проде);
 *   2) файл из env ALIAS_REGISTRY — реестр предыдущей сборки, скачанный с
 *      прода (см. .github/workflows/rebuild-pages.yml).
 *
 * Формат: JSON-массив путей БЕЗ домена и без ведущего слэша —
 * ["en/bali/cinema", "en/event/<id>/<slug>", ...]: детерминированная сборка,
 * сортировка, дедупликация, не больше MAX_PATHS записей, без timestamp-полей.
 *
 * Запускается перед `vite build` и перед `vite` (dev) — см. package.json.
 * Отсутствующий/пустой/битый источник из env сборку не валит (реестр просто
 * получится меньше, причина уходит в лог), а битый JSON в ЗАТРАВКЕ валит: это
 * признак сломанного файла в репозитории, молча публиковать пустой набор нельзя.
 */
import fs from 'node:fs';
import path from 'node:path';

const SEED = path.resolve('scripts/data/alias-urls.json');
const OUT_DIR = path.resolve('public/data');
const OUT = path.join(OUT_DIR, 'alias-urls.json');
const MAX_PATHS = 10000;

const rel = (p) => path.relative(process.cwd(), p).replace(/\\/g, '/');

/**
 * Путь в каноническом виде реестра: без домена, без ведущего и хвостового
 * слэша, без query/hash. Пустое — null.
 */
function normalizePath(raw) {
  if (typeof raw !== 'string') return null;
  let p = raw.trim();
  if (!p) return null;
  p = p.replace(/^https?:\/\/[^/]+/i, '');
  p = p.split('#')[0].split('?')[0];
  p = p.replace(/^\/+/, '').replace(/\/+$/, '');
  return p || null;
}

/** Чтение массива путей: { paths, error }. JSON битый/не массив — error. */
function readRegistryFile(file, { label, strict }) {
  if (!file) return { paths: [], error: `${label}: путь не задан` };
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (err) {
    return { paths: [], error: `${label}: не читается (${err.code || err.message})` };
  }
  if (!text.trim()) return { paths: [], error: `${label}: файл пустой` };
  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    if (strict) {
      console.error(`[alias-registry] ${label}: ${rel(file)} — битый JSON (${err.message})`);
      process.exit(1);
    }
    return { paths: [], error: `${label}: битый JSON (${err.message})` };
  }
  if (!Array.isArray(data)) {
    if (strict) {
      console.error(`[alias-registry] ${label}: ${rel(file)} — ожидался JSON-массив путей`);
      process.exit(1);
    }
    return { paths: [], error: `${label}: ожидался JSON-массив путей` };
  }
  return { paths: data, error: null };
}

const seed = readRegistryFile(SEED, { label: 'затравка', strict: true });
const prev = readRegistryFile(process.env.ALIAS_REGISTRY, {
  label: 'реестр предыдущей сборки (ALIAS_REGISTRY)',
  strict: false,
});

for (const note of [seed.error, prev.error].filter(Boolean)) {
  console.warn(`[alias-registry] ${note} — источник пропущен`);
}
if (!process.env.ALIAS_REGISTRY) {
  console.warn(
    '[alias-registry] ALIAS_REGISTRY не задан — реестр прошлой сборки не учтён ' +
      '(локальная сборка: см. шаг «Реестр алиасов предыдущей сборки» в rebuild-pages.yml)',
  );
}

const set = new Set();
let dropped = 0;
for (const raw of [...seed.paths, ...prev.paths]) {
  const p = normalizePath(raw);
  if (!p) {
    dropped += 1;
    continue;
  }
  set.add(p);
}
const paths = [...set].sort();
if (paths.length > MAX_PATHS) {
  console.warn(`[alias-registry] путей ${paths.length} > ${MAX_PATHS} — пишу первые ${MAX_PATHS}`);
}
const out = paths.slice(0, MAX_PATHS);

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out, null, 0) + '\n');
console.log(
  `[alias-registry] ${out.length} путей → ${rel(OUT)} ` +
    `(затравка ${seed.paths.length}, реестр прошлой сборки ${prev.paths.length}, ` +
    `пустых/невалидных отброшено ${dropped})`,
);
