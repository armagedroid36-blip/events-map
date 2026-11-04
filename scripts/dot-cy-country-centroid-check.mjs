// Юнит «центроид страны не становится пином» (класс 691–694, Кипр).
// Cyprus Now при `venue_city: "Cyprus"` отдаёт вместо площадки центроид острова
// 35.126413,33.429859: карточки Clay & Wine / Meltemi, Sine Volos вставали в поле
// в 15+ км от города. Сборщик такую точку обязан выбросить и взять адрес/город.
import { isCountryCentroid, haversineKm } from './collect-cyprus.mjs';

const CENTROID = { lat: 35.126413, lng: 33.429859 };
const NICOSIA = { lat: 35.1856, lng: 33.3823 };
const LIMASSOL = { lat: 34.7071, lng: 33.0226 };
const LARNACA = { lat: 34.9182, lng: 33.6194 };
const MELTEMI = { lat: 34.6859263, lng: 33.0265383 };

const cases = [
  { name: 'ровно центроид', lat: CENTROID.lat, lng: CENTROID.lng, want: true },
  { name: 'центроид с 4 знаками', lat: 35.1264, lng: 33.4299, want: true },
  { name: 'центроид +0.005 (допуск)', lat: 35.1314, lng: 33.4349, want: true },
  { name: 'центр Никосии', lat: NICOSIA.lat, lng: NICOSIA.lng, want: false },
  { name: 'центр Лимасола', lat: LIMASSOL.lat, lng: LIMASSOL.lng, want: false },
  { name: 'центр Ларнаки', lat: LARNACA.lat, lng: LARNACA.lng, want: false },
  { name: 'площадка Meltemi', lat: MELTEMI.lat, lng: MELTEMI.lng, want: false },
  { name: 'null-координаты', lat: null, lng: null, want: false },
  { name: 'NaN', lat: NaN, lng: NaN, want: false },
];

let fail = 0;
for (const c of cases) {
  const got = isCountryCentroid(c.lat, c.lng);
  if (got !== c.want) {
    fail++;
    console.log(`FAIL ${c.name}: got ${got}, want ${c.want}`);
  } else {
    console.log(`ok   ${c.name}`);
  }
}

// Контроль расстояний: центроид обязан быть далеко от всех центров городов,
// иначе гард съест законные городские пины.
for (const [name, p] of Object.entries({ NICOSIA, LIMASSOL, LARNACA })) {
  const d = haversineKm(CENTROID.lat, CENTROID.lng, p.lat, p.lng);
  if (!(d > 5)) {
    fail++;
    console.log(`FAIL ${name} ближе 5 км к центроиду (${d.toFixed(1)} км)`);
  } else {
    console.log(`ok   ${name} в ${d.toFixed(1)} км от центроида`);
  }
}

console.log(`\n${cases.length + 3 - fail}/${cases.length + 3} пройдено`);
process.exit(fail ? 1 : 0);
