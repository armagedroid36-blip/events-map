// dot-same-site-dupe-probe.mjs — перепись подкласса «две живые карточки с ОДНИМ website»
// (два слага одной страницы источника: связка «разные website» такие пары не видит).
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });
const rows = await selectAll(db, 'events', 'id,title,start_date,start_time,city,lat,lng,website,status');
const live = rows.filter((r) => r.status === 'active' && r.website);
const byUrl = new Map();
for (const r of live) byUrl.set(r.website, [...(byUrl.get(r.website) || []), r]);
const groups = [...byUrl.entries()].filter(([, v]) => v.length > 1);
console.log(`живых со ссылкой: ${live.length}; страниц с 2+ живыми карточками: ${groups.length}`);
const near = (a, b, c, d) => Math.abs(Number(a) - b) < 0.0015 && Math.abs(Number(c) - d) < 0.0015;
let sameEvent = 0;
for (const [url, v] of groups) {
  const sameDate = new Set(v.map((r) => r.start_date)).size === 1;
  const sameTime = new Set(v.map((r) => r.start_time || '')).size === 1;
  const samePoint = v.every((r) => near(r.lat, v[0].lat, r.lng, v[0].lng));
  const strong = sameDate && sameTime && samePoint;
  if (strong) sameEvent++;
  console.log(`\n${strong ? '[ДУБЛЬ]' : '[разные события]'} ${url}`);
  for (const r of v) console.log(`   ${r.id.slice(0, 8)} | ${r.start_date} ${r.start_time} | ${r.lat},${r.lng} | ${r.title.slice(0, 60)}`);
}
console.log(`\nИтог: групп ${groups.length}, из них одно событие двумя карточками: ${sameEvent}`);
