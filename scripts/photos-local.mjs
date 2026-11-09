/**
 * Фаза 2: перенос собственных фото событий из Supabase Storage в статику сайта.
 *
 * Было: каждое открытие карточки/страницы события тянуло файл из бакета
 * `photos` проекта Supabase — это и был основной egress (152 МБ × просмотры,
 * квота 5 ГБ выжигалась краулерами). Стало: одно фото на событие лежит рядом
 * с сайтом на GitHub Pages — public/data/photos/<event-slug>/cover-800.webp,
 * сжатое до ширины 800 px в webp q80.
 *
 * Источник списка — scripts/data/photo-plan.json (снимок «событие → URL фото»
 * из резервной копии базы). Скрипт идемпотентен: уже скачанные файлы
 * пропускаются, повторный запуск докачивает недостающие.
 *
 * Запуск:
 *   node scripts/photos-local.mjs            # скачать и сжать недостающие
 *   node scripts/photos-local.mjs --dry      # только показать план
 *
 * Требуется ffmpeg в PATH (libwebp). Если Storage отвечает 402/квота —
 * пишем «База недоступна по квоте, пропуск» и выходим с кодом 0.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import process from 'node:process';
import { isQuotaError, isQuotaText, quotaSkip } from './lib/quota.mjs';

const ROOT = process.cwd();
const PLAN_FILE = path.join(ROOT, 'scripts/data/photo-plan.json');
const OUT_ROOT = path.join(ROOT, 'public/data/photos');
const MAP_FILE = path.join(ROOT, 'src/data/photo-map.json');
const DRY = process.argv.includes('--dry');
const WIDTH = 800;
const QUALITY = 80;

const plan = JSON.parse(fs.readFileSync(PLAN_FILE, 'utf8'));

/** Слаг события: из базы (slug_ru/slug_en), иначе транслит заголовка, иначе id */
function slugify(text) {
  const map = {
    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i',
    й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't',
    у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y',
    ь: '', э: 'e', ю: 'yu', я: 'ya',
  };
  return String(text || '')
    .toLowerCase()
    .split('')
    .map((ch) => map[ch] ?? ch)
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

function uniqueSlug(item, used) {
  let base = item.slug_ru || item.slug_en || slugify(item.title) || 'event';
  let slug = base;
  if (used.has(slug)) slug = `${base}-${String(item.id).slice(0, 6)}`;
  used.add(slug);
  return slug;
}

async function download(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'events-map-photos-local/1.0' },
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const err = new Error(`HTTP ${res.status} ${body.slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }
  return Buffer.from(await res.arrayBuffer());
}

function toWebp(buf, outFile) {
  const tmp = path.join(path.dirname(outFile), '.download.tmp');
  fs.writeFileSync(tmp, buf);
  try {
    execFileSync(
      'ffmpeg',
      [
        '-y', '-loglevel', 'error',
        '-i', tmp,
        // не апскейлим: ширина 800 — верхняя граница
        '-vf', `scale='min(${WIDTH},iw)':-2`,
        '-c:v', 'libwebp',
        '-quality', String(QUALITY),
        '-preset', 'photo',
        '-an',
        outFile,
      ],
      { stdio: ['ignore', 'ignore', 'pipe'] },
    );
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

const used = new Set();
fs.mkdirSync(OUT_ROOT, { recursive: true });
const map = {};
let done = 0;
let skipped = 0;
let failed = 0;

for (const item of plan) {
  const slug = uniqueSlug(item, used);
  const dir = path.join(OUT_ROOT, slug);
  const outFile = path.join(dir, 'cover-800.webp');
  const rel = `data/photos/${slug}/cover-800.webp`;
  map[item.photo] = rel;

  if (fs.existsSync(outFile)) {
    skipped += 1;
    continue;
  }
  if (DRY) {
    console.log(`[photos] план: ${item.photo} → ${rel}`);
    continue;
  }
  try {
    const buf = await download(item.photo);
    fs.mkdirSync(dir, { recursive: true });
    toWebp(buf, outFile);
    done += 1;
    if (done % 25 === 0) console.log(`[photos] ${done} готово…`);
  } catch (err) {
    if (isQuotaError(err) || isQuotaText(String(err.message))) quotaSkip();
    failed += 1;
    console.warn(`[photos] не взято ${item.photo}: ${err.message}`);
  }
}

if (!DRY) {
  fs.mkdirSync(path.dirname(MAP_FILE), { recursive: true });
  const sorted = Object.fromEntries(Object.entries(map).sort(([a], [b]) => a.localeCompare(b)));
  fs.writeFileSync(MAP_FILE, `${JSON.stringify(sorted, null, 0)}\n`);
  const bytes = fs
    .readdirSync(OUT_ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .reduce((sum, d) => {
      const f = path.join(OUT_ROOT, d.name, 'cover-800.webp');
      return sum + (fs.existsSync(f) ? fs.statSync(f).size : 0);
    }, 0);
  console.log(
    `[photos] скачано ${done}, уже было ${skipped}, ошибок ${failed}; ` +
      `всего на диске ${(bytes / 1024 / 1024).toFixed(1)} МБ, карта ${Object.keys(map).length} записей`,
  );
}
