import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
const rows = await selectAll(db, 'events', 'id,title_ru,title,city,address,lat,lng,start_date,website,source_type',
  (q) => q.eq('status', 'active'));
const no = rows.filter((e) => !e.address);
console.log('active без адреса:', no.length);
const byCoord = new Map();
for (const e of no) {
  const k = `${e.city} | ${Number(e.lat).toFixed(5)},${Number(e.lng).toFixed(5)}`;
  byCoord.set(k, (byCoord.get(k) || 0) + 1);
}
console.log('уникальных пар (город|координата):', byCoord.size);
for (const [k, v] of [...byCoord.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(`  ${v}\t${k}`);
console.log('--- примеры кипрских карточек без адреса:');
for (const e of no.filter((e) => /кипр/i.test(e.city || '')).slice(0, 8))
  console.log(`  ${e.id.slice(0, 8)} | ${e.city} | ${Number(e.lat).toFixed(5)},${Number(e.lng).toFixed(5)} | ${e.start_date} | ${(e.website || '').slice(0, 70)}`);
