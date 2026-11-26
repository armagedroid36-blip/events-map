// Зонд 671: кросс-языковые дубли — одна дата+время+город, пины <200 м (общих слов может не быть).
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const db = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
const rows = await selectAll(db, 'events', 'id,title,title_ru,start_date,start_time,city,address,lat,lng,website,source_type', {
  order: 'start_date', ascending: true,
  filter: (q) => q.eq('status', 'active').not('lat', 'is', null),
});
console.log('живых с гео', rows.length);

const km = (a, b) => {
  const R = 6371, dLat = (b.lat - a.lat) * Math.PI / 180, dLng = (b.lng - a.lng) * Math.PI / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
};

const groups = new Map();
for (const r of rows) {
  const key = `${r.start_date}|${r.start_time || '-'}|${String(r.city || '').slice(0, 6).toLowerCase()}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(r);
}

let pairs = 0;
for (const [key, list] of groups) {
  if (list.length < 2) continue;
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const d = km(list[i], list[j]);
    if (d > 0.2) continue;
    pairs++;
    console.log(`\n-- ${key} | ${Math.round(d * 1000)} м`);
    for (const r of [list[i], list[j]]) {
      console.log(`   ${r.id.slice(0, 8)} [${r.source_type}] ${r.title_ru || r.title} | ${r.start_time} | ${r.address} | ${r.lat},${r.lng} | ${r.website}`);
    }
  }
}
console.log('\nпар <200 м:', pairs);
