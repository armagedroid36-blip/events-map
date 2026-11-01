// dot-events: перепись пинов Бали — (1) фолбэк на центр острова/района, (2) пин далеко от центра своего района.
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
import { BALI_DISTRICT_CENTERS, DISTRICTS_RU } from './bali-districts.mjs';

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE);

const ISLAND = { lat: -8.4095, lng: 115.1889 };
const R = 6371;
const dist = (aLat, aLng, bLat, bLng) => {
  const dLat = (bLat - aLat) * Math.PI / 180, dLng = (bLng - aLng) * Math.PI / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * Math.PI / 180) * Math.cos(bLat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
};

// RU-метка -> латинский ключ центра
const ruToKey = {};
for (const [key, ru] of Object.entries(DISTRICTS_RU)) ruToKey[ru] = key;

const rows = await selectAll(db, 'events', 'id,status,city,title,address,lat,lng,start_date,website', {
  filter: (q) => q.like('city', '%Bali%').eq('status', 'active'),
});
console.log(`активных Бали: ${rows.length}`);

let onIsland = 0, noGeo = 0;
const far = [], unknownCity = new Set();
for (const r of rows) {
  if (r.lat == null || r.lng == null) { noGeo++; continue; }
  if (dist(r.lat, r.lng, ISLAND.lat, ISLAND.lng) < 0.15) onIsland++;
  const label = (r.city || '').replace(/,\s*Bali\s*$/i, '').trim();
  const key = ruToKey[label];
  if (!key) { unknownCity.add(label); continue; }
  const c = BALI_DISTRICT_CENTERS[key];
  if (!c) continue;
  const d = dist(r.lat, r.lng, c.lat, c.lng);
  if (d > 15) far.push({ ...r, d, key });
}
console.log(`без координат: ${noGeo}; на центре острова: ${onIsland}`);
console.log(`метки без латинского ключа (${unknownCity.size}): ${[...unknownCity].join(', ') || '-'}`);
far.sort((a, b) => b.d - a.d);
console.log(`пин дальше 15 км от центра своей метки: ${far.length}`);
for (const r of far) console.log(`  ${r.id.slice(0, 8)} | ${r.key} ${r.d.toFixed(1)} км | ${r.start_date} | ${r.title.slice(0, 45)} | ${r.city} | ${(r.address || '-').slice(0, 55)}`);
