// Точка «События»: КЛАСТЕРЫ ПО АДРЕСУ — часть карточек одного адреса стоит на центре города.
// Группировка живых карточек по нормализованному адресу; внутри группы — самая населённая точка;
// кандидат = карточка >400 м от этой точки И на центровой константе города (<=250 м). Только чтение.
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
import { CY_CITY_CENTERS } from './cy-districts.mjs';
import { BALI_DISTRICT_CENTERS } from './bali-districts.mjs';

const db = createClient(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
const rows = await selectAll(db, 'events', 'id,title,title_ru,city,address,lat,lng,status,start_date,start_time');

const CENTERS = [];
for (const [name, lat, lng] of CY_CITY_CENTERS) CENTERS.push({ name, lat, lng });
for (const [name, c] of Object.entries(BALI_DISTRICT_CENTERS)) CENTERS.push({ name, lat: c.lat, lng: c.lng });
CENTERS.push({ name: 'Нячанг', lat: 12.2388, lng: 109.1967 });
CENTERS.push({ name: 'Дананг', lat: 16.0544, lng: 108.2022 });

const R = 6371000;
const dist = (a, b) => {
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
};
const normAddr = (s) => String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/gi, ' ').replace(/\s+/g, ' ').trim();

const live = rows.filter((r) => r.status === 'active' && r.lat != null && r.lng != null);
const groups = new Map();
for (const r of live) {
  const a = normAddr(r.address);
  if (a.length < 12) continue; // адрес = только город/страна — не кластер
  if (!groups.has(a)) groups.set(a, []);
  groups.get(a).push(r);
}

let clusters = 0;
const out = [];
for (const [addr, list] of groups) {
  if (list.length < 2) continue;
  const pts = new Map();
  for (const r of list) {
    const k = r.lat.toFixed(4) + ',' + r.lng.toFixed(4);
    if (!pts.has(k)) pts.set(k, { lat: +r.lat.toFixed(4), lng: +r.lng.toFixed(4), n: 0 });
    pts.get(k).n += 1;
  }
  const sorted = [...pts.values()].sort((x, y) => y.n - x.n);
  const dom = sorted[0];
  if (dom.n < 2) continue; // нет «большинства на одной точке»
  const cand = list.filter((r) => dist(r, dom) > 400 && CENTERS.some((c) => dist(r, c) <= 250));
  if (!cand.length) continue;
  clusters += 1;
  out.push({ addr, total: list.length, dom, cand: cand.map((r) => ({ id: r.id.slice(0, 8), title: (r.title_ru || r.title || '').slice(0, 55), city: r.city, date: r.start_date, lat: r.lat, lng: r.lng, d: Math.round(dist(r, dom)) })) });
}

console.log(`ACTIVE с гео: ${live.length}; кластеров: ${clusters}`);
for (const c of out) {
  console.log(`\n# ${c.addr.slice(0, 70)} | карточек ${c.total}, доминирующая точка ${c.dom.lat},${c.dom.lng} (${c.dom.n})`);
  for (const x of c.cand) console.log(`  ${x.id} ${x.date} ${x.city} | ${x.title} | ${x.lat},${x.lng} | ${x.d} м`);
}
