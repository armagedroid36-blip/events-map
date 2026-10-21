// dot-imminent-probe: карточки БЛИЖАЙШИХ 3 дней — что пользователь видит прямо сейчас.
// Печатает дефекты заполнения: без времени, без адреса, без гео, ссылка на корень, без ссылки.
// Использование: node --env-file=.env scripts/dot-imminent-probe.mjs [дней=3]
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
import { isRootUrl } from './site-url.mjs';

const db = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
const days = Number(process.argv[2] || 3);
const today = new Date().toISOString().slice(0, 10);
const lim = new Date(Date.now() + (days - 1) * 864e5).toISOString().slice(0, 10);

const rows = await selectAll(db, 'events', 'id,title,city,address,lat,lng,start_date,start_time,end_date,recurrence,website,photos,status', {
  filter: (q) => q.eq('status', 'active'),
});
const near = rows.filter((r) => {
  const inDates = r.start_date >= today && r.start_date <= lim;
  const recur = r.recurrence && r.start_date <= lim && (!r.end_date || r.end_date >= today);
  return inDates || recur;
});
const norm = (r) => {
  const d = [];
  if (!r.start_time) d.push('нет времени');
  if (!r.address) d.push('нет адреса');
  if (!r.lat || !r.lng) d.push('нет гео');
  if (!r.website) d.push('нет ссылки');
  else if (isRootUrl(r.website)) d.push('ссылка на корень');
  if (!r.photos || (Array.isArray(r.photos) && r.photos.length === 0)) d.push('нет фото');
  return d;
};
const byCity = {};
for (const r of near) byCity[r.city] = (byCity[r.city] || 0) + 1;
console.log(`окно ${today} → ${lim}: карточек ${near.length}`);
console.log(Object.entries(byCity).sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c}: ${n}`).join(' | '));
const defects = near.map((r) => ({ r, d: norm(r) })).filter((x) => x.d.length);
console.log(`с дефектами заполнения: ${defects.length}`);
for (const { r, d } of defects.slice(0, 25)) {
  console.log(`- ${r.id.slice(0, 8)} ${r.start_date} ${r.start_time || '--:--'} | ${r.city} | ${(r.title || '').slice(0, 55)} | ${d.join(', ')}`);
}
