// Зонд лида 157: серия Leptos у Cyprus Now — одна страница на серию,
// в базе 4 живые карточки с суффиксными URL. Проверяем, не режет ли новая
// страховка сборщика (сверка по website) НОВЫЕ дни серии.
// Запуск: node --env-file=.env scripts/dot-cy-leptos-series-probe.mjs
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
import { execFileSync } from 'node:child_process';

const PROXY = process.env.PROXY === '0' ? null : 'http://127.0.0.1:10809';
function curl(url) {
  const args = ['-s', '--max-time', '40'];
  if (PROXY) args.push('-x', PROXY);
  args.push(url);
  return execFileSync('curl', args, { encoding: 'utf8', maxBuffer: 60 * 1024 * 1024 });
}

const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
const rows = await selectAll(db, 'events', 'id, title, title_ru, start_date, start_time, status, city, website, address');
const lept = rows.filter((r) => /leptos|лептос|4-day|4 day/i.test(`${r.title || ''} ${r.title_ru || ''}`));
console.log(`=== БАЗА: строк по Leptos ${lept.length}`);
for (const r of lept) {
  console.log(` ${r.status.padEnd(12)} ${String(r.start_date).slice(0, 10)} ${r.start_time || '--:--'} | ${String(r.title).slice(0, 55)} | ${r.city} | ${r.website}`);
}

console.log('\n=== ЛЕНТА Cyprus Now: поиск q=leptos');
for (const q of ['leptos', 'Leptos']) {
  let data = null;
  try { data = JSON.parse(curl(`https://cyprusnow.app/api/events?q=${encodeURIComponent(q)}`)); }
  catch (e) { console.log(q, 'ERR', e.message); continue; }
  const evs = data?.events || [];
  console.log(` q=${q}: ${evs.length}`);
  for (const ev of evs) {
    console.log('  -', String(ev.title || '').slice(0, 60), '|', ev.start_at, '->', ev.end_at,
      '| slug', ev.slug, '| series_id', ev.series_id, 'count', ev.series_count, 'first', ev.series_first, 'last', ev.series_last,
      '| venue', ev.venue?.name, '| url', ev.url);
  }
}

console.log('\n=== живые с той же страницей по префиксу /event/ (для Leptos-страниц)');
const live = rows.filter((r) => r.status === 'active' && r.website);
const byPage = new Map();
for (const r of live) { const k = r.website; if (!byPage.has(k)) byPage.set(k, []); byPage.get(k).push(r); }
for (const [k, v] of byPage) if (/leptos/i.test(k)) console.log('  стр.', k, '->', v.length, v.map((x) => x.start_date.slice(0, 10)).join(','));
