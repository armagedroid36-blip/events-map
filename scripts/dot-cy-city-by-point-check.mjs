// Проверка корневой правки «city Кипра по координатам» (правило в collect-cyprus.mjs).
// 1) Синтетические кейсы на самой функции — без сети и базы.
// 2) Сверка по базе: active Кипра, где округ метки city != округ точки.
//    Без APPLY=1 — только показывает; с APPLY=1 — пишет city по точке.
// Известные исключения (EXCLUDE): координата битая, а город в названии верный —
// их правка ждёт проверки площадки из источника, автоматом не переворачиваем.
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
import { districtOf, districtNear, districtOfCity, cityForPoint } from './cy-districts.mjs';

const APPLY = process.env.APPLY === '1';
const EXCLUDE = {
  '0342fad2': 'TEU16: Famagusta Tennis Club с точкой в Лимасоле — нужна проверка площадки',
  'a593accd': 'тур «Nicosia & Limassol»: одна точка на два города',
  'eeb244ff': 'тур «Nicosia & Limassol»: одна точка на два города',
  'ec507855': 'Street Food festival: слаг сайта 2026-07-07 при дате 10.10 — чужая страница?',
  'be700101': 'точка в море 34.4436,34.0971 — координата битая',
};

// ===== 1. Синтетика =====
const cases = [
  ['Лимасол, Кипр', 35.0772, 33.1363, 'Никосия', 'битая метка: площадка в округе Никосия'],
  ['Никосия, Кипр', 34.7071, 33.0226, 'Лимасол', 'битая метка: площадка в округе Лимасол'],
  ['Ая-Напа, Кипр', 34.9886, 33.9997, 'нет', 'Ая-Напа в округе Фамагуста — метка верна'],
  ['Протарас, Кипр', 35.0128, 34.0564, 'нет', 'Протарас в округе Фамагуста — метка верна'],
  ['Лимасол, Кипр', 34.7071, 33.0226, 'нет', 'округ совпадает'],
  ['Пафос, Кипр', 35.0363, 32.4255, 'нет', 'Полис в округе Пафос — метка верна'],
];
console.log('== синтетика (метка, точка) -> ожидаемый city ==');
let synthFail = 0;
for (const [city, lat, lng, expected, _d] of cases) {
  const dPoint = districtOf(lat, lng) || districtNear(lat, lng);
  const dLabel = districtOfCity(city);
  let got = null;
  if (dPoint && dLabel && dPoint !== dLabel) got = cityForPoint(lat, lng);
  const ok = (got ?? 'нет') === expected;
  if (!ok) synthFail++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${city} @${lat},${lng} -> округ метки ${dLabel}, округ точки ${dPoint}, правка: ${got ?? 'нет'}`);
}
console.log('синтетика: провалов', synthFail);

// ===== 2. База =====
const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
const rows = await selectAll(db, 'events', 'id,status,city,address,lat,lng,website,title');
const cy = rows.filter((r) => r.status === 'active' && /кипр/i.test(r.city || '') && r.lat && r.lng);

const would = [];
const excluded = [];
for (const r of cy) {
  const lat = Number(r.lat), lng = Number(r.lng);
  const dPoint = districtOf(lat, lng) || districtNear(lat, lng);
  const dLabel = districtOfCity(r.city);
  if (!dPoint || !dLabel || dPoint === dLabel) continue;
  const byPoint = cityForPoint(lat, lng);
  if (!byPoint || byPoint === r.city) continue;
  const prefix = r.id.slice(0, 8);
  if (EXCLUDE[prefix]) { excluded.push({ ...r, byPoint, why: EXCLUDE[prefix] }); continue; }
  would.push({ ...r, byPoint, dPoint, dLabel });
}
console.log('== база ==');
console.log('active Кипра с координатами:', cy.length);
console.log('метка city в чужом округе:', would.length + excluded.length, '| из них исключено (битые координаты):', excluded.length, '| к правке:', would.length);
for (const r of would) {
  console.log(' ---', r.id.slice(0, 8), `«${r.city}» (${r.dLabel}) -> «${r.byPoint}» (${r.dPoint})`, r.start_date || '', '|', (r.title || '').slice(0, 60));
  console.log('     addr:', r.address || '—', '| site:', r.website || '—');
}
for (const r of excluded) console.log('  !! исключение', r.id.slice(0, 8), '«' + r.city + '» -> «' + r.byPoint + '»:', r.why);
for (const r of cy.filter((x) => !districtOf(Number(x.lat), Number(x.lng))).slice(0, 40)) {
  console.log('  вне полигонов:', r.id.slice(0, 8), r.city, Number(r.lat).toFixed(4) + ',' + Number(r.lng).toFixed(4));
}

if (APPLY && would.length) {
  let ok = 0;
  for (const r of would) {
    const { error } = await db.from('events').update({ city: `${r.byPoint}, Кипр` }).eq('id', r.id).select('id');
    if (error) { console.error(' ошибка', r.id.slice(0, 8), error.message); continue; }
    ok++;
  }
  console.log('APPLY: записано', ok, 'из', would.length);
} else if (APPLY) {
  console.log('APPLY: нечего писать');
}
