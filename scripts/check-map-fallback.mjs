// Проверка карты после правок: брендовый стиль жив, аварийный фолбэк не сработал.
import puppeteer from "puppeteer-core";
import fs from "node:fs";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const URL = process.argv[2] || "http://127.0.0.1:4190/";
const OUT = "shots";
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setViewport({ width: 1100, height: 800 });

const tileHosts = { openfreemap: 0, osm: 0, other: 0 };
const errors = [];
page.on("response", (r) => {
  const u = r.url();
  if (u.includes("tiles.openfreemap.org")) tileHosts.openfreemap++;
  else if (u.includes("tile.openstreetmap.org")) tileHosts.osm++;
  else if (/\.(pbf|mvt)(\?|$)/.test(u)) tileHosts.other++;
});
page.on("console", (m) => {
  const t = m.text();
  if (/аварийное переключение|аварийный|fallback/i.test(t)) errors.push("console: " + t);
});
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

await page.goto(URL, { waitUntil: "networkidle2", timeout: 90000 });
await sleep(18000); // даём время подгрузить векторные тайлы и сработать таймауту фолбэка

const info = await page.evaluate(() => ({
  canvas: !!document.querySelector(".maplibregl-canvas"),
  attrib: (document.querySelector(".maplibregl-ctrl-attrib-inner")?.textContent || "").slice(0, 120),
  markers: document.querySelectorAll(".event-marker, .maplibregl-marker").length,
}));
console.log("canvas:", info.canvas, "| маркеров:", info.markers);
console.log("атрибуция:", info.attrib);
console.log("запросы тайлов:", tileHosts);
console.log("сообщения фолбэка:", errors.length ? errors : "нет");
await page.screenshot({ path: `${OUT}/map-after-fallback.png` });
console.log("снимок:", `${OUT}/map-after-fallback.png`);
await browser.close();
