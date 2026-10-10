// Зонд: живые карточки, чья ссылка на Cyprus Now ведёт на страницу, которой
// больше нет в sitemap источника (страницу сняли => у пользователя 404).
//
// Читающий. Sitemap берётся через прокси 10809 (RU-IP режет), карточки — из базы
// сервисным ключом. Сравнение по нормализованному слагу (decode + без слэша).
//
// Запуск: node --env-file=.env scripts/dot-cn-sitemap-link-probe.mjs [path-to-sitemap.xml]
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const PROXY = process.env.PROXY || 'http://127.0.0.1:10809';
const SITEMAP_URL = 'https://cyprusnow.app/sitemap.xml';

const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, {
  auth: { persistSession: false },
});

/** Нормализуем URL страницы события: путь /event/<slug>, decode, без слэша в конце. */
function slugOf(url) {
  try {
    const u = new URL(String(url));
    let p = decodeURIComponent(u.pathname);
    if (p.endsWith('/')) p = p.slice(0, -1);
    const i = p.indexOf('/event/');
    if (i < 0) return null;
    return p.slice(i + 7).toLowerCase();
  } catch {
    return null;
  }
}

function loadSitemap(argPath) {
  if (argPath) return readFileSync(argPath, 'utf8');
  const out = execFileSync('curl', ['-s', '-x', PROXY, '--max-time', '40', SITEMAP_URL], {
    maxBuffer: 64 * 1024 * 1024,
  });
  return out.toString('utf8');
}

const xml = loadSitemap(process.argv[2]);
const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
const pages = new Set();
for (const l of locs) {
  const s = slugOf(l);
  if (s) pages.add(s);
}
console.log(`Sitemap: ${locs.length} loc, страниц событий ${pages.size}`);

const rows = await selectAll(
  db, 'events', 'id, title, start_date, status, website',
  { filter: (q) => q.in('status', ['active', 'moderation', 'needs_changes']) },
);
const live = rows.filter((r) => r.website && /cyprusnow\.app/i.test(r.website));
const missing = [];
let matched = 0;
for (const r of live) {
  const s = slugOf(r.website);
  if (!s) { missing.push({ ...r, why: 'слаг не читается' }); continue; }
  if (pages.has(s)) matched += 1;
  else missing.push(r);
}

console.log(`Живых с cyprusnow-ссылкой: ${live.length}; в sitemap: ${matched}; НЕТ в sitemap: ${missing.length}`);
if (process.env.DUMP) {
  const { writeFileSync } = await import('node:fs');
  writeFileSync(process.env.DUMP, live.map((r) => `${r.id}\t${r.website}`).join('\n'), 'utf8');
  console.log(`URL-список записан: ${process.env.DUMP} (${live.length})`);
}
const byStatus = {};
for (const m of missing) byStatus[m.status] = (byStatus[m.status] || 0) + 1;
console.log('Нет в sitemap по статусам:', JSON.stringify(byStatus));
for (const m of missing.slice(0, 25)) {
  console.log(`- ${m.id.slice(0, 8)} [${m.status}] ${m.start_date} ${String(m.title).slice(0, 55)} | ${String(m.website).slice(-70)}`);
}

// Живая проверка 5 первых: 404 (снята) или 200 (sitemap просто устарел/урезан)
for (const m of missing.slice(0, 5)) {
  try {
    const code = execFileSync('curl', ['-s', '-o', '/dev/null', '-w', '%{http_code}', '-x', PROXY, '--max-time', '25', m.website], {
      encoding: 'utf8',
    }).trim();
    console.log(`HTTP ${code}  ${m.id.slice(0, 8)}`);
  } catch (e) {
    console.log(`HTTP ERR ${m.id.slice(0, 8)} ${String(e.message).slice(0, 60)}`);
  }
}
