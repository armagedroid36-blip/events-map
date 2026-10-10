// Проверка новой страховки сборщика Кипра ПО ЖИВОЙ ЛЕНТЕ (без записи в базу):
// сколько записей Cyprus Now пропустилось бы, потому что их страница уже
// превращена в событие (ключ title|start_date такие повторы не ловит).
// Запуск: node --env-file=.env scripts/dot-cn-page-skip-check.mjs
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
import { execFileSync } from 'node:child_process';

const PROXY = process.env.PROXY === '0' ? null : 'http://127.0.0.1:10809';
function curl(url) {
  const args = ['-s', '--max-time', '30'];
  if (PROXY) args.push('-x', PROXY);
  args.push(url);
  return execFileSync('curl', args, { encoding: 'utf8', maxBuffer: 60 * 1024 * 1024 });
}

const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
const rows = await selectAll(db, 'events', 'title, start_date, website, status');
const websites = new Set(rows.map((e) => (e.website || '').trim()).filter(Boolean));
console.log(`строк в базе: ${rows.length}, ссылок источников: ${websites.size}`);

function normKey(t, d) { return `${String(t || '').toLowerCase().trim()}|${String(d || '').slice(0, 10)}`; }
const keys = new Set(rows.map((e) => normKey(e.title, e.start_date)));

let total = 0; let byKey = 0; let byPage = 0;
const hitsByPage = [];
for (const city of ['famagusta', 'protaras', 'paralimni', 'larnaca', 'paphos', 'limassol', 'nicosia']) {
  let data = null;
  try { data = JSON.parse(curl(`https://cyprusnow.app/api/events?city=${city}&limit=200`)); } catch (e) { console.log(city, 'ERR', e.message); continue; }
  const evs = data?.events || [];
  total += evs.length;
  for (const ev of evs) {
    const title = String(ev.title || ev.name || '').trim();
    const start = String(ev.start_at || ev.start_date || '').slice(0, 10);
    const url = ev.url || (ev.slug ? `https://cyprusnow.app/event/${ev.slug}` : null);
    const dupKey = keys.has(normKey(title, start));
    const dupPage = url && websites.has(String(url).trim());
    if (dupKey) byKey++;
    if (dupPage && !dupKey) { byPage++; hitsByPage.push({ city, url, title, start }); }
    else if (dupPage) byPage++;
  }
}
console.log(`записей в ленте (7 городов): ${total}`);
console.log(`уже в базе по ключу title|start_date: ${byKey}`);
console.log(`уже в базе по СТРАНИЦЕ источника: ${byPage}`);
for (const h of hitsByPage.slice(0, 10)) console.log('   новая страховка спасла бы:', h.city, h.start, '|', h.title.slice(0, 60), '|', h.url.slice(0, 90));
