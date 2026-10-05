// dot-cy-tennis-pin-fix.mjs — карточки турниров Famagusta Tennis Club (адрес клуба
// «3 Mesaorias Str, Лимасол»), стоящие на центровой точке Лимасола, → проверенные
// координаты площадки 34.6824125,33.0259269 (geo со страницы cyprusnow, run 39).
// Жёсткие условия: в адресе есть «Famagusta Tennis» или «Mesaorias» И карточка ровно на центровой.
// DRY по умолчанию; APPLY=1 — запись.
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const APPLY = process.env.APPLY === '1';
const LAT = 34.6824125, LNG = 33.0259269; // Famagusta Tennis Club, 3 Mesaorias Str (источник: cyprusnow geo)
const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });
const rows = await selectAll(db, 'events', 'id,title,title_ru,city,address,lat,lng,status,start_date,website');

const onLimassolCenter = (lat, lng) => Math.abs(lat - 34.7071) < 0.002 && Math.abs(lng - 33.0226) < 0.002;
const isClub = (a) => /Famagusta Tennis|Mesaorias/i.test(a || '');

let n = 0, applied = 0;
for (const r of rows) {
  if (r.status === 'archived') continue;
  if (!onLimassolCenter(r.lat, r.lng)) continue;
  if (!isClub(r.address)) continue;
  n++;
  const shift = Math.hypot((LAT - r.lat) * 111, (LNG - r.lng) * 91);
  console.log(`${r.id.slice(0, 8)} | ${r.status} | ${r.start_date} | ${(r.title_ru || r.title).slice(0, 55)} | ${r.address.slice(0, 70)} | сдвиг ${shift.toFixed(2)} км | ${(r.website || '').slice(0, 55)}`);
  if (!APPLY) continue;
  const { data, error } = await db.from('events').update({ lat: LAT, lng: LNG }).eq('id', r.id).select('id,lat,lng');
  if (error || !data?.length) { console.log(`   ОШИБКА: ${error?.message || '0 строк'}`); continue; }
  applied++;
  console.log(`   записано: ${data[0].lat},${data[0].lng}`);
}
console.log(`\nкандидатов ${n}, ${APPLY ? 'APPLY' : 'DRY'}: применено ${applied}`);
