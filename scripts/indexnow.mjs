import { isQuotaError, quotaSkip } from './lib/quota.mjs'; // 402 по квоте — не красный прогон
// IndexNow: оповещает Яндекс и Bing о НОВЫХ и ИЗМЕНЁННЫХ страницах.
// Запуск после публикации: node scripts/indexnow.mjs
// Ключ не зашит в код: берём файл <32hex>.txt из dist (он публикуется на сайте,
// поисковики сверяют его по адресу keyLocation).
//
// База сравнения — карта ПРОШЛОЙ ОТПРАВКИ (.indexnow-state.json, живёт в кэше
// Actions). Прод-sitemap для диффа не годится: публикация в Pages идёт раньше,
// и к моменту этого шага https://mypins.site/sitemap.xml уже равен ТЕКУЩЕЙ
// сборке (прогон 45332107842: prod=4993, dist=4993, новых 0 при реальном
// приросте карты 4971 → 4993). Поэтому state — основной источник, а прод-карта
// используется только как bootstrap, когда состояния ещё нет.
// Полную карту (~5 000 URL) не шлём никогда: раньше при 6 сборках в сутки это
// давало до 6 × 5 000 × 2 адреса пингов в день.
import fs from "node:fs";
import path from "node:path";

const DIST = process.env.DIST_DIR || "dist";
const HOST = process.env.INDEXNOW_HOST || "mypins.site";
// RU_ONLY: true только при явном INDEXNOW_RU_ONLY=1 (опт-ин «только русская
// половина»). По умолчанию оповещаем ВСЕ URL из sitemap — RU и EN (промпт B58:
// раньше дефолт был «только RU», и вся EN-половина сайта не пинговалась).
const RU_ONLY = process.env.INDEXNOW_RU_ONLY === "1";
// Потолок отправки: IndexNow принимает до 10 000, но нам нужны только свежие.
const LIMIT = 1000;
const PROD_SITEMAP = process.env.INDEXNOW_PROD_SITEMAP || `https://${HOST}/sitemap.xml`;
const STATE_PATH = process.env.INDEXNOW_STATE || path.join(DIST, "..", ".indexnow-state.json");
const DRY_RUN = process.env.INDEXNOW_DRY_RUN === "1";

function findKey(dir) {
  for (const f of fs.readdirSync(dir)) {
    if (/^[0-9a-f]{32}\.txt$/.test(f)) {
      const key = fs.readFileSync(path.join(dir, f), "utf8").trim();
      if (key === f.replace(/\.txt$/, "")) return key;
    }
  }
  return null;
}

/** Карта loc → lastmod. Разметка sitemap: <url><loc>…</loc><lastmod>…</lastmod>…</url> */
function parseSitemap(xml) {
  const map = new Map();
  for (const m of String(xml).matchAll(/<url>([\s\S]*?)<\/url>/g)) {
    const loc = /<loc>\s*([^<\s]+)\s*<\/loc>/.exec(m[1]);
    if (!loc) continue;
    const lastmod = /<lastmod>\s*([^<\s]+)\s*<\/lastmod>/.exec(m[1]);
    map.set(loc[1], lastmod ? lastmod[1] : "");
  }
  return map;
}

/** Состояние прошлой отправки: {savedAt, entries: {loc: lastmod}} */
function loadState() {
  try {
    const raw = JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
    const entries = raw && typeof raw === "object" ? raw.entries : null;
    if (!entries || typeof entries !== "object") return null;
    const map = new Map(Object.entries(entries).filter(([k]) => typeof k === "string"));
    return map.size ? map : null;
  } catch {
    return null;
  }
}

function saveState(map) {
  try {
    fs.writeFileSync(
      STATE_PATH,
      JSON.stringify({ savedAt: new Date().toISOString(), entries: Object.fromEntries(map) }),
    );
    return true;
  } catch (e) {
    console.log("indexnow: состояние не записано:", e.message);
    return false;
  }
}

const sitemapPath = path.join(DIST, "sitemap.xml");
if (!fs.existsSync(sitemapPath)) {
  console.log("indexnow: нет", sitemapPath, "— пропускаем");
  process.exit(0);
}
const key = findKey(DIST);
if (!key) {
  console.log("indexnow: ключевой файл не найден — пропускаем");
  process.exit(0);
}

const distMap = parseSitemap(fs.readFileSync(sitemapPath, "utf8"));
const keep = (u) => !RU_ONLY || !u.includes("/en/");

/** Прод-карта прошлой сборки (bootstrap): null — недоступна/пуста. */
async function loadProdMap() {
  try {
    const r = await fetch(PROD_SITEMAP, {
      headers: { "User-Agent": "mypins-indexnow" },
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) {
      console.log(`indexnow: прод-карта недоступна (HTTP ${r.status}) — fallback`);
      return null;
    }
    const map = parseSitemap(await r.text());
    if (!map.size) {
      console.log("indexnow: прод-карта пуста — fallback");
      return null;
    }
    return map;
  } catch (e) {
    console.log(`indexnow: прод-карта недоступна (${e.message}) — fallback`);
    return null;
  }
}

let baseMap = loadState();
let baseKind = "state";
if (!baseMap) {
  baseMap = await loadProdMap();
  baseKind = "prod (bootstrap)";
}

let urls = [];
let addedCount = 0;
let changedCount = 0;

if (baseMap) {
  // added — loc, которого в базе нет; changed — есть, но <lastmod> другой.
  const added = [];
  const changed = [];
  for (const [loc, lastmod] of distMap) {
    if (!keep(loc)) continue;
    if (!baseMap.has(loc)) {
      added.push(loc);
    } else if ((baseMap.get(loc) || "") !== (lastmod || "")) {
      changed.push({ loc, lastmod });
    }
  }
  // Приоритет: сначала ВСЕ новые, затем изменённые по убыванию lastmod.
  changed.sort((a, b) => (b.lastmod || "").localeCompare(a.lastmod || ""));
  addedCount = added.length;
  changedCount = changed.length;
  urls = [...added, ...changed.map((c) => c.loc)].slice(0, LIMIT);
  console.log(
    `indexnow: база=${baseKind} (prod=${baseMap.size} loc), dist=${distMap.size} loc, новых ${addedCount}, изменённых ${changedCount}, отправлю ${urls.length}`,
  );
} else {
  // Ни состояния, ни прод-карты: не более LIMIT самых свежих по <lastmod>,
  // полную карту не шлём.
  const fresh = [...distMap]
    .filter(([loc]) => keep(loc))
    .sort((a, b) => (b[1] || "").localeCompare(a[1] || ""))
    .slice(0, LIMIT)
    .map(([loc]) => loc);
  urls = fresh;
  console.log(
    `indexnow: fallback — нет ни состояния, ни прод-карты, отправлю не более ${LIMIT} самых свежих из dist (${urls.length})`,
  );
  console.log(
    `indexnow: prod=0 loc, dist=${distMap.size} loc, новых 0, изменённых 0, отправлю ${urls.length}`,
  );
}

if (!urls.length) {
  console.log("indexnow: нечего отправлять (0 новых, 0 изменённых)");
  // База сравнения должна «догнать» текущую сборку, иначе следующий прогон
  // снова будет считать всё новым.
  if (!DRY_RUN) saveState(distMap);
  process.exit(0);
}

if (DRY_RUN) {
  // Только диагностика, без HTTP и без записи состояния.
  process.exit(0);
}

const payload = {
  host: HOST,
  key,
  keyLocation: `https://${HOST}/${key}.txt`,
  urlList: urls,
};

let anyOk = false;
for (const endpoint of ["https://api.indexnow.org/indexnow", "https://yandex.com/indexnow"]) {
  try {
    const r = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(payload),
    });
    if (r.status >= 200 && r.status < 300) anyOk = true;
    console.log("indexnow:", endpoint, "→", r.status, (await r.text()).trim().slice(0, 120));
  } catch (e) {
    console.log("indexnow:", endpoint, "→ ошибка:", e.message);
  }
}

// Состояние двигаем только когда отправка прошла или отправлять было нечего:
// при полном провале следующий прогон повторит эти же URL, а не потеряет их.
if (anyOk) {
  saveState(distMap);
} else {
  console.log("indexnow: состояние не обновлено (все эндпоинты ответили ошибкой) — повторим на следующей сборке");
}
