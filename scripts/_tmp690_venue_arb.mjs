// Зонд 690: для кандидатов пин-переписи ищем двойников по площадке в живой базе.
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const db = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });

const NEEDLES = [
  'PASYDY', 'Караолис', 'Elyssia', 'Meltemi', 'Savino', 'Koumi', 'Common Room',
  'Муниципальный театр Никосии', 'Municipal Theatre', 'Sotira', 'Сотия', 'Сотира',
];

const dist = (a, b, c, d) => {
  const R = 6371000, r = Math.PI / 180;
  const dLat = (c - a) * r, dLng = (d - b) * r;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(s)));
};

const rows = await selectAll(db, 'events', 'id,title,city,address,lat,lng,start_date', { filter: q => q.eq('status', 'active') });
console.log('живых', rows.length);

for (const n of NEEDLES) {
  const low = n.toLowerCase();
  const hit = rows.filter(r => ((r.address || '') + ' ' + (r.title || '')).toLowerCase().includes(low));
  console.log(`\n== ${n}: ${hit.length}`);
  for (const r of hit.slice(0, 14)) {
    console.log(`   ${r.id.slice(0, 8)} | ${r.city} | ${r.start_date} | ${r.lat},${r.lng} | ${r.address} | ${r.title.slice(0, 55)}`);
  }
  // пары точек с расхождением > 300 м
  for (let i = 0; i < hit.length; i++) for (let j = i + 1; j < hit.length; j++) {
    const a = hit[i], b = hit[j];
    if (a.lat == null || b.lat == null) continue;
    const d = dist(+a.lat, +a.lng, +b.lat, +b.lng);
    if (d > 300) console.log(`   РАСХОЖДЕНИЕ ${d} м: ${a.id.slice(0, 8)} (${a.city}) ↔ ${b.id.slice(0, 8)} (${b.city})`);
  }
}
