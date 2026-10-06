// dot-latsia-venue-fix.mjs — карточки «Latsia Theatre Nicosia» (cyprus.bz) стояли на ЦЕНТРОВОМ
// фолбэке Никосии (35.1856,33.3823), т.е. пин в чужом населённом пункте (~9 км от Латсии).
// Проверено этим запуском:
//  * страница источника cyprus.bz/event/3576 (карточка 7a21443d): JSON-LD Place name «Latsia Theatre Nicosia»,
//    addressLocality «Nicosia», улицы и гео НЕТ; карта на странице — поисковая ссылка по имени, координат не даёт;
//  * та же площадка в ленте Cyprus Now (карточка 09a142aa, адрес «Latsia Municipal Theatre, Nicosia») приходит
//    с координатой 35.1063639,33.3782668 — 7 знаков, НЕ центровой фолбэк; реверс Nominatim по ней:
//    улица Архиепископа Киприану, Latsia (округ Никосия) → точка уровня города Латсия;
//  * в OSM в bbox Латсии/Строволоса 3 театра (Θέατρο Αποθήκες ΘΟΚ Строволос, Θέατρο Μασκαρίνι Аталассис 4,
//    Θέατρο Ανεμώνα Кантарас) и ни один не «Latsia Municipal Theatre» — площадки уровня дома в OSM нет.
// Значит точнее центра Латсии пин честно поставить нечем, но центр Латсии заведомо вернее центра Никосии.
// Страховки: цель обязана стоять РОВНО на центровом фолбэке; адрес цели обязан содержать «latsia»;
// city не меняется; сдвиг > 50 м. DRY по умолчанию.
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
import { km } from './cy-districts.mjs';

const APPLY = process.env.APPLY === '1';
const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });

const NICOSIA_CENTER = '35.1856,33.3823';
const LATSIA_POINT = { lat: 35.1063639, lng: 33.3782668, from: '09a142aa (Cyprus Now, «Latsia Municipal Theatre»)' };
const CARDS = ['7a21443d', 'ed200c34'];

const rows = await selectAll(db, 'events', 'id,status,title,title_ru,city,address,lat,lng,website');
let ok = 0, err = 0;
for (const pref of CARDS) {
  const r = rows.find((x) => x.id.startsWith(pref));
  if (!r) { console.log(`✗ ${pref}: не найдено`); err++; continue; }
  const onCenter = String(Number(r.lat)) + ',' + String(Number(r.lng)) === NICOSIA_CENTER;
  const addrOk = /latsia/i.test(r.address || '');
  const shift = km(r.lat, r.lng, LATSIA_POINT.lat, LATSIA_POINT.lng);
  const pass = onCenter && addrOk && shift > 0.05;
  console.log(`${pref} [${r.status}] ${r.title_ru || r.title} | ${r.address} | ${r.lat},${r.lng} -> ${LATSIA_POINT.lat},${LATSIA_POINT.lng} | сдвиг ${Math.round(shift)} км | на центровом=${onCenter} адрес-называет=${addrOk} ${pass ? 'OK' : 'ОТКАЗ'}`);
  if (!pass) { err++; continue; }
  if (!APPLY) { ok++; continue; }
  const { data, error } = await db.from('events').update({ lat: LATSIA_POINT.lat, lng: LATSIA_POINT.lng }).eq('id', r.id).select('id,lat,lng,city,address,status');
  if (error || !data?.length) { console.log('  ошибка записи:', error?.message || '0 строк'); err++; continue; }
  console.log('  записано:', JSON.stringify(data[0]));
  ok++;
}
console.log(`${APPLY ? 'применено' : 'к применению'}: ${ok}, ошибок/отказов: ${err}`);
