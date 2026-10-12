// Точка «События»: класс «одна площадка, две метки города» в живых кипрских карточках (только чтение).
// Признак: одинаковый адрес (площадка) + >1 различных значения city.
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const db = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });
const rows = await selectAll(db, 'events', 'id,status,city,address,lat,lng,start_date,website,title');
const live = rows.filter((r) => ['active', 'moderation'].includes(r.status) && /кипр/i.test(r.city || '') && r.address);
const byAddr = new Map();
for (const r of live) {
  const key = `${String(r.address).trim().toLowerCase()}|${Number(r.lat).toFixed(4)},${Number(r.lng).toFixed(4)}`;
  if (!byAddr.has(key)) byAddr.set(key, []);
  byAddr.get(key).push(r);
}
let groups = 0;
for (const [key, list] of byAddr) {
  const cities = [...new Set(list.map((r) => r.city))];
  if (cities.length < 2) continue;
  groups += 1;
  console.log(`РАСЩЕПЛЕНИЕ (${list.length} карточек): ${key}`);
  console.log(`  метки: ${cities.join(' | ')}`);
  for (const r of list) console.log(`   ${r.id.slice(0, 8)} [${r.status}] ${r.start_date} ${r.city} | ${(r.title || '').slice(0, 60)}`);
}
console.log(`живых кипрских с адресом: ${live.length}; групп «одна площадка — разные city»: ${groups}`);
