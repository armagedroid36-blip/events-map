import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });
const rows = (await selectAll(db, 'events', 'id,title,start_date,start_time,city,address,lat,lng,website,status,source_type,photos'))
  .filter((r) => r.status === 'active' || r.status === 'moderation');
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-zа-я0-9]+/gi, ' ').trim();
const groups = new Map();
for (const r of rows) {
  if (r.lat == null || r.lng == null) continue;
  const k = `${r.start_date}|${Number(r.lat).toFixed(3)},${Number(r.lng).toFixed(3)}`;
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(r);
}
let n = 0;
for (const [k, g] of groups) {
  if (g.length < 2) continue;
  const sameTime = g.filter((r) => (r.start_time || '') === (g[0].start_time || ''));
  if (sameTime.length < 2) continue;
  const titles = new Set(g.map((r) => norm(r.title)));
  if (titles.size === 1) continue;
  n++;
  console.log(`[${k}] time=${g[0].start_time}`);
  for (const r of g) console.log(`   ${String(r.id).slice(0,8)} | ${r.status} | ${r.title.slice(0,70)} | ${r.city} | ${(r.address||'—').slice(0,50)} | ${r.website||'—'} | фото ${(r.photos||[]).length}`);
}
console.log(`\nживых ${rows.length}; групп с одинаковым ВРЕМЕНЕМ — ${n}`);
