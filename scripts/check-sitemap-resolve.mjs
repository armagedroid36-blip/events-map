/**
 * Гейт «карта ↔ резолв SPA» для mypins.site (прод): 0 URL из sitemap, которые
 * SPA не умеет отрисовать.
 *
 * Проверяется ровно та логика, которой пользуется SPA (src/pages/Home.tsx) на
 * странице /event/<id>/<slug>/:
 *   1) активный набор — RPC list_active_event_cards пачками (то же, что читает
 *      SPA: снапшот сайта /data/events.json собирается из этой функции);
 *   2) id нет в активном наборе → RPC get_public_event(id) — отдаёт архивные
 *      (их же пишет пре-рендер через list_past_events);
 *   3) id нет и там → снимок удалённого события /data/legacy-events.json
 *      (источник — scripts/data/legacy-events.json): SPA читает его как третий
 *      источник резолва, статика по нему пишет страницу 200.
 * URL из sitemap, который не резолвится ни одним из трёх путей, — это «ложная
 * ошибка 404» (Soft 404) в Google Search Console: робот получает 200, а после
 * JS-рендера видит «Событие не найдено или уже завершено».
 *
 * Архивные id НЕ дёргаются поштучно (иначе гейт идёт ~20 минут): их отдаёт
 * list_past_events постранично — тот же набор, из которого пре-рендер делает
 * архивные страницы. Поштучно проверяются только «остатки» — id, которых нет
 * ни в одном наборе (обычно их нет вовсе). Флаг `--deep` — старая модель:
 * поштучно все, кто не в активном наборе (для сверки двух моделей, медленно).
 *
 * Запуск из корня репозитория (читает .env или переменные окружения):
 *   node scripts/check-sitemap-resolve.mjs
 *   node scripts/check-sitemap-resolve.mjs --base http://127.0.0.1:4173 [--deep] [--ignore-legacy]
 *
 * Коды возврата: 0 — все URL резолвятся, 1 — есть нерезолвящиеся (гейт),
 * 2 — проверка НЕПОЛНАЯ (сетевые сбои, /data/legacy-events.json на проде нет):
 * результат не закрываем «по аналогии».
 */
import fs from 'node:fs';
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';

const GBOT = {
  'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
};
const EVENT_URL_RE =
  /\/event\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\//i;
const PAGE = 1000;
/** Столько же страниц в обходе, сколько допускает пре-рендер (защита от цикла) */
const MAX_PAGES = 60;

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const BASE = arg('base', 'https://mypins.site').replace(/\/+$/, '');
/** В sitemap адреса абсолютные (origin прода). При проверке превью/локальной
 *  сборки origin подменяем на BASE — иначе проверялись бы прод-страницы. */
function onBase(u) {
  return BASE === 'https://mypins.site' ? u : u.replace(/^https?:\/\/[^/]+/, BASE);
}
const DEEP = process.argv.includes('--deep');
/** Модель «до правки»: снимки удалённых событий в резолве не участвуют —
 *  так проверяем, что гейт действительно ловит исходный Soft 404. */
const IGNORE_LEGACY = process.argv.includes('--ignore-legacy');
const CONCURRENCY = Number(arg('concurrency', '10'));

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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchRetry(url, opts = {}, attempts = 3, delayMs = 2000) {
  let lastErr;
  for (let i = 1; i <= attempts; i += 1) {
    try {
      return await fetch(url, opts);
    } catch (err) {
      lastErr = err;
      if (i < attempts) await sleep(delayMs);
    }
  }
  throw lastErr;
}

function idsIn(xml) {
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => onBase(m[1].trim()));
  const ids = new Set();
  for (const u of locs) {
    const m = EVENT_URL_RE.exec(u);
    if (m) ids.add(m[1].toLowerCase());
  }
  return { locs, ids };
}

/** Снимки удалённых событий, ОПУБЛИКОВАННЫЕ рядом с сайтом (их читает SPA).
 *  Недоступны — берём локальный файл и говорим об этом вслух. */
async function legacyIds(localFile) {
  try {
    const res = await fetchRetry(`${BASE}/data/legacy-events.json`, { headers: GBOT }, 2, 1500);
    if (res.ok) {
      const body = await res.json();
      const list = Array.isArray(body) ? body : [];
      return {
        ids: new Set(list.filter((e) => e && typeof e.id === 'string').map((e) => e.id)),
        note: `опубликован на сайте (${list.length})`,
        prod: true,
      };
    }
    throw new Error(`HTTP ${res.status}`);
  } catch (err) {
    try {
      const list = JSON.parse(fs.readFileSync(localFile, 'utf8'));
      const ids = new Set(
        (Array.isArray(list) ? list : [])
          .filter((e) => e && typeof e.id === 'string')
          .map((e) => e.id),
      );
      return { ids, note: `ЛОКАЛЬНЫЙ файл, прод недоступен (${err.message})`, prod: false };
    } catch (err2) {
      return { ids: new Set(), note: `нет ни прода, ни файла: ${err2.message}`, prod: false };
    }
  }
}

/** Активный набор SPA: list_active_event_cards пачками (миграция 20261006 —
 *  пагинация параметрами функции). Функции нет — фолбэк на list_active_events
 *  с диапазоном, как в src/lib/api.ts. */
async function activeIds(db) {
  const ids = new Set();
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const { data, error } = await db.rpc('list_active_event_cards', {
      p_limit: PAGE,
      p_offset: page * PAGE,
    });
    if (error) return { ids, error: error.message };
    const rows = data ?? [];
    let fresh = 0;
    for (const r of rows) {
      if (r && typeof r.id === 'string' && !ids.has(r.id)) {
        ids.add(r.id);
        fresh += 1;
      }
    }
    if (rows.length < PAGE || fresh === 0) break;
  }
  return { ids, error: null };
}

/** Архивный набор: list_past_events постранично (.range() — заголовок Range
 *  у POST /rest/v1/rpc применяется только вместе с Range-Unit: items, который
 *  ставит supabase-js). Порядок без .order() стабилен, дубли гасим по id. */
async function pastIds(db) {
  const ids = new Set();
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const from = page * PAGE;
    const { data, error } = await db.rpc('list_past_events').range(from, from + PAGE - 1);
    if (error) return { ids, error: error.message };
    const rows = data ?? [];
    for (const r of rows) if (r && typeof r.id === 'string') ids.add(r.id);
    if (rows.length < PAGE) break;
  }
  return { ids, error: null };
}

async function inBatches(items, size, fn) {
  const out = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(...(await Promise.all(items.slice(i, i + size).map((x) => fn(x)))));
  }
  return out;
}

async function main() {
  const url = (env('SUPABASE_URL') || env('VITE_SUPABASE_URL') || '').replace(/\/+$/, '');
  const key = env('VITE_SUPABASE_ANON_KEY') || env('SUPABASE_ANON_KEY');
  if (!url || !key) {
    console.error('check-sitemap-resolve: нет SUPABASE_URL / VITE_SUPABASE_ANON_KEY (env или .env)');
    return 2;
  }
  const db = createClient(url, key);

  // 1. Sitemap прода: какие URL вообще держат в индексе
  let xml;
  try {
    const res = await fetchRetry(`${BASE}/sitemap.xml`, { headers: GBOT }, 3, 5000);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    xml = await res.text();
  } catch (err) {
    console.error(`check-sitemap-resolve: sitemap недоступен (${err.message}) — проверка не выполнена`);
    return 2;
  }
  const { locs, ids: sitemapIds } = idsIn(xml);
  console.log(`sitemap: ${locs.length} URL, событий ${sitemapIds.size}`);

  // 2. Три источника резолва SPA
  const errors = [];
  const snapIds = await (async () => {
    try {
      const res = await fetchRetry(`${BASE}/data/events.json`, { headers: GBOT }, 2, 1500);
      if (!res.ok) return { ids: new Set(), note: `HTTP ${res.status}` };
      const body = await res.json();
      const cards = Array.isArray(body?.cards) ? body.cards : [];
      const ids = new Set(cards.filter((c) => c && typeof c.id === 'string').map((c) => c.id));
      return { ids, note: `${ids.size} id` };
    } catch (err) {
      return { ids: new Set(), note: `ошибка: ${err.message}` };
    }
  })();
  console.log(`снапшот /data/events.json: ${snapIds.note}`);

  const active = new Set(snapIds.ids);
  const act = await activeIds(db);
  if (act.error) {
    errors.push(`list_active_event_cards: ${act.error}`);
    console.error(`  активный набор получить не удалось (${act.error})`);
  }
  for (const id of act.ids) active.add(id);
  console.log(`list_active_event_cards: ${act.ids.size}`);

  const past = new Set();
  const pst = await pastIds(db);
  if (pst.error) {
    errors.push(`list_past_events: ${pst.error}`);
    console.error(`  архивный набор получить не удалось (${pst.error})`);
  }
  for (const id of pst.ids) past.add(id);
  console.log(`list_past_events (архив): ${pst.ids.size}`);

  const legacy = await legacyIds(arg('legacy-file', 'public/data/legacy-events.json'));
  if (IGNORE_LEGACY) {
    legacy.ids = new Set();
    legacy.note = 'ИГНОРИРУЮ (--ignore-legacy: модель «до правки»)';
    legacy.prod = true;
  }
  console.log(`снимки удалённых событий: ${legacy.ids.size} (${legacy.note})`);

  // 3. Остаток: id из sitemap, которых нет ни в одном наборе. Их проверяем
  //    поштучно — ровно как SPA: get_public_event.
  const outside = [...sitemapIds].filter((id) => !active.has(id));
  const rest = DEEP
    ? outside
    : outside.filter((id) => !past.has(id) && !legacy.ids.has(id));
  console.log(
    `вне активного набора: ${outside.length}, поштучно через get_public_event: ${rest.length}${DEEP ? ' (--deep)' : ''}`,
  );

  const checked = await inBatches(rest, CONCURRENCY, async (id) => {
    try {
      const { data, error } = await db.rpc('get_public_event', { p_id: id });
      if (error) throw new Error(error.message);
      const rows = Array.isArray(data) ? data : data ? [data] : [];
      return { id, ok: rows.length > 0, err: null };
    } catch (err) {
      return { id, ok: false, err: err.message };
    }
  });

  const netErrors = checked.filter((c) => c.err);
  const resolved = new Set(checked.filter((c) => c.ok).map((c) => c.id));
  const unresolved = checked
    .filter((c) => !c.ok && !c.err && !legacy.ids.has(c.id))
    .map((c) => c.id);

  // 4. URL, которые резолвятся ТОЛЬКО снимком удалённых, обязаны отдавать 200:
  //    иначе SPA отрисует карточку, а сервер отдал 404 (или наоборот).
  const legacyOnly = sitemapIds.size
    ? [...sitemapIds].filter(
        (id) => !active.has(id) && !past.has(id) && !resolved.has(id) && legacy.ids.has(id),
      )
    : [];
  const legacyUrls = locs.filter((u) => {
    const m = EVENT_URL_RE.exec(u);
    return m && legacyOnly.includes(m[1].toLowerCase());
  });
  const badStatus = [];
  for (const u of legacyUrls.slice(0, 20)) {
    try {
      const res = await fetchRetry(u, { headers: GBOT, redirect: 'follow' }, 2, 1500);
      if (res.status !== 200) badStatus.push(`${res.status} ${u}`);
    } catch (err) {
      badStatus.push(`ERR ${u} (${err.message})`);
    }
  }

  console.log(`резолвятся через get_public_event: ${resolved.size}`);
  console.log(
    `резолвятся только снимком удалённых: ${legacyOnly.length}${legacyOnly.length ? ` (${legacyOnly.join(', ')})` : ''}`,
  );
  console.log(`сетевых сбоев при проверке: ${netErrors.length}`);
  console.log(`НЕ РЕЗОЛВИТСЯ (Soft 404 кандидаты): ${unresolved.length}`);
  for (const id of unresolved) {
    for (const u of locs) if (u.includes(id)) console.log(`  ${u}`);
  }
  for (const line of badStatus) console.log(`  страница снимка НЕ 200: ${line}`);
  if (legacy.ids.size && !legacy.prod) {
    console.log('  внимание: /data/legacy-events.json на проде недоступен — SPA такие URL не отрисует');
  }

  if (unresolved.length || badStatus.length) return 1;
  if (netErrors.length || errors.length || !legacy.prod) return 2;
  return 0;
}

main()
  .then((code) => {
    console.log(
      `check-sitemap-resolve: выход ${code} ${
        code === 0 ? '(всё резолвится)' : code === 1 ? '(есть нерезолвящиеся URL)' : '(проверка неполная)'
      }`,
    );
    process.exit(code);
  })
  .catch((err) => {
    console.error(`check-sitemap-resolve: ошибка — ${err.stack || err.message}`);
    process.exit(2);
  });
