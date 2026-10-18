/**
 * Рендер-гейт: страница события в SPA не должна показывать «не найдено».
 *
 * Берёт URL со ВСЕГО прод-sitemap: все адреса событий, которые резолвятся
 * ТОЛЬКО снимком удалённого события (/data/legacy-events.json), плюс N
 * случайных активных. Каждый адрес открывается настоящим браузером
 * (--headless=new --dump-dom --virtual-time-budget) — то есть проверяется то,
 * что видит Google после JS-рендера, а не исходный HTML.
 *
 * Провал, если в отрендеренном DOM есть:
 *   «Событие не найдено или уже завершено» / «Event not found or already over»,
 *   «404 — страница не найдена» / «404 — page not found».
 * Для адресов снимков дополнительно требуется: <h1> с названием события,
 * canonical на САМ адрес, hreflang-пара — то есть паритет со статикой.
 *
 * Алиасы (URL из /data/alias-urls.json): после гидратации canonical должен
 * вести на ЖИВУЮ страницу (цель из карты #seo-alias-map, для событий — ru/en),
 * а не на сам алиас и не на несуществующий URL; цель обязана отдавать 200.
 * Так ловится регрессия, из-за которой SPA перетирала canonical алиаса на
 * адрес, которого нет (тогда страница-алиас бесполезна для Google).
 *
 * Запуск:
 *   node scripts/check-render-soft404.mjs                      # прод, 2 снимка + 5 активных
 *   node scripts/check-render-soft404.mjs --base http://127.0.0.1:4173
 *   RENDER_BROWSER=/usr/bin/chromium node scripts/check-render-soft404.mjs
 *
 * Коды возврата: 0 — чисто, 1 — есть нарушения, 2 — проверить не удалось
 * (нет браузера, страница не догрузилась). Нет браузера в CI — это НЕ «чисто»:
 * гейт пишет об этом прямо.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const GBOT = {
  'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
};
const EVENT_URL_RE =
  /\/event\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\//i;
const FORBIDDEN = [
  'Событие не найдено или уже завершено',
  'Event not found or already over',
  '404 — страница не найдена',
  '404 — page not found',
];

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const BASE = arg('base', 'https://mypins.site').replace(/\/+$/, '');
/** В sitemap адреса абсолютные (origin прода). При проверке превью/локальной
 *  сборки origin подменяем на BASE — иначе браузер пошёл бы на прод. */
function onBase(u) {
  return BASE === 'https://mypins.site' ? u : u.replace(/^https?:\/\/[^/]+/, BASE);
}
const ACTIVE_COUNT = Number(arg('active', '5'));
/** Сколько страниц-алиасов проверять рендером (детерминированная выборка из
 *  /data/alias-urls.json: один «город × категория» + адреса событий). */
const ALIAS_COUNT = Number(arg('alias', '3'));
const BUDGET_MS = Number(arg('budget', '40000'));
const SEED = Number(arg('seed', '0')) || 0;

/** Последовательный генератор — «случайные» активные URL стабильны между
 *  прогонами при одном seed (иначе гейт каждый раз проверяет разные адреса). */
function mulberry32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function findBrowser() {
  const explicit = process.env.RENDER_BROWSER || process.env.CHROME_BIN || process.env.EDGE_BIN;
  const files = [
    explicit,
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/microsoft-edge',
  ].filter(Boolean);
  for (const f of files) {
    if (fs.existsSync(f)) return f;
  }
  for (const name of ['google-chrome', 'chromium', 'chromium-browser', 'microsoft-edge', 'msedge']) {
    const r = spawnSync(name, ['--version'], { encoding: 'utf8' });
    if (!r.error && r.status === 0) return name;
  }
  return null;
}

function dumpDom(browser, url, tag) {
  const profile = path.join(os.tmpdir(), `render-soft404-${process.pid}-${tag}`);
  const args = [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--hide-scrollbars',
    '--no-first-run',
    // Фото событий бывают с «висящим» ответом (напр. opengraph-image с
    // cyprusnow.app: HTTP 200, тело капает и не заканчивается). Пока такой
    // запрос не закрыт, виртуальное время Chrome НЕ двигается, бюджет не
    // исчерпывается и --dump-dom висит бесконечно. Картинки для этой проверки
    // не нужны (смотрим h1/канонический/текст-заглушку) — выключаем загрузку
    // изображений, и страница отдаёт DOM за считанные секунды.
    '--blink-settings=imagesEnabled=false',
    `--user-data-dir=${profile}`,
    `--virtual-time-budget=${BUDGET_MS}`,
    '--dump-dom',
    url,
  ];
  const r = spawnSync(browser, args, {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    timeout: BUDGET_MS + 120000,
  });
  try {
    fs.rmSync(profile, { recursive: true, force: true });
  } catch {
    /* профиль уберём позже — не мешает */
  }
  if (r.error) return { ok: false, err: r.error.message, dom: '' };
  const dom = r.stdout ?? '';
  if (!dom.trim()) return { ok: false, err: `пустой DOM (stderr: ${(r.stderr ?? '').slice(0, 300)})`, dom: '' };
  return { ok: true, dom };
}

/** Проблемы одной страницы: тексты-заглушки + (для снимков) паритет со статикой */
function inspect(dom, url, legacyNames, alias = false) {
  const problems = [];
  const notes = [];
  const result = { problems, notes, canonical: '' };
  for (const text of FORBIDDEN) {
    if (dom.includes(text)) problems.push(`в DOM есть «${text}»`);
  }
  const h1 = dom.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const h1Text = h1 ? h1[1].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim() : '';
  if (alias) {
    // Алиас: canonical обязан вести на ЖИВУЮ цель, а не на сам алиас.
    const canonical = dom.match(/<link[^>]+rel="canonical"[^>]+href="([^"]+)"/i);
    const canon = canonical ? canonical[1] : '';
    result.canonical = canon;
    // Цель — из карты #seo-alias-map, которую пишет пре-рендер: aliasTo у
    // посадочной «город × категория», ru/en у алиаса события.
    const mapRaw = dom.match(/id="seo-alias-map">([\s\S]*?)<\/script>/);
    let expected = '';
    if (mapRaw) {
      try {
        const map = JSON.parse(mapRaw[1].replace(/\\u003c/g, '<'));
        expected = map.aliasTo || (url.includes('/en/event/') ? map.en : map.ru) || '';
      } catch {
        /* карту не разобрали — проверим хотя бы «canonical не на себя» */
      }
    }
    if (!canon) problems.push('нет canonical');
    else {
      let samePath = false;
      try {
        samePath = decodeURIComponent(new URL(canon).pathname) === decodeURIComponent(new URL(url).pathname);
      } catch {
        samePath = false;
      }
      if (samePath) problems.push(`canonical на сам алиас: ${canon}`);
      if (expected && canon !== expected) problems.push(`canonical не равен цели алиаса: ${canon} ≠ ${expected}`);
      notes.push(`canonical → ${canon}`);
    }
    if (!expected) notes.push('карты #seo-alias-map в DOM нет — цель не сверить');
    return result;
  }
  if (legacyNames) {
    if (!h1Text) problems.push('нет <h1>');
    else {
      const hit = legacyNames.some((n) => {
        const key = n.replace(/[«»"']/g, '').slice(0, 20).toLowerCase();
        return key && h1Text.replace(/[«»"']/g, '').toLowerCase().includes(key);
      });
      if (!hit) problems.push(`<h1> не совпадает с названием события: «${h1Text.slice(0, 80)}»`);
    }
    const canonical = dom.match(/<link[^>]+rel="canonical"[^>]+href="([^"]+)"/i);
    const canon = canonical ? canonical[1] : '';
    if (!canon) problems.push('нет canonical');
    else {
      // Сравниваем путь адреса; origin — только при проверке прода (на
      // локальном превью canonical по определению ведёт на mypins.site).
      let samePath = false;
      let sameOrigin = true;
      try {
        const c = new URL(canon);
        const w = new URL(url);
        samePath = decodeURIComponent(c.pathname) === decodeURIComponent(w.pathname);
        sameOrigin = BASE === 'https://mypins.site' ? c.origin === w.origin : true;
      } catch {
        samePath = false;
      }
      if (!samePath) problems.push(`canonical не на сам URL: ${canon}`);
      else if (!sameOrigin) problems.push(`canonical на чужой домен: ${canon}`);
    }
    if (!/rel="alternate"[^>]+hreflang=/i.test(dom)) problems.push('нет hreflang-пары');
  } else {
    if (h1Text) notes.push(`h1: «${h1Text.slice(0, 60)}»`);
    else notes.push('h1 нет (проверялся только текст заглушек)');
  }
  return result;
}

async function main() {
  console.log(`база: ${BASE}`);
  let xml;
  try {
    const res = await fetch(`${BASE}/sitemap.xml`, { headers: GBOT });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    xml = await res.text();
  } catch (err) {
    console.error(`render-soft404: sitemap недоступен (${err.message}) — проверка не выполнена`);
    return 2;
  }
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => onBase(m[1].trim()));

  // Снимки удалённых событий: их URL берём из sitemap (хвост адреса совпадает
  // гарантированно), названия — из файла. Основной источник — ОПУБЛИКОВАННЫЙ
  // /data/legacy-events.json (его читает SPA); если на проде его ещё нет, берём
  // локальный public/data/legacy-events.json, чтобы проверить сами страницы, и
  // отдельно помечаем, что файл не опубликован (это и есть причина «не найдено»
  // для Google — SPA не может отрисовать снимок).
  let legacyList = [];
  let legacyFromProd = false;
  try {
    const res = await fetch(`${BASE}/data/legacy-events.json`, { headers: GBOT });
    if (res.ok) {
      const body = await res.json();
      legacyList = Array.isArray(body) ? body : [];
      legacyFromProd = true;
    }
  } catch {
    /* прода нет — ниже пробуем локальный файл */
  }
  if (!legacyList.length) {
    try {
      const local = JSON.parse(fs.readFileSync(arg('legacy-file', 'public/data/legacy-events.json'), 'utf8'));
      legacyList = Array.isArray(local) ? local : [];
    } catch {
      /* нет ни прода, ни файла — снимковых URL в выборке не будет */
    }
  }
  const globalProblems = [];
  if (legacyList.length && !legacyFromProd) {
    globalProblems.push(
      `${BASE}/data/legacy-events.json НЕ опубликован — SPA не сможет отрисовать снимки удалённых событий (URL взяты из локального файла)`,
    );
  }

  // Реестр страниц-алиасов: алиас обязан оставаться 200 с canonical на ЖИВУЮ
  // цель и после гидратации SPA (иначе Google видит дубль, ведущий в никуда).
  // Выборка детерминированная: сначала адрес посадочной «город × категория»,
  // затем адреса событий.
  let aliasPaths = [];
  try {
    const res = await fetch(`${BASE}/data/alias-urls.json`, { headers: GBOT });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json();
    if (!Array.isArray(body)) throw new Error('ожидался JSON-массив путей');
    aliasPaths = body.filter((p) => typeof p === 'string' && p);
  } catch (err) {
    // Не опубликован — это не «мелочь»: реестр перестал жить между сборками,
    // значит следующий прогон останется без источника алиасов.
    globalProblems.push(`${BASE}/data/alias-urls.json недоступен (${err.message}) — реестр алиасов не ведётся`);
    console.log(`внимание: реестр алиасов не прочитан (${err.message})`);
  }
  const aliasCellLike = aliasPaths.filter((p) => /^(?:en\/)?[a-z0-9-]+\/[a-z0-9_-]+$/.test(p));
  const aliasEventLike = aliasPaths.filter((p) => /^(?:en\/)?event\//.test(p));
  const aliasPicked = [...aliasCellLike.slice(0, 1), ...aliasEventLike, ...aliasCellLike.slice(1)]
    .filter(Boolean)
    .slice(0, ALIAS_COUNT);
  console.log(
    `алиасы в реестре: ${aliasPaths.length} (посадочных ${aliasCellLike.length}, событий ${aliasEventLike.length}); к проверке ${aliasPicked.length}`,
  );
  const legacyById = new Map(
    legacyList.filter((e) => e && typeof e.id === 'string').map((e) => [e.id.toLowerCase(), e]),
  );
  const legacyUrls = locs.filter((u) => {
    const m = EVENT_URL_RE.exec(u);
    return m && legacyById.has(m[1].toLowerCase());
  });
  if (legacyById.size && !legacyUrls.length) {
    console.log(
      `внимание: снимков ${legacyById.size}, но их URL нет в sitemap — проверять нечего (${[...legacyById.keys()].join(', ')})`,
    );
  }

  const activeUrls = locs.filter((u) => {
    const m = EVENT_URL_RE.exec(u);
    return m && !legacyById.has(m[1].toLowerCase());
  });
  const rnd = mulberry32(SEED || 20261016);
  const picked = [];
  const pool = [...activeUrls];
  for (let i = 0; i < Math.min(ACTIVE_COUNT, pool.length); i += 1) {
    picked.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
  }

  const targets = [
    ...legacyUrls.map((u) => ({ url: u, legacy: true })),
    ...picked.map((u) => ({ url: u, legacy: false })),
    ...aliasPicked.map((p) => ({ url: `${BASE}/${p}/`, legacy: false, alias: true })),
  ];
  console.log(
    `URL к проверке: ${targets.length} (снимков ${legacyUrls.length}, активных ${picked.length}, алиасов ${aliasPicked.length}; в sitemap событий ${legacyUrls.length + activeUrls.length})`,
  );
  if (!targets.length) {
    console.error('render-soft404: нет URL для проверки — проверка не выполнена');
    return 2;
  }

  const browser = findBrowser();
  if (!browser) {
    console.error('render-soft404: браузер не найден (Edge/Chrome) — проверка НЕ выполнена');
    console.error('задайте путь явно: RENDER_BROWSER=/путь/к/chrome node scripts/check-render-soft404.mjs');
    return 2;
  }
  console.log(`браузер: ${browser}`);

  const failures = [];
  const inconclusive = [];
  for (const [i, t] of targets.entries()) {
    const rec = legacyById.get((EVENT_URL_RE.exec(t.url)?.[1] ?? '').toLowerCase());
    const names = rec
      ? [rec.title_ru, rec.title, rec.title_en].filter((x) => typeof x === 'string' && x.trim())
      : null;
    let res = dumpDom(browser, t.url, String(i));
    // Один повтор: разовый таймаут браузера — не приговор странице
    if (!res.ok) res = dumpDom(browser, t.url, `${i}b`);
    if (!res.ok) {
      console.log(`  [${i + 1}/${targets.length}] НЕ ПРОВЕРЕНО ${t.url} — ${res.err}`);
      inconclusive.push({ url: t.url, reason: res.err });
      continue;
    }
    const { problems, notes, canonical } = inspect(res.dom, t.url, t.legacy ? names : null, Boolean(t.alias));
    // Цель canonical алиаса обязана отдавать 200: иначе страница-алиас ведёт
    // Google на несуществующий адрес — хуже, чем 404 у самого алиаса.
    if (t.alias && canonical) {
      try {
        const target = onBase(canonical);
        const res2 = await fetch(target, { headers: GBOT, redirect: 'follow' });
        if (!res2.ok) problems.push(`canonical-цель отдаёт HTTP ${res2.status}: ${target}`);
      } catch (err) {
        problems.push(`canonical-цель не проверена (${err.message}): ${canonical}`);
      }
    }
    const tag = problems.length ? 'ПРОВАЛ' : 'ок';
    console.log(`  [${i + 1}/${targets.length}] ${tag} ${t.url}${notes.length ? ` — ${notes.join('; ')}` : ''}`);
    for (const p of problems) console.log(`        ${p}`);
    if (problems.length) failures.push({ url: t.url, problems });
  }

  for (const p of globalProblems) console.log(`ПРОВАЛ (общий): ${p}`);
  console.log(
    `итог: проверено ${targets.length - inconclusive.length}, провалов ${failures.length + (globalProblems.length ? 1 : 0)}, не проверено ${inconclusive.length}`,
  );
  if (failures.length || globalProblems.length) return 1;
  if (inconclusive.length) return 2;
  return 0;
}

main()
  .then((code) => {
    console.log(
      `render-soft404: выход ${code} ${code === 0 ? '(заглушек «не найдено» нет)' : code === 1 ? '(есть страницы с заглушкой)' : '(проверка неполная)'}`,
    );
    process.exit(code);
  })
  .catch((err) => {
    console.error(`render-soft404: ошибка — ${err.stack || err.message}`);
    process.exit(2);
  });
