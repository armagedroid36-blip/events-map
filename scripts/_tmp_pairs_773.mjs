import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
const db = createClient(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
const SINCE = '2026-11-07T16:40:48Z';
const win = (await selectAll(db, 'events', 'id,title,status,city,address,start_date,start_time,lat,lng,website', { filter: q => q.gte('created_at', SINCE).eq('status', 'active') }));
const live = await selectAll(db, 'events', 'id,title,status,city,address,start_date,start_time,lat,lng,website', { filter: q => q.eq('status', 'active') });
const winIds = new Set(win.map(r => r.id));
const dist = (a, b) => {
  const R = 6371000, t = x => x * Math.PI / 180;
  const dLa = t(b[0] - a[0]), dLo = t(b[1] - a[1]);
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(t(a[0])) * Math.cos(t(b[0])) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
let n = 0;
for (const w of win) {
  for (const l of live) {
    if (l.id === w.id || winIds.has(l.id)) continue;
    if (l.start_date !== w.start_date) continue;
    if (w.lat == null || l.lat == null) continue;
    if (dist([w.lat, w.lng], [l.lat, l.lng]) > 300) continue;
    const tOk = !w.start_time || !l.start_time || w.start_time.slice(0, 5) === l.start_time.slice(0, 5);
    if (!tOk) continue;
    n++;
    console.log('PAIR', w.id.slice(0, 8), JSON.stringify(w.title).slice(0, 70), w.start_time, w.city, '||', l.id.slice(0, 8), l.status, JSON.stringify(l.title).slice(0, 70), l.start_time, l.city, '| m=', Math.round(dist([w.lat, w.lng], [l.lat, l.lng])));
  }
}
console.log('pairs:', n);
