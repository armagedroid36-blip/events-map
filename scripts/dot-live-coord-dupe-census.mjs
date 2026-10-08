// dot-live-coord-dupe-census.mjs — читающий зонд: живые карточки, стоящие НА ОДНОЙ точке
// (округление 3 знака ≈ 100 м) в один день и в одном городе, но с разными названиями —
// класс «одно событие собрано из разных источников» (ключ дедупа title|start_date их не склеивает).
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });
const rows = (await selectAll(db, 'events', 'id,title,start_date,start_time,city,address,lat,lng,website,status,source_type,photos,description'))
  .filter((r) => r.status === 'active' || r.status === 'moderation');

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-zа-я0-9]+/gi, ' ').trim();
const groups = new Map();
for (const r of rows) {
  if (r.lat == null || r.lng == null) continue;
  const k = `${r.start_date}|${norm(r.city)}|${Number(r.lat).toFixed(3)},${Number(r.lng).toFixed(3)}`;
  (groups.get(k) || groups.set(k, []).get(k)).push(r);
}

let dupGroups = 0, cards = 0, sameTitle = 0;
for (const [k, g] of groups) {
  if (g.length < 2) continue;
  const titles = new Set(g.map((r) => norm(r.title)));
  if (titles.size === 1) { sameTitle++; continue; }
  dupGroups++; cards += g.length;
  console.log(`\n[${k}] ${g.length} карточек:`);
  for (const r of g) console.log(`   ${String(r.id).slice(0, 8)} | ${r.status} | ${r.start_time || '--:--'} | ${r.title} | ${r.city} | ${r.address || '—'} | ${r.website || '—'}`);
}
console.log(`\nЖивых ${rows.length}; групп «одна точка + один день, разные названия» — ${dupGroups} (карточек ${cards}); групп с одинаковым названием (дедуп-ключ их видит) — ${sameTitle}`);
