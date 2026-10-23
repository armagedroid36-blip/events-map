// Перепись пинов кипрских карточек: совпадает ли округ ТОЧКИ с округом МЕТКИ города.
// Класс «пин уехал в другой округ» дедуп и оконные проверки не видят: карточка живая,
// координаты есть, но точка стоит не там, где заявлен город (частая причина — embed/геокодер
// увёл в дефолт сайта или пин остался от чужой площадки).
//
// Запуск: node --env-file=.env scripts/dot-cy-pin-census.mjs
// Только чтение. Нормы: PIN_OTHER_DISTRICT 0, PIN_OUTSIDE 0.
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
import { CY_CITY_CENTERS, districtOf, districtOfCity, districtNear, km } from './cy-districts.mjs';

const db = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);

const rows = await selectAll(db, 'events',
  'id, title, city, address, lat, lng, start_date, website, status',
  { filter: (q) => q.eq('status', 'active') });

const cy = rows.filter((r) => /,\s*кипр\s*$/i.test(String(r.city || '')));
const centers = CY_CITY_CENTERS.map(([name, lat, lng]) => ({ name, lat, lng }));

let noCoords = 0, outside = 0, otherDistrict = 0, noCityKey = 0;
const bad = [];
const far = [];

for (const r of cy) {
  const lat = Number(r.lat), lng = Number(r.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) { noCoords++; continue; }
  const labelDistrict = districtOfCity(r.city);
  if (!labelDistrict) noCityKey++;
  const pinDistrict = districtOf(lat, lng) || districtNear(lat, lng);
  if (!pinDistrict) { outside++; bad.push({ kind: 'вне острова', id: r.id, city: r.city, lat, lng, title: r.title }); continue; }
  if (labelDistrict && pinDistrict !== labelDistrict) {
    otherDistrict++;
    const own = centers.find((c) => c.name === String(r.city).replace(/,\s*кипр/gi, '').trim());
    const d = own ? km(lat, lng, own.lat, own.lng) : null;
    bad.push({ kind: 'другой округ', id: r.id, city: r.city, pinDistrict, lat, lng, kmFromLabel: d && +d.toFixed(1), title: r.title, address: r.address, website: r.website, start_date: r.start_date });
  }
  const near = Math.min(...centers.map((c) => km(lat, lng, c.lat, c.lng)));
  if (near > 40) far.push({ id: r.id, city: r.city, kmToNearestCity: +near.toFixed(1), title: r.title });
}

console.log(`Кипр активных: ${cy.length}; без координат ${noCoords}; метка без округа ${noCityKey}`);
console.log(`НОРМА PIN_OUTSIDE 0 -> ${outside}; НОРМА PIN_OTHER_DISTRICT 0 -> ${otherDistrict}; пин >40 км от любого города (деревни) ${far.length}`);
for (const b of bad.slice(0, 25)) console.log(JSON.stringify(b));
if (far.length) { console.log('--- далеко от городов (инфо) ---'); for (const f of far.slice(0, 15)) console.log(JSON.stringify(f)); }
