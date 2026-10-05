// Живые копии одной страницы Cyprus.BZ: канонический ключ → сколько active/moderation.
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
import { canonBzPage } from './collect-cyprus.mjs';

const db = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });
const rows = await selectAll(db, 'events', 'id,status,website,title,start_date,start_time,city,address,lat,lng,photos,created_at');
const groups = new Map();
for (const r of rows) {
  const k = canonBzPage(r.website);
  if (!k) continue;
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(r);
}
let n = 0;
for (const [k, list] of groups) {
  const live = list.filter((r) => r.status === 'active' || r.status === 'moderation');
  if (live.length < 2) continue;
  n++;
  console.log(`\n${k} — живых ${live.length} из ${list.length}`);
  for (const r of live) {
    console.log(`   ${r.id.slice(0, 8)} [${r.status}] ${r.start_date} ${r.start_time || '--:--'} ${r.city} | фото ${(r.photos || []).length} | гео ${r.lat != null ? r.lat.toFixed(4) + ',' + r.lng.toFixed(4) : 'НЕТ'} | ${r.start_date} | ${(r.title || '').slice(0, 34)} | ${r.website}`);
  }
}
console.log(`\nИтого групп с >=2 живыми: ${n}`);
