import { isQuotaError, quotaSkip } from './lib/quota.mjs'; // 402 по квоте — не красный прогон
/**
 * Статический снапшот публичного списка событий: public/data/events.json
 *
 * Зачем: SPA тянет список карточек из Supabase RPC (~150 КБ gzip) на каждой
 * загрузке страницы. Трафик в основном краулерский, и он выжигает бесплатные
 * 5 ГБ egress Supabase. Снапшот публикуется вместе с сайтом на GitHub Pages
 * (там лимит мягкий), а Supabase остаётся только для авторизации, форм и
 * точечной догрузки карточки (get_public_event).
 *
 * Скрипт запускается перед `vite build` (см. package.json) и НЕ ломает сборку,
 * если ключей нет: в этом случае сайт просто читает живой RPC, как раньше.
 *
 * Ключи берутся из окружения (так в GitHub Actions) либо из .env-файлов
 * локально: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY, при их отсутствии —
 * SUPABASE_URL / SUPABASE_SERVICE_ROLE. Service-ключ используется только здесь,
 * в браузерный бандл он не попадает (префикса VITE_ у него нет).
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import zlib from 'node:zlib';

const PAGE = 1000;
const OUT_DIR = path.resolve('public/data');
const OUT_FILE = path.join(OUT_DIR, 'events.json');

function fromDotEnv(name) {
  for (const file of ['.env.local', '.env.build', '.env']) {
    try {
      const text = fs.readFileSync(file, 'utf8');
      const m = text.match(new RegExp(`^\\s*${name}\\s*=\\s*(.+)$`, 'm'));
      if (m) return m[1].trim().replace(/^["']|["']$/g, '');
    } catch {
      /* файла нет — идём дальше */
    }
  }
  return undefined;
}

const env = (name) => process.env[name] || fromDotEnv(name);

const url = env('VITE_SUPABASE_URL') || env('SUPABASE_URL');
const key =
  env('VITE_SUPABASE_ANON_KEY') ||
  env('SUPABASE_ANON_KEY') ||
  env('SUPABASE_SERVICE_ROLE');

if (!url || !key) {
  console.warn('[snapshot] нет ключей Supabase — снапшот не собираю (SPA прочитает живой RPC)');
  process.exit(0);
}

async function fetchPage(from) {
  // Пагинация — параметрами функции (миграция 20261006). Заголовок Range
  // PostgREST для неё игнорирует, поэтому запросы с Range отдавали одну и ту
  // же первую тысячу; query-параметры limit/offset тоже работают, но явные
  // аргументы читаются однозначнее.
  const res = await fetch(`${url}/rest/v1/rpc/list_active_event_cards`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'count=none',
    },
    body: JSON.stringify({ p_limit: PAGE, p_offset: from }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const rows = await res.json();
  if (!Array.isArray(rows)) throw new Error('ожидался массив строк');
  return rows;
}

/** Категории для карточки события (подпись в фактах, строки «Ещё события …
 *  · категория», фильтры). Раньше SPA тянула их отдельным запросом к Supabase
 *  ПОСЛЕ снимка: на мобильной сети это ~0,9 с, и первый рендер карточки ждал
 *  его (Lighthouse: observed LCP 1,94 с, симулированный 5,0 с). Теперь они
 *  лежат в том же файле, что и карточки, — отдельного запроса нет.
 *  Ошибка здесь не валит снапшот: без массива категорий SPA сходит в живой
 *  REST, как раньше. */
async function fetchCategories() {
  const res = await fetch(`${url}/rest/v1/categories?select=id,name_ru,name_en,emoji&order=id.asc`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const rows = await res.json();
  if (!Array.isArray(rows)) throw new Error('ожидался массив категорий');
  return rows
    .filter((c) => c && typeof c.id === 'string')
    .map((c) => ({
      id: c.id,
      name_ru: c.name_ru ?? '',
      name_en: c.name_en ?? '',
      emoji: c.emoji ?? '',
    }));
}

/** Зеркало cityPath() из src/lib/address.ts — менять синхронно. По этому пути
 *  страница события выбирает компактный снимок своего города (~50 КБ вместо
 *  187 КБ общего). */
function cityPathOf(rawCity) {
  const city = String(rawCity ?? '').toLowerCase();
  if (!city) return null;
  if (city.includes('нячанг') || city.includes('nha trang')) return 'nha-trang';
  if (city.includes('дананг') || city.includes('da nang') || city.includes('danang')) {
    return 'da-nang';
  }
  const baliKeys = [
    'бали', 'bali', 'ubud', 'убуд', 'canggu', 'чангу',
    'seminyak', 'семиньяк', 'kuta', 'кута', 'denpasar', 'gianyar',
  ];
  if (baliKeys.some((k) => city.includes(k))) return 'bali';
  const cyprusKeys = [
    'кипр', 'cyprus',
    'лимасол', 'limassol', 'lemesos', 'lemessos',
    'никосия', 'nicosia', 'lefkosia', 'lefkosa', 'strovolos', 'latsia',
    'ларнака', 'larnaca', 'larnaka',
    'пафос', 'paphos', 'pafos', 'peyia', 'pegeia', 'kouklia',
    'фамагуста', 'famagusta', 'ammochostos',
    'ая-напа', 'ая напа', 'ayia napa', 'agia napa', 'ayanapa',
    'паралимни', 'paralimni', 'протарас', 'protaras', 'дериния', 'deryneia',
    'полис', 'polis', 'latchi', 'sotira', 'geroskipou',
  ];
  if (cyprusKeys.some((k) => city.includes(k))) return 'cyprus';
  return null;
}

/** Потолок событий в городском снимке = потолок маркеров карты события */
const CITY_SNAPSHOT_LIMIT = 300;

/** Снимки по городам: /data/events-<cityPath>.json. Нужны странице события —
 *  ей хватает своего города (маркеры, «Похожие события», даты серии), а общий
 *  файл в 187 КБ на мобильной сети грузился 0,6-1,5 с и держал карточку. */
function writeCitySnapshots(cards, categories, generatedAt) {
  const groups = new Map();
  for (const card of cards) {
    const key = cityPathOf(card.city);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(card);
  }
  for (const [city, list] of groups) {
    const ordered = list
      .slice()
      .sort(
        (a, b) =>
          String(a.start_date ?? '').localeCompare(String(b.start_date ?? '')) ||
          String(a.id).localeCompare(String(b.id)),
      )
      .slice(0, CITY_SNAPSHOT_LIMIT);
    const payload = {
      generated_at: generatedAt,
      source: 'list_active_event_cards',
      city,
      count: ordered.length,
      categories,
      cards: ordered,
    };
    const file = path.join(OUT_DIR, `events-${city}.json`);
    fs.writeFileSync(file, JSON.stringify(payload));
    const kb = (fs.statSync(file).size / 1024).toFixed(0);
    console.log(`[snapshot] ${city}: ${ordered.length} карточек, ${kb} КБ → ${path.relative(process.cwd(), file)}`);
  }
}

async function main() {
  // Категории тянем параллельно с карточками: ошибка по ним снапшот не валит.
  const catsPromise = fetchCategories().catch((err) => {
    console.warn(
      isQuotaError(err)
        ? 'База недоступна по квоте, пропуск'
        : `[snapshot] категории не получены (${err.message}) — SPA прочитает живой REST`,
    );
    return [];
  });
  const cards = [];
  const seen = new Set();
  let pages = 0;
  for (let from = 0; ; from += PAGE) {
    const rows = await fetchPage(from);
    let fresh = 0;
    for (const row of rows) {
      if (!row || typeof row.id !== 'string' || seen.has(row.id)) continue;
      seen.add(row.id);
      cards.push(row);
      fresh += 1;
    }
    pages += 1;
    // Защита от бесконечного цикла: если страница не принесла новых строк
    // (пагинация не применилась) — останавливаемся, а не крутимся до таймаута.
    if (rows.length < PAGE || fresh === 0 || pages > 50) break;
  }

  const categories = await catsPromise;
  const payload = {
    generated_at: new Date().toISOString(),
    source: 'list_active_event_cards',
    count: cards.length,
    // Категории — в том же файле: карточке события они нужны для подписи в
    // фактах и строки «Ещё события … · категория», и отдельный запрос к
    // Supabase задерживал первый рендер на ~1 с (LCP).
    categories,
    cards,
  };
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(payload));
  const bytes = fs.statSync(OUT_FILE).size;
  console.log(
    `[snapshot] ${cards.length} карточек, ${categories.length} категорий, ${(bytes / 1024).toFixed(0)} КБ → ${path.relative(process.cwd(), OUT_FILE)}`,
  );
  // Компактные снимки по городам для страниц событий (см. writeCitySnapshots).
  writeCitySnapshots(cards, categories, payload.generated_at);
}

/** Аварийный источник снапшота, когда БД недоступна (квота/402/сеть):
 *  текущий файл с прода. Он отдаётся GitHub Pages (мягкий лимит), проверен
 *  временем и содержит реальные карточки — это НЕ выдуманные данные. Без него
 *  деплой статики во время блока квоты публиковал бы сайт без data/events.json
 *  (файл в .gitignore, в Actions его нет) и карта пустела бы досрочно. */
const PROD_SNAPSHOT_URL = 'https://mypins.site/data/events.json';

async function adoptProdSnapshot(reason) {
  const why = isQuotaError(reason) ? 'База недоступна по квоте, пропуск' : reason;
  console.warn(`[snapshot] БД недоступна (${why}) — беру текущий снапшот с прода`);
  const res = await fetch(PROD_SNAPSHOT_URL, {
    headers: { 'User-Agent': 'hermes-dot-events/1.0' },
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) throw new Error(`прод-снапшот HTTP ${res.status}`);
  const payload = await res.json();
  if (!payload || !Array.isArray(payload.cards) || payload.cards.length < 50) {
    throw new Error(`прод-снапшот подозрителен: карточек ${payload?.cards?.length ?? 'нет'}`);
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(payload));
  writeCitySnapshots(payload.cards, Array.isArray(payload.categories) ? payload.categories : [], payload.generated_at);
  console.log(
    `[snapshot] взят снапшот прода: ${payload.cards.length} карточек, generated_at ${payload.generated_at} (данные не свежие, но настоящие)`,
  );
}

/**
 * Архив прошедших событий → public/data/archive.json.
 *
 * Зачем отдельный файл: при недоступной БД пре-рендер раньше просто не писал
 * архивные страницы, и прод терял их пачкой (09.11.2026 sitemap упал с 5830
 * до 2790 loc, 3 028 URL стали 404). Теперь архив едет вместе со статикой.
 *
 * Источники по убыванию достоверности:
 *   1) RPC list_past_events (живая БД);
 *   2) public/data/archive.json на проде (GitHub Pages, реальные данные);
 *   3) scripts/data/archive-seed.json.gz — резервная копия базы от 09.11.2026.
 * generated_at никогда не подменяем: у источников 2–3 он свой.
 */
const ARCHIVE_FILE = path.join(OUT_DIR, 'archive.json');
// Облегчённая копия для SPA: полный archive.json (17 МБ) браузеру не нужен,
// а страница архивного события иначе рисует «Событие не найдено» — для Google
// это Soft 404, для человека тупик. Поля те же, описания обрезаны до 300 симв.
const ARCHIVE_LITE_FILE = path.join(OUT_DIR, 'archive-lite.json');
const ARCHIVE_LITE_FIELDS = [
  'id', 'title', 'title_ru', 'title_en', 'description', 'description_ru', 'description_en',
  'city', 'country', 'address', 'lat', 'lng', 'start_date', 'end_date', 'start_time',
  'end_time', 'price', 'currency', 'donation', 'category_id', 'source_lang', 'photos',
  'owner_id', 'slug_ru', 'slug_en', 'status', 'recurrence',
];

// Хэш шарда: тот же алгоритм, что в src/lib/legacyEvents.ts — браузер тянет
// один шард (~1,2 МБ) вместо общего файла на 9 МБ.
const ARCHIVE_SHARDS = 8;
function archiveShardOf(id) {
  const s = String(id || '').toLowerCase();
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % ARCHIVE_SHARDS;
}

function writeArchiveLite(payload) {
  const buckets = Array.from({ length: ARCHIVE_SHARDS }, () => []);
  for (const e of payload.events || []) {
    const o = {};
    for (const k of ARCHIVE_LITE_FIELDS) {
      if (e[k] === undefined || e[k] === null) continue;
      o[k] = /^description/.test(k) ? String(e[k]).slice(0, 300) : e[k];
    }
    if (Array.isArray(o.photos)) o.photos = o.photos.slice(0, 1);
    buckets[archiveShardOf(e.id)].push(o);
  }
  for (let i = 0; i < ARCHIVE_SHARDS; i += 1) {
    const file = ARCHIVE_LITE_FILE.replace('.json', `-${i}.json`);
    fs.writeFileSync(file, JSON.stringify({ generated_at: payload.generated_at, shard: i, count: buckets[i].length, events: buckets[i] }));
  }
  return buckets.reduce((n, b) => n + b.length, 0);
}
const ORGS_FILE = path.join(OUT_DIR, 'orgs.json');
const ARCHIVE_SEED = path.resolve('scripts/data/archive-seed.json.gz');
const ORGS_SEED = path.resolve('scripts/data/orgs.json');
const PROD_ARCHIVE_URL = 'https://mypins.site/data/archive.json';
const PROD_ORGS_URL = 'https://mypins.site/data/orgs.json';
// Ограничение только как страховка от бесконечного набора: режем НЕ по 6000.
// 13.11.2026 выяснилось, что slice(0,6000) выбрасывал 428 архивных событий,
// чьи URL были в sitemap 06–09.11 → 404 и потеря индекса.
const ARCHIVE_SAFETY_LIMIT = 20000;
const PAST_PAGE = 1000;

function archiveOrder(a, b) {
  const da = (a.end_date || a.start_date || '').slice(0, 10);
  const db = (b.end_date || b.start_date || '').slice(0, 10);
  if (da !== db) return da < db ? 1 : -1;
  const sa = (a.start_date || '').slice(0, 10);
  const sb = (b.start_date || '').slice(0, 10);
  if (sa !== sb) return sa < sb ? 1 : -1;
  return String(a.id).localeCompare(String(b.id));
}

async function fetchArchiveFromDb() {
  const all = [];
  const seen = new Set();
  for (let from = 0; ; from += PAST_PAGE) {
    const res = await fetch(`${url}/rest/v1/rpc/list_past_events?limit=${PAST_PAGE}&offset=${from}`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'count=none',
      },
      body: '{}',
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const rows = await res.json();
    if (!Array.isArray(rows)) throw new Error('ожидался массив строк');
    let fresh = 0;
    for (const row of rows) {
      const id = String(row?.id ?? '').toLowerCase();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      all.push(row);
      fresh += 1;
    }
    if (rows.length < PAST_PAGE || fresh === 0) break;
  }
  return all;
}

function readJsonGz(file) {
  try {
    return JSON.parse(zlib.gunzipSync(fs.readFileSync(file)).toString('utf8'));
  } catch {
    return null;
  }
}

async function fetchJson(urlOrNull, minCount) {
  if (!urlOrNull) return null;
  const res = await fetch(urlOrNull, {
    headers: { 'User-Agent': 'hermes-dot-events/1.0' },
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const payload = await res.json();
  const list = Array.isArray(payload) ? payload : payload?.events;
  if (!Array.isArray(list) || list.length < minCount) {
    throw new Error(`подозрительно мало записей: ${Array.isArray(list) ? list.length : 'нет'}`);
  }
  return payload;
}

async function buildArchive() {
  let payload = null;
  let source = '';
  try {
    const rows = await fetchArchiveFromDb();
    if (rows.length > 0) {
      const prev = fs.existsSync(ARCHIVE_FILE)
        ? JSON.parse(fs.readFileSync(ARCHIVE_FILE, 'utf8'))
        : null;
      const merged = new Map();
      for (const r of Array.isArray(prev?.events) ? prev.events : []) merged.set(String(r.id).toLowerCase(), r);
      for (const r of rows) merged.set(String(r.id).toLowerCase(), r);
      const mergedAll = [...merged.values()].sort(archiveOrder);
      const events = mergedAll.slice(0, ARCHIVE_SAFETY_LIMIT);
      payload = { generated_at: new Date().toISOString(), count: events.length, events, total_all: mergedAll.length };
      source = 'list_past_events';
    }
  } catch (err) {
    console.warn(
      isQuotaError(err) || /HTTP 40[0-9]/.test(err.message)
        ? `[snapshot] архив: база недоступна — ${isQuotaError(err) ? 'квота' : err.message}`
        : `[snapshot] архив: ошибка ${err.message}`,
    );
  }
  if (!payload) {
    // Прод-файл может быть усечён прошлыми сборками (6000), а затравка —
    // полная: объединяем по id, свежие записи прода перекрывают затравку.
    let prod = null;
    try {
      prod = await fetchJson(PROD_ARCHIVE_URL, 50);
      source = 'прод';
    } catch (err) {
      console.warn(`[snapshot] архив с прода не взят: ${err.message}`);
    }
    const seed = readJsonGz(ARCHIVE_SEED);
    if (prod && seed) {
      const merged = new Map();
      for (const r of seed.events || []) merged.set(String(r.id).toLowerCase(), r);
      for (const r of prod.events || []) merged.set(String(r.id).toLowerCase(), r);
      const mergedAll = [...merged.values()].sort(archiveOrder);
      const events = mergedAll.slice(0, ARCHIVE_SAFETY_LIMIT);
      payload = { generated_at: prod.generated_at, count: events.length, events, total_all: mergedAll.length };
      source = 'прод + затравка';
    } else if (prod) {
      payload = prod;
      payload.total_all = (prod.events || []).length;
    } else if (seed) {
      payload = seed;
      payload.total_all = (seed.events || []).length;
      source = 'затравка резервной копии';
    } else {
      console.warn('[snapshot] archive-snapshot отсутствует — архивные страницы будут сняты');
      return;
    }
  }
  const allEvents = payload.events || [];
  const totalAll = Number.isFinite(payload.total_all) ? payload.total_all : allEvents.length;
  const lastKept = allEvents[allEvents.length - 1];
  const oldestCut =
    totalAll > allEvents.length && lastKept ? lastKept.end_date || lastKept.start_date || '—' : '—';
  // Обязательная строка отчёта — всегда, даже когда усечения нет.
  console.log(
    `[snapshot] архив: всего ${totalAll}, опубликовано ${allEvents.length}, обрезано ${totalAll - allEvents.length} (старейшее ${oldestCut})`,
  );
  delete payload.total_all;
  fs.writeFileSync(ARCHIVE_FILE, JSON.stringify(payload));
  writeArchiveLite(payload);
  const kb = (fs.statSync(ARCHIVE_FILE).size / 1024).toFixed(0);
  console.log(
    `[snapshot] архив (${source}): ${allEvents.length} записей, ${kb} КБ, generated_at ${payload.generated_at} → public/data/archive.json`,
  );
}

async function buildOrgs() {
  let payload = null;
  let source = '';
  try {
    const res = await fetch(`${url}/rest/v1/rpc/list_public_orgs`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'count=none',
      },
      body: '{}',
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const rows = await res.json();
    if (Array.isArray(rows)) {
      payload = {
        generated_at: new Date().toISOString(),
        count: rows.length,
        orgs: rows.map((r) => ({
          owner_id: r.id,
          display_name: r.display_name,
          bio: r.bio,
          avatar_url: r.avatar_url,
          contacts_public: r.contacts_public ?? false,
        })),
      };
      source = 'list_public_orgs';
    }
  } catch (err) {
    console.warn(`[snapshot] организаторы: база недоступна (${isQuotaError(err) ? 'квота' : err.message})`);
  }
  if (!payload) {
    try {
      payload = await fetchJson(PROD_ORGS_URL, 1);
      source = 'прод';
    } catch (err) {
      console.warn(`[snapshot] orgs.json с прода не взят: ${err.message}`);
    }
  }
  if (!payload) {
    try {
      const seed = JSON.parse(fs.readFileSync(ORGS_SEED, 'utf8'));
      const orgs = Array.isArray(seed) ? seed : seed?.orgs;
      if (Array.isArray(orgs)) {
        payload = { generated_at: seed.generated_at ?? null, count: orgs.length, orgs };
        source = 'затравка резервной копии';
      }
    } catch {
      /* затравки нет — просто пропускаем */
    }
  }
  if (!payload) {
    console.warn('[snapshot] orgs-snapshot отсутствует — страницы организаторов будут сняты');
    return;
  }
  fs.writeFileSync(ORGS_FILE, JSON.stringify(payload));
  console.log(
    `[snapshot] организаторы (${source}): ${(payload.orgs || []).length} профилей → public/data/orgs.json`,
  );
}

main()
  .catch(async (err) => {
    // Сборку не валим: прошлый снапшот (если есть) остаётся на месте. Если его
    // нет (чистый чекаут в Actions) — подкладываем прод-снапшот, иначе деплой
    // опубликует сайт без данных.
    const had = fs.existsSync(OUT_FILE);
    console.log(
      isQuotaError(err)
        ? 'База недоступна по квоте, пропуск'
        : `[snapshot] ошибка: ${err.message}. ${had ? 'Оставляю прошлый снапшот.' : 'Снапшота нет.'}`,
    );
    if (!had) {
      try {
        await adoptProdSnapshot(err.message);
      } catch (fallbackErr) {
        console.warn(`[snapshot] прод-снапшот не взят: ${fallbackErr.message}. Сайт пойдёт в живой RPC.`);
      }
    }
  })
  // Архив и профили организаторов собираем В ЛЮБОМ СЛУЧАЕ: даже когда основной
  // снапшот взят с прода, страницы прошедших событий и организаторов должны
  // остаться на проде (иначе sitemap сжимается вдвое).
  .then(async () => {
    await buildArchive();
    await buildOrgs();
  })
  .catch((e) => console.warn(`[snapshot] архив/организаторы не записаны: ${e.message}`))
  .finally(() => process.exit(0));
