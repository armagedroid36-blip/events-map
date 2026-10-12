// Юнит: реестр «площадка -> район» Бали (venue-district.mjs).
// Проверяет, что метка района берётся у большинства карточек площадки и что
// страховки (одна карточка, разные пины, пустой реестр, «вне Бали») держат.
import {
  buildVenueDistrictRegistry,
  districtForVenue,
} from './venue-district.mjs';

let ok = 0;
let fail = 0;
const check = (name, got, want) => {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) {
    ok++;
    console.log(`OK   ${name}`);
  } else {
    fail++;
    console.log(`FAIL ${name}: получил ${g}, ждал ${w}`);
  }
};

// Кейс 188: одна площадка (Potato Head / Klymax), 3 карточки «Семиньяк» одним
// хвостом адреса и 1 «Керобокан» другим; точка одна и та же.
const A_SEM = 'Jl. Petitenget No.51B, Seminyak, Kec. Kuta Utara, Bali';
const A_KER = 'Jl. Petitenget No.51B, Kerobokan Kelod, Kec. Kuta Utara, Bali';
const PIN = { lat: -8.6792173, lng: 115.1500396 };
const rows188 = [
  { address: A_SEM, lat: PIN.lat, lng: PIN.lng, city: 'Семиньяк, Bali' },
  { address: A_SEM, lat: PIN.lat, lng: PIN.lng, city: 'Семиньяк, Bali' },
  { address: A_SEM, lat: PIN.lat, lng: PIN.lng, city: 'Семиньяк, Bali' },
  { address: A_KER, lat: PIN.lat, lng: PIN.lng, city: 'Керобокан, Bali' },
];
const reg188 = buildVenueDistrictRegistry(rows188);
check('кейс 188: адрес с «Kerobokan» получает район большинства «Семиньяк»',
  districtForVenue({ address: A_KER, ...PIN }, reg188), 'Семиньяк');
check('тот же адрес, что у большинства, метку не меняет',
  districtForVenue({ address: A_SEM, ...PIN }, reg188), 'Семиньяк');

// Одна карточка площадки — не арбитр.
const reg1 = buildVenueDistrictRegistry([
  { address: A_SEM, lat: PIN.lat, lng: PIN.lng, city: 'Семиньяк, Bali' },
]);
check('одна карточка у площадки -> реестр не арбитрит',
  districtForVenue({ address: A_KER, ...PIN }, reg1), null);

// Разные точки (3 знака) — это уже другая площадка.
const regFar = buildVenueDistrictRegistry([
  { address: A_SEM, lat: -8.7, lng: 115.2, city: 'Семиньяк, Bali' },
  { address: A_SEM, lat: -8.7, lng: 115.2, city: 'Семиньяк, Bali' },
]);
check('другая точка -> ключа площадки нет',
  districtForVenue({ address: A_KER, ...PIN }, regFar), null);

// «Вне Бали» голосованием не назначаем.
const regJak = buildVenueDistrictRegistry([
  { address: 'Jl. Sudirman, Jakarta', lat: -6.2, lng: 106.8, city: 'Джакарта' },
  { address: 'Jl. Sudirman, Jakarta', lat: -6.2, lng: 106.8, city: 'Джакарта' },
]);
check('площадка вне Бали -> null',
  districtForVenue({ address: 'Jl. Sudirman, Jakarta', lat: -6.2, lng: 106.8 }, regJak), null);

check('пустой реестр -> null', districtForVenue({ address: A_KER, ...PIN }, new Map()), null);
check('нет координат у карточки -> null',
  districtForVenue({ address: A_KER, lat: null, lng: null }, reg188), null);

console.log(`\nИТОГ: ${ok}/${ok + fail} OK`);
process.exit(fail ? 1 : 0);
