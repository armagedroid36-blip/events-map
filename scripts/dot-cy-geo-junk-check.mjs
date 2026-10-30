// Юнит «мусорный адрес cyprus.bz не уводит пин» (класс 30.10.2026).
// Адрес ровно «Cyprus, Cyprus» — страна вместо улицы; прежний запрос к Nominatim
// («<площадка>, Cyprus, Cyprus, Nicosia, Cyprus») дал точку поля 35.129393,33.229783
// в 10–15 км от Никосии семи карточкам.
import { geoQueryParts, haversineKm } from './collect-cyprus.mjs';

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

// правило «точка-страна»: без улики и >8 км от города — центр города
const d = haversineKm(FIELD.lat, FIELD.lng, NICOSIA.lat, NICOSIA.lng);
const wouldFallback = !geoQueryParts({ venue: 'Cyprus', address: 'Cyprus, Cyprus', city: 'Nicosia' }).streetHint && d > 8;
console.log(`${wouldFallback ? 'ok  ' : 'FAIL'} поле под Никосией ${d.toFixed(1)} км -> фолбэк на центр`);
if (!wouldFallback) fail++;

console.log(fail ? `ПРОВАЛ: ${fail}` : `ВСЁ ОК: ${cases.length + 1}/${cases.length + 1}`);
process.exit(fail ? 1 : 0);
