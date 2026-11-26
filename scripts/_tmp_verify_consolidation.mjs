// Временная проверка консолидации архивных дублей на локальной сборке dist/.
// Консолидированная страница = canonical ведёт на ДРУГОЙ id события.
// (Алиас = тот же id, другой слаг — это отдельный механизм, не консолидация.)
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const SITE = 'https://mypins.site';
const ID_RE = /\/event\/([0-9a-f-]{36})\//i;

const xml = readFileSync(join(DIST, 'sitemap.xml'), 'utf8');
const blocks = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => m[1]);
const locs = [];
const xhtmlByLoc = new Map();
for (const block of blocks) {
  const loc = (/<loc>([^<]+)<\/loc>/.exec(block) || [])[1];
  if (!loc) continue;
  locs.push(loc);
  xhtmlByLoc.set(loc, (block.match(/<xhtml:link/g) || []).length);
}
console.log(`sitemap locs: ${locs.length}`);

const canonicalOf = (html) => (/<link rel="canonical" href="([^"]+)"/.exec(html) || [])[1] || '';
const hreflangCount = (html) => (html.match(/rel="alternate"/g) || []).length;
const idOf = (u) => (ID_RE.exec(u) || [])[1] || '';

function walk(dir, out = []) {
  let names;
  try {
    names = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of names) {
    const p = join(dir, name);
    let st;
    try {
      st = statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(p, out);
    else if (name === 'index.html') out.push(p);
  }
  return out;
}

const files = walk(DIST);
const pages = new Map(); // url → { canon, hreflang, hrefs }
for (const f of files) {
  const html = readFileSync(f, 'utf8');
  const rel = f.slice(DIST.length).replace(/\\/g, '/').replace(/index\.html$/, '');
  const url = `${SITE}${rel}`;
  const hrefs = new Set();
  for (const m of html.matchAll(/href="([^"]+)"/g)) hrefs.add(m[1]);
  pages.set(url, { canon: canonicalOf(html), hreflang: hreflangCount(html), hrefs });
}
console.log(`html-страниц: ${files.length}`);

let nonSelfLoc = 0;
let hreflangMismatch = 0;
let missingPage = 0;
const mismatchSample = [];
for (const loc of locs) {
  const p = pages.get(loc);
  if (!p) {
    missingPage += 1;
    continue;
  }
  if (p.canon !== loc) nonSelfLoc += 1;
  const xh = xhtmlByLoc.get(loc) || 0;
  if (xh > 0 !== p.hreflang > 0) {
    hreflangMismatch += 1;
    if (mismatchSample.length < 10) mismatchSample.push(`${loc} xhtml=${xh} html=${p.hreflang}`);
  }
}
console.log(`loc без страницы: ${missingPage}`);
console.log(`loc с canonical на другой URL: ${nonSelfLoc}`);
console.log(`xhtml/hreflang расхождений: ${hreflangMismatch}`);
for (const s of mismatchSample) console.log('  ', s);

// консолидация: canonical ведёт на другой id события
const conso = new Map(); // url → canonical
const consoById = new Map(); // page id → {ru?: url, en?: url, canon}
for (const [url, p] of pages) {
  const selfId = idOf(url);
  const targetId = idOf(p.canon);
  if (!selfId || !targetId || selfId === targetId) continue;
  conso.set(url, p.canon);
  const cur = consoById.get(selfId) || { ru: null, en: null, canon: p.canon };
  if (url.includes('/en/event/')) cur.en = url;
  else cur.ru = url;
  cur.canon = p.canon;
  consoById.set(selfId, cur);
}
console.log(`консолидированных событий: ${consoById.size} (страниц ${conso.size})`);

// ни одна внутренняя ссылка не ведёт на консолидированный URL
const consoSet = new Set(conso.keys());
const linkHit = [];
for (const [url, p] of pages) {
  for (const h of p.hrefs) {
    const abs = h.startsWith('http') ? h : `${SITE}${h.startsWith('/') ? '' : '/'}${h}`;
    const norm = abs.endsWith('/') ? abs : `${abs}/`;
    if (consoSet.has(abs) || consoSet.has(norm)) linkHit.push(`${url} -> ${abs}`);
  }
}
console.log(`внутренних ссылок на консолидированные URL: ${linkHit.length}`);
for (const s of linkHit.slice(0, 20)) console.log('  ', s);

// консолидированные, которые всё-таки в sitemap
const consoInSitemap = locs.filter((u) => consoSet.has(u));
console.log(`консолидированных URL в sitemap: ${consoInSitemap.length}`);

// keeper: цель canonical обязана быть self-canonical (нет цепочек)
let chain = 0;
for (const [url, target] of conso) {
  const t = pages.get(target);
  if (!t) {
    chain += 1;
    if (chain <= 5) console.log('  нет страницы keeper:', url, '->', target);
  } else if (t.canon !== target) {
    chain += 1;
    if (chain <= 5) console.log('  цепочка canonical:', url, '->', target, '->', t.canon);
  }
}
console.log(`цепочек/битых keeper: ${chain}`);

// keeper live/archive: по снапшоту живых (dist/data/events.json)
const liveIds = new Set();
const snapPath = join(DIST, 'data', 'events.json');
if (existsSync(snapPath)) {
  const snap = JSON.parse(readFileSync(snapPath, 'utf8'));
  for (const c of snap.cards || snap.events || []) liveIds.add(String(c.id).toLowerCase());
}
let keeperLive = 0;
let keeperArchive = 0;
for (const [, v] of consoById) {
  const keeperId = idOf(v.canon).toLowerCase();
  if (liveIds.has(keeperId)) keeperLive += 1;
  else keeperArchive += 1;
}
console.log(`keeper из снапшота: live ${keeperLive}, archive ${keeperArchive} (снапшот живых: ${liveIds.size})`);

// известные URL из ТЗ
const byId = (id) => [...pages.keys()].filter((u) => u.includes(`/event/${id}/`));
for (const [label, id] of [
  ['20-URL пример', '15de6c4f-aaf8-4a92-958a-b52df86522a8'],
  ['пара 119 №1 a', '99bdab81-3bd8-4500-aa57-22cf20fe02ea'],
  ['пара 119 №1 b', 'df9d3f5e-8bbf-414c-9f9b-cbaeaa1c6c8e'],
]) {
  const us = byId(id);
  for (const u of us) {
    console.log(`${label}: ${u} inSitemap=${locs.includes(u)} canonical=${pages.get(u)?.canon}`);
  }
  if (!us.length) console.log(`${label}: страницы нет в dist (id ${id})`);
}
