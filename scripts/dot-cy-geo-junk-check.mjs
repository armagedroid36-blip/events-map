// Юнит «мусорный адрес cyprus.bz не уводит пин» (класс 30.10.2026).
// Адрес ровно «Cyprus, Cyprus» — страна вместо улицы; прежний запрос к Nominatim
// («<площадка>, Cyprus, Cyprus, Nicosia, Cyprus») дал точку поля 35.129393,33.229783
// в 10–15 км от Никосии семи карточкам.
import { geoQueryParts, countryFieldFallback, haversineKm } from './collect-cyprus.mjs';

const NICOSIA = { lat: 35.1856, lng: 33.3823 };
const FIELD = { lat: 35.129393, lng: 33.229783 };

const cases = [
  // мусорный адрес + метка города: площадку не ищем вовсе
  { name: 'junk country address', src: { venue: 'Cyprus', address: 'Cyprus, Cyprus', city: 'Nicosia' }, parts: ['Nicosia'], street: false },
  // адрес с улицей остаётся как был
  { name: 'real street', src: { venue: 'Markideio Theatre', address: 'Andrea Geroudi 6, Paphos', city: 'Paphos' }, parts: ['Markideio Theatre', 'Andrea Geroudi 6', 'Paphos'], street: true },
  // дубли частей не размножаются
  { name: 'dedupe parts', src: { venue: 'Loft', address: 'Nicosia, Nicosia', cityEn: 'Nicosia' }, parts: ['Loft', 'Nicosia'], street: false },
  // греческое название страны тоже мусор
  { name: 'greek country', src: { venue: '', address: 'Κύπρος, Κύπρος', city: 'Limassol' }, parts: ['Limassol'], street: false },
  // тип улицы без номера — улика есть
  { name: 'street type only', src: { venue: 'Bamboo Bar', address: 'Poseidonos Avenue, Limassol', city: 'Limassol' }, parts: ['Bamboo Bar', 'Poseidonos Avenue', 'Limassol'], street: true },
];

let fail = 0;
for (const c of cases) {
  const r = geoQueryParts(c.src);
  const okParts = JSON.stringify(r.parts) === JSON.stringify(c.parts);
  const okStreet = r.streetHint === c.street;
  if (!okParts || !okStreet) {
    fail++;
    console.log(`FAIL ${c.name}: parts=${JSON.stringify(r.parts)} (want ${JSON.stringify(c.parts)}), street=${r.streetHint} (want ${c.street})`);
  } else {
    console.log(`ok   ${c.name}`);
  }
}

// правило «точка-страна»: адрес-ЗАГЛУШКА (только страна) и >8 км от города — центр города
const d = haversineKm(FIELD.lat, FIELD.lng, NICOSIA.lat, NICOSIA.lng);
const junk = geoQueryParts({ venue: 'Cyprus', address: 'Cyprus, Cyprus', city: 'Nicosia' });
const wouldFallback = countryFieldFallback({
  junkAddress: junk.junkAddress,
  placeToken: junk.placeToken,
  geoName: 'Parekklisha, Limassol, Cyprus', // геокодер вернул не то, что просили
  distKm: d,
});
console.log(`${wouldFallback ? 'ok  ' : 'FAIL'} поле под Никосией ${d.toFixed(1)} км -> фолбэк на центр`);
if (!wouldFallback) fail++;

// и обратное: событие ДЕРЕВНИ без улики улицы (Argaka под Пафосом, 45 км) НЕ должно
// уезжать в центр объявленного города — иначе теряется верная точка источника
const village = geoQueryParts({ venue: '', address: 'Argaka', city: 'Paphos' });
const villageFallback = village.junkAddress;
console.log(`${!villageFallback ? 'ok  ' : 'FAIL'} деревня «Argaka» (адрес без страны) -> фолбэка нет`);
if (villageFallback) fail++;

// КЛАСС 03.11.2026: адрес-заглушка «Cyprus, Cyprus», а площадка — деревня Koilani
// (34.8389919,32.8535540, 22 км от центра Лимасола). Геокодер нашёл ИМЕННО Koilani
// (display_name начинается с него) — точку деревни сохраняем, на центр города не едем.
const KOILANI = { lat: 34.8389919, lng: 32.853554 };
const LIMASSOL = { lat: 34.7071, lng: 33.0226 };
const kq = geoQueryParts({ venue: 'Koilani', address: 'Cyprus, Cyprus', city: 'Лимасол' });
const kDist = haversineKm(KOILANI.lat, KOILANI.lng, LIMASSOL.lat, LIMASSOL.lng);
const kJunkField = countryFieldFallback({
  junkAddress: kq.junkAddress,
  placeToken: kq.placeToken,
  geoName: 'Koilani, Σύμπλεγμα Κοινοτήτων Τροόδους, Επαρχία Λεμεσού, Cyprus',
  distKm: kDist,
});
console.log(
  `${kq.junkAddress && kq.placeToken === 'Koilani' && !kJunkField ? 'ok  ' : 'FAIL'} деревня Koilani под меткой «Лимасол» (${kDist.toFixed(0)} км) -> пин деревни сохранён`,
);
if (kq.placeToken !== 'Koilani' || !kq.junkAddress || kJunkField) fail++;

// тот же адрес-заглушка, но БЕЗ названия места (площадку источник не дал) — фолбэк нужен
const noPlace = geoQueryParts({ venue: '', address: 'Unknown', city: 'Лимасол' });
const noPlaceFallback = countryFieldFallback({
  junkAddress: noPlace.junkAddress,
  placeToken: noPlace.placeToken,
  geoName: 'Parekklisha, Limassol, Cyprus',
  distKm: 21,
});
console.log(`${noPlaceFallback ? 'ok  ' : 'FAIL'} адрес «Unknown» без площадки -> фолбэк на центр`);
if (!noPlaceFallback) fail++;

console.log(fail ? `ПРОВАЛ: ${fail}` : `ВСЁ ОК: ${cases.length + 4}/${cases.length + 4}`);
process.exit(fail ? 1 : 0);
