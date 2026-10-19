// Зонд: пин балийской карточки не соответствует её району.
// 1) инвариант «каждый канон района имеет центр» (missingCenterLabels)
// 2) живые карточки Bali: расстояние пина до центра своего района; флагуем >= 30 км
// READ-ONLY.
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
import { BALI_DISTRICT_CENTERS, missingCenterLabels } from './bali-districts.mjs';

const db = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE
);

console.log('районов с центром:', Object.keys(BALI_DISTRICT_CENTERS).length);
try {
  console.log('без центра:', JSON.stringify(missingCenterLabels()));
} catch (e) {
  console.log('missingCenterLabels упал:', e.message);
}

const rows = await selectAll(db, 'events', 'id,title,city,address,lat,lng,status,start_date', {
  filter: (q) => q.in('status', ['active', 'moderation']),
});
const bali = rows.filter((r) => /bali/i.test(`${r.city || ''} ${r.address || ''}`));
console.log('живых Бали:', bali.length);

const R = 6371;
const dist = (a, b, c, d) => {
  const r = Math.PI / 180;
  const dLat = (c - a) * r, dLng = (d - b) * r;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
};

const noCenter = [];
const far = [];
for (const ev of bali) {
  const name = String(ev.city || '').split(',')[0].trim().toLowerCase();
  const c = BALI_DISTRICT_CENTERS[name];
  if (!c) { noCenter.push(ev); continue; }
  if (ev.lat == null || ev.lng == null) continue;
  const d = dist(ev.lat, ev.lng, c[0], c[1]);
  if (d >= 30) far.push({ ev, d: Math.round(d) });
}
console.log('городов без центра:', noCenter.length);
for (const ev of noCenter.slice(0, 20)) console.log(`  ? ${ev.id} | ${ev.city} | ${ev.start_date} | ${String(ev.title).slice(0, 50)}`);
console.log('пин >=30 км от центра района:', far.length);
for (const { ev, d } of far.slice(0, 25)) {
  console.log(`  ! ${ev.id} | ${ev.city} | ${d} км | ${ev.lat},${ev.lng} | ${ev.start_date} | ${String(ev.title).slice(0, 50)}`);
}
