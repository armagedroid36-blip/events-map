// dot-cy-center-cands.mjs — кипрские active-карточки РОВНО на центровой точке города,
// но с адресом, который называет конкретную площадку/улицу (не только город).
// Кандидаты на пин по Nominatim/OSM. Только чтение.
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });
const rows = await selectAll(db, 'events', 'id,title,title_ru,city,address,lat,lng,status,start_date,website');

const CENTERS = {
  '34.7071,33.0226': 'Лимасол',
  '34.9182,33.6194': 'Ларнака',
  '35.1856,33.3823': 'Никосия',
  '34.7754,32.4245': 'Пафос',
  '35.0375,34.0041': 'Ая-Напа',
  '35.1167,33.9432': 'Фамагуста',
};

const isCenter = (lat, lng) => CENTERS[String(Number(lat)) + ',' + String(Number(lng))];
const CITY_WORDS = /^(лимасол|ларнака|никосия|пафос|ая-напа|ая напа|фамагуста|протарас|паралимни|полис|кирения|limassol|larnaca|nicosia|paphos|ayia napa|famagusta|cyprus|кипр)\b/i;

const cands = [];
const counts = {};
for (const r of rows) {
  if (r.status === 'archived') continue;
  const c = isCenter(r.lat, r.lng);
  if (!c) continue;
  counts[c] = (counts[c] || 0) + 1;
  const addr = (r.address || '').trim();
  if (!addr) continue;
  // адрес уровня города (первое слово — сам город) → честный центр, не кандидат
  const first = addr.split(/[,;]/)[0].trim();
  if (CITY_WORDS.test(first)) continue;
  if (addr.length < 8) continue;
  cands.push({ id: r.id.slice(0, 8), city: r.city, d: r.start_date, t: (r.title_ru || r.title || '').slice(0, 55), addr: addr.slice(0, 90), site: (r.website || '').slice(0, 70) });
}
console.log('на центровых точках (active, по городам):', JSON.stringify(counts));
console.log('кандидатов (адрес не уровня города):', cands.length);
for (const x of cands) console.log(`${x.id} | ${x.city} | ${x.d} | ${x.t} | ${x.addr} | ${x.site}`);
