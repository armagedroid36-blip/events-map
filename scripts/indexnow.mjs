// IndexNow: оповещает Яндекс и Bing о страницах из dist/sitemap.xml.
// Запуск после сборки: node scripts/indexnow.mjs
// Ключ не зашит в код: берём файл <32hex>.txt из dist (он публикуется на сайте,
// поисковики сверяют его по адресу keyLocation).
import fs from "node:fs";
import path from "node:path";

const DIST = process.env.DIST_DIR || "dist";
const HOST = process.env.INDEXNOW_HOST || "mypins.site";
// RU_ONLY: true только при явном INDEXNOW_RU_ONLY=1 (опт-ин «только русская
// половина»). По умолчанию оповещаем ВСЕ URL из sitemap — RU и EN (промпт B58:
// раньше дефолт был «только RU», и вся EN-половина сайта не пинговалась).
const RU_ONLY = process.env.INDEXNOW_RU_ONLY === "1";

function findKey(dir) {
  for (const f of fs.readdirSync(dir)) {
    if (/^[0-9a-f]{32}\.txt$/.test(f)) {
      const key = fs.readFileSync(path.join(dir, f), "utf8").trim();
      if (key === f.replace(/\.txt$/, "")) return key;
    }
  }
  return null;
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

let urls = [...fs.readFileSync(sitemapPath, "utf8").matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
if (RU_ONLY) urls = urls.filter((u) => !u.includes("/en/"));
urls = urls.slice(0, 10000);
// Наблюдаемость для CI: эффект фильтра видно только по числу отправленных URL
console.log(`indexnow: отправлено ${urls.length} URL`);

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
