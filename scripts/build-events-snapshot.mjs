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
    console.warn(`[snapshot] категории не получены (${err.message}) — SPA прочитает живой REST`);
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

main().catch((err) => {
  // Сборку не валим: SPA умеет читать живой RPC, а прошлый снапшот (если есть)
  // остаётся на месте — публикуем как было лучше, чем не публиковать вовсе.
  const had = fs.existsSync(OUT_FILE);
  console.warn(`[snapshot] ошибка: ${err.message}. ${had ? 'Оставляю прошлый снапшот.' : 'Снапшота нет — сайт пойдёт в живой RPC.'}`);
  process.exit(0);
});
