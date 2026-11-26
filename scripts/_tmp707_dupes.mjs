// run 707: снятие кросс-источниковых дублей bz(RU) ↔ CN, найденных зондом dot-cross-source-dupe-probe.
// Страховки на каждую пару: обе строки active, одна и та же start_date и start_time, пины < 150 м,
// снимаемая карточка — с cyprusnow.app. DRY по умолчанию, APPLY=1 применяет.
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const db = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });
const APPLY = process.env.APPLY === '1';

// [оставить (канон bz RU), снять (CN-копия)]
const PAIRS = [
  ['0a1a5b6a', 'c3f962cb', '«A Lie of the Mind»: bz /3aa3 «Одна ошибка разума» ↔ CN «ένα ψέμα του μυαλού»'],
  ['46b40644', '3a8400bb', 'Lefkara Classic: bz /3a96 ↔ CN lefkara-classic-endurance-cycling'],
  ['6fc973b5', 'cebcac63', 'Christos Thivaios 30 лет: bz /3961 ↔ CN ο-χρήστος-θηβαίος'],
  ['e89ec491', 'f4986ecf', '«Οι τρίπλαροι τζαι ο δράκος της Μηλιάς»: bz /3b11 ↔ CN'],
  ['d7d8c951', '26eeea1a', '3-й Гала-концерт Паллас: bz /3b13 ↔ CN prize-winners-gala-concert'],
  ['abf45a48', '9b7031bd', 'Праздник грибов в Спилии: bz /3832 ↔ CN 8η-παγκύπρια-γιορτή-μανιταριού'],
];

const all = await selectAll(db, 'events', 'id,title,city,address,lat,lng,start_date,start_time,status,website');
const byPrefix = (p) => all.filter((r) => r.id.startsWith(p));
const dist = (a, b) => {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
};

const drop = [];
for (const [keepP, dropP, note] of PAIRS) {
  const k = byPrefix(keepP)[0], d = byPrefix(dropP)[0];
  if (!k || !d) { console.log(`SKIP ${note}: строка не найдена (${keepP}/${dropP})`); continue; }
  const problems = [];
  if (k.status !== 'active' || d.status !== 'active') problems.push(`статусы ${k.status}/${d.status}`);
  if (k.start_date !== d.start_date) problems.push(`даты ${k.start_date}/${d.start_date}`);
  if ((k.start_time || '') !== (d.start_time || '')) problems.push(`время ${k.start_time}/${d.start_time}`);
  const m = k.lat && d.lat ? Math.round(dist(k, d)) : null;
  if (m === null || m > 150) problems.push(`пины ${m} м`);
  if (!(d.website || '').includes('cyprusnow.app')) problems.push(`снимаемая не CN: ${d.website}`);
  console.log(`${problems.length ? 'ОТКАЗ' : 'OK'} ${note} | ${k.start_date} ${k.start_time} | ${m} м${problems.length ? ' | ' + problems.join('; ') : ''}`);
  if (!problems.length) drop.push(d.id);
}

console.log(`\nк снятию: ${drop.length}`);
if (APPLY && drop.length) {
  const { data, error } = await db.from('events')
    .update({ status: 'archived', auto_review: { verdict: 'reject', reason: 'duplicate', engine: 'dot-manual', note: 'run707: CN-копия того же события, что живая bz-карточка (одна дата/время, пины <150 м)' } })
    .in('id', drop).eq('status', 'active').select('id,title,status');
  if (error) { console.error('ОШИБКА', error.message); process.exit(1); }
  console.log('снято:', data.length);
  for (const r of data) console.log(' -', r.id.slice(0, 8), r.status, r.title.slice(0, 60));
}
