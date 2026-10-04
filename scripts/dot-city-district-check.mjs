// Класс «city не совпадает с округом координат» у кипрских active-карточек.
// 1) кандидаты — карточки дальше 18 км от центра своего города;
// 2) для кандидатов обратный геокодер Nominatim → округ (state_district) → канон city;
// 3) APPLY=1 — записать исправление city там, где округ реально другой.
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const APPLY = process.env.APPLY === '1';
const MAX_GEO = Number(process.env.MAX_GEO || 45);
const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);

const CENTERS = {
  'Лимасол, Кипр': [34.7071, 33.0226],
  'Никосия, Кипр': [35.1856, 33.3823],
  'Ларнака, Кипр': [34.9182, 33.6199],
  'Пафос, Кипр': [34.7754, 32.4245],
  'Ая-Напа, Кипр': [34.9889, 34.0017],
  'Фамагуста, Кипр': [35.1240, 33.9414],
  'Паралимни, Кипр': [35.0395, 33.9842],
  'Протарас, Кипр': [35.0130, 34.0528],
  'Полис, Кипр': [35.0354, 32.4257],
};
// округ (греч. state_district) -> русский канон
const DISTRICT = {
  'Λευκωσία': 'Никосия, Кипр',
  'Λάρνακα': 'Ларнака, Кипр',
  'Λεμεσός': 'Лимасол, Кипр',
  'Πάφος': 'Пафос, Кипр',
  'Αμμόχωστος': 'Фамагуста, Кипр',
  'Κερύνεια': 'Кирения, Кипр',
};
const dist = (a, b, c, d) => Math.hypot((a - c) * 111, (b - d) * 111 * Math.cos((a * Math.PI) / 180));

const rows = await selectAll(db, 'events', 'id,title,title_ru,city,address,lat,lng,status');
const cyprus = rows.filter((r) => r.status === 'active' && CENTERS[r.city] && r.lat && r.lng);
const cands = cyprus
  .map((r) => ({ ...r, km: dist(r.lat, r.lng, CENTERS[r.city][0], CENTERS[r.city][1]) }))
  .filter((r) => r.km > 18)
  .sort((a, b) => b.km - a.km);
console.log('active Кипр', cyprus.length, '| кандидатов (дальше 18 км от центра города)', cands.length);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fixes = [];
const t0 = Date.now();
for (const r of cands.slice(0, MAX_GEO)) {
  if (Date.now() - t0 > 100000) { console.log('бюджет времени исчерпан, геокодено', fixes.length); break; }
  let j = null;
  for (let a = 0; a < 2 && !j; a++) {
    try {
      const u = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=12&lat=${r.lat}&lon=${r.lng}`;
      const resp = await fetch(u, { headers: { 'user-agent': 'events-map-dot/1.0 (armagedroid@yandex.ru)' }, signal: AbortSignal.timeout(12000) });
      j = await resp.json();
    } catch (e) { console.log(r.id.slice(0, 8), 'ошибка', String(e).slice(0, 50)); }
    if (!j) await sleep(1200);
  }
  if (!j?.address) { console.log(r.id.slice(0, 8), 'геокодер пусто'); await sleep(1100); continue; }
  const a = j.address;
  const sd = a.state_district || a.state || '';
  const key = Object.keys(DISTRICT).find((k) => sd.includes(k));
  const canon = key ? DISTRICT[key] : null;
  const village = a.village || a.town || a.city || (j.display_name || '').split(',')[0];
  const bad = canon && canon !== r.city;
  console.log(r.id.slice(0, 8), '|', r.city, '->', canon || ('?' + sd), '|', village, '|', r.km.toFixed(1) + ' км', bad ? '  << ИСПРАВИТЬ' : '');
  if (bad) fixes.push({ id: r.id, city: canon, old: r.city, village });
  await sleep(1100);
}
console.log('к исправлению:', fixes.length);
for (const f of fixes) console.log('  ', f.id.slice(0, 8), f.old, '->', f.city, '(', f.village, ')');
if (APPLY) {
  for (const f of fixes) {
    const res = await db.from('events').update({ city: f.city }).eq('id', f.id).select('id,city');
    if (res.error || !res.data?.length) console.log('ОШИБКА', f.id.slice(0, 8), res.error?.message || 'нет строк');
    else console.log('записано', f.id.slice(0, 8), res.data[0].city);
  }
}
