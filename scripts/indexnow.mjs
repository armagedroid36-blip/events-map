import { isQuotaError, quotaSkip } from './lib/quota.mjs'; // 402 по квоте — не красный прогон
// IndexNow: оповещает Яндекс и Bing о НОВЫХ и ИЗМЕНЁННЫХ страницах.
// Запуск после публикации: node scripts/indexnow.mjs
// Ключ не зашит в код: берём файл <32hex>.txt из dist (он публикуется на сайте,
// поисковики сверяют его по адресу keyLocation).
//
// Диффа состяния нет: прод-карта (https://<host>/sitemap.xml) — результат
// ПРЕДЫДУЩЕЙ сборки, шаг публикации в Pages идёт раньше этого скрипта.
// Отправляем только loc, которых в прод-карте нет (новые), и loc с другим
// <lastmod> (изменённые). Полную карту (~5 000 URL) не шлём никогда: раньше
// при 6 сборках в сутки это давало до 6 × 5 000 × 2 адреса пингов в день.
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

/** Прод-карта прошлой сборки; null — недоступна/пуста (тогда fallback). */
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

const prodMap = await loadProdMap();
let urls = [];
let addedCount = 0;
let changedCount = 0;

if (prodMap) {
  // added — loc, которого в прод-карте нет; changed — есть, но <lastmod> другой.
  const added = [];
  const changed = [];
  for (const [loc, lastmod] of distMap) {
    if (!keep(loc)) continue;
    if (!prodMap.has(loc)) {
      added.push(loc);
    } else if ((prodMap.get(loc) || "") !== (lastmod || "")) {
      changed.push({ loc, lastmod });
    }
  }
  // Приоритет: сначала ВСЕ новые, затем изменённые по убыванию lastmod.
  changed.sort((a, b) => (b.lastmod || "").localeCompare(a.lastmod || ""));
  addedCount = added.length;
  changedCount = changed.length;
  urls = [...added, ...changed.map((c) => c.loc)].slice(0, LIMIT);
  console.log(
    `indexnow: prod=${prodMap.size} loc, dist=${distMap.size} loc, новых ${addedCount}, изменённых ${changedCount}, отправлю ${urls.length}`,
  );
} else {
  // Прод-карта недоступна: не более LIMIT самых свежих по <lastmod>, полную карту не шлём.
  const fresh = [...distMap]
    .filter(([loc]) => keep(loc))
    .sort((a, b) => (b[1] || "").localeCompare(a[1] || ""))
    .slice(0, LIMIT)
    .map(([loc]) => loc);
  urls = fresh;
  console.log(
    `indexnow: fallback — прод-карта недоступна, отправлю не более ${LIMIT} самых свежих из dist (${urls.length})`,
  );
  console.log(
    `indexnow: prod=0 loc, dist=${distMap.size} loc, новых 0, изменённых 0, отправлю ${urls.length}`,
  );
}

if (!urls.length) {
  console.log("indexnow: нечего отправлять (0 новых, 0 изменённых)");
  process.exit(0);
}

if (DRY_RUN) {
  // Только диагностика, без HTTP.
  process.exit(0);
}

const payload = {
  host: HOST,
  key,
  keyLocation: `https://${HOST}/${key}.txt`,
  urlList: urls,
};

for (const endpoint of ["https://api.indexnow.org/indexnow", "https://yandex.com/indexnow"]) {
  try {
    const r = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(payload),
    });
    console.log("indexnow:", endpoint, "→", r.status, (await r.text()).trim().slice(0, 120));
  } catch (e) {
    console.log("indexnow:", endpoint, "→ ошибка:", e.message);
  }
}
