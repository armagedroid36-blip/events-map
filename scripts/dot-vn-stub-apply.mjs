// Точечная установка проверенных координат карточкам-заглушкам Вьетнама.
// Источник координат — OSM (Nominatim), адрес источника обязан совпасть: улица+номер.
// APPLY=1 — писать. node --env-file=.env scripts/dot-vn-stub-apply.mjs
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const APPLY = process.env.APPLY === '1';
const db = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });

// id8 -> проверенный объект OSM (name+улица из адреса источника совпадают)
const FIX = {
  '66a73436': { lat: 12.237626, lng: 109.195925, why: 'OSM: M-Bar Sushi, 16 Tôn Đản (адрес источника «M-Bar Sushi (Maple Hotel 25 этаж), 16 Tôn Đản…»)' },
  'fdf56fce': { lat: 16.025438, lng: 108.21956, why: 'OSM: Đường Cách Mạng Tháng Tám, Phường Hòa Cường (адрес источника «2 Cach Mang Thang Tam, Hoa Cuong Nam»); уровень улицы, не дома' },
};
const dist = (a, b, c, d) => { const R = 6371, t = Math.PI / 180; const x = Math.sin(((c - a) * t) / 2) ** 2 + Math.cos(a * t) * Math.cos(c * t) * Math.sin(((d - b) * t) / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };

const all = await selectAll(db, 'events', 'id,title,title_ru,city,address,lat,lng,status');
let done = 0;
for (const [id8, f] of Object.entries(FIX)) {
  const hits = all.filter((r) => r.id.startsWith(id8));
  if (hits.length !== 1) { console.log(`! ${id8}: найдено ${hits.length}`); continue; }
  const r = hits[0];
  const km = dist(r.lat, r.lng, f.lat, f.lng);
  console.log(`${id8} ${r.status} ${r.city} | ${(r.title_ru || r.title).slice(0, 40)} | сдвиг ${(km * 1000) | 0} м (${km.toFixed(2)} км)`);
  console.log(`   почему: ${f.why}`);
  if (km < 0.2) { console.log('   уже на месте'); continue; }
  if (APPLY) {
    const { data, error } = await db.from('events').update({ lat: f.lat, lng: f.lng }).eq('id', r.id).select('id,lat,lng');
    if (error || !data?.length) { console.log(`   ОШИБКА: ${error?.message || '0 строк'}`); continue; }
    console.log(`   записано: ${data[0].lat},${data[0].lng}`);
    done++;
  }
}
console.log(`Итог: применено ${done}${APPLY ? '' : ' (DRY)'}`);
