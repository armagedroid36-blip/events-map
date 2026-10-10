// Глобальная проверка страховки сборщика из 154 (сверка по website) на СЕРИЯХ:
// ищем записи ленты Cyprus Now, чья страница уже есть в базе, но НИ ОДНА карточка
// с этой страницей не стоит на ту же дату (±1 день, поле ленты UTC против локальной
// даты карточки) — это была бы потеря данных, а не спасение.
// Запуск: node --env-file=.env scripts/dot-cn-page-skip-loss-check.mjs
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
import { execFileSync } from 'node:child_process';

const PROXY = process.env.PROXY === '0' ? null : 'http://127.0.0.1:10809';
function curl(url) {
  const a = ['-s', '--max-time', '40']; if (PROXY) a.push('-x', PROXY); a.push(url);
  return execFileSync('curl', a, { encoding: 'utf8', maxBuffer: 60 * 1024 * 1024 });
}
const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
const rows = await selectAll(db, 'events', 'title, start_date, website, status');
const byPage = new Map();
for (const r of rows) { const w = (r.website || '').trim(); if (!w) continue; if (!byPage.has(w)) byPage.set(w, []); byPage.get(w).push(r); }

const dayDiff = (a, b) => Math.abs((Date.parse(String(a).slice(0, 10)) - Date.parse(String(b).slice(0, 10))) / 86400000);
let total = 0; let onPage = 0; let lossy = 0;
const losses = [];
for (const city of ['famagusta', 'protaras', 'paralimni', 'larnaca', 'paphos', 'limassol', 'nicosia']) {
  let data = null;
  try { data = JSON.parse(curl(`https://cyprusnow.app/api/events?city=${city}&limit=200`)); } catch (e) { console.log(city, 'ERR', e.message); continue; }
  for (const ev of (data?.events || [])) {
    total++;
    const url = (ev.url || (ev.slug ? `https://cyprusnow.app/event/${ev.slug}` : '')).trim();
    const start = String(ev.start_at || ev.start_date || '').slice(0, 10);
    const cards = byPage.get(url);
    if (!cards) continue;
    onPage++;
    const near = cards.some((c) => dayDiff(c.start_date, start) <= 1);
    if (!near) { lossy++; losses.push({ city, url, start, titles: cards.map((c) => `${c.start_date.slice(0, 10)}/${c.status}`).join(' ') }); }
  }
}
console.log(`записей в ленте (7 городов): ${total}`);
console.log(`страница уже в базе (страховка 154 пропустит): ${onPage}`);
console.log(`из них БЕЗ карточки на ту же дату (±1 день) — кандидаты в потерю: ${lossy}`);
for (const l of losses.slice(0, 15)) console.log('  ПОТЕРЯ?', l.city, l.start, '|', l.url.slice(0, 80), '|', l.titles);
