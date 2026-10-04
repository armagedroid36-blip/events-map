// dot-events: компактный разбор мелких вариантов районов Бали (<=15 живых карточек).
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE);

const rows = await selectAll(db, 'events', 'id,status,city,title,address,lat,lng,start_date,website', {
  filter: (q) => q.like('city', '%Bali%').in('status', ['active', 'moderation', 'needs_changes']),
});
const byCity = {};
for (const r of rows) (byCity[r.city] = byCity[r.city] || []).push(r);
const small = Object.entries(byCity).filter(([, l]) => l.length <= 15).sort((a, b) => a[1].length - b[1].length);
for (const [c, list] of small) {
  console.log(`\n== ${c} — ${list.length}`);
  for (const r of list) console.log(`   ${r.status} ${r.id.slice(0, 8)} | ${r.start_date} | ${r.title.slice(0, 45)} | ${r.address} | ${r.lat},${r.lng} | ${(r.website || '').slice(0, 70)}`);
}
