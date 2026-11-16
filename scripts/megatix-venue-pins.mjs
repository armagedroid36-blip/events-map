// Словарь «адрес площадки → проверенный пин» для Megatix (запуск 943).
//
// Зачем: у megatix.co.id в JSON-LD нет координат, поэтому сборщик ставил пин на ЦЕНТР РАЙОНА,
// и все события квартала складывались в одну точку (в Убуде так стояли 29 карточек).
// В запуске 941 адреса 39 карточек были геокодированы Nominatim вручную; здесь зафиксированы
// адреса, у которых пин НЕ равен центру района, то есть проверенные площадки.
// Сборщик обязан сначала смотреть сюда и только при промахе падать на центр района.
//
// Обновлять по мере геокодирования новых площадок: источник замера —
// `status in (active, moderation)` + `website ilike *megatix*`, пин не на центре района.
export const MEGATIX_VENUE_PINS = new Map([
  ["jalan padang linjong 39 canggu samadi yoga & wellness center", { lat: -8.64404, lng: 115.137119 }],
  ["luna beach club kab tabanan luna beach club", { lat: -8.629669, lng: 115.094215 }],
  ["93cx+6c beraban kediri tabanan regency bali 82121 indonesia beraban nuanu", { lat: -8.62722, lng: 115.099095 }],
  ["jl sukma kesuma no 2 peliatan ubud kabupaten gianyar sayuri academy", { lat: -8.509916, lng: 115.268934 }],
  ["jalan raya tegallalang tegallalang kecamatan tegallalang kabupaten gianyar cretya ubud bali", { lat: -8.440114, lng: 115.280588 }],
  ["jl katik lantang singakerta ubud arkamara dijiwa ubud", { lat: -8.516821, lng: 115.250113 }],
  ["jalan padang linjong 39 canggu badung samadi bali", { lat: -8.64404, lng: 115.137119 }],
  ["jl munduk catu canggu kabupaten badung wild art bali", { lat: -8.654389, lng: 115.12995 }],
  ["jalan raya ubud ubud museum puri lukisan", { lat: -8.505112, lng: 115.260356 }],
  ["jl raya kerobokan no 88 kerobokan kelod kec kuta utara kabupaten badung terminus", { lat: -8.662616, lng: 115.167164 }],
  ["ku de ta seminyak ku de ta", { lat: -8.687146, lng: 115.154511 }],
  ["alpha wolf lodge nuanu creative city 94g2+2m beraban kediri tabanan regency bali tabanan alpha wolf lodge", { lat: -8.62722, lng: 115.099095 }],
  ["93cx+6c beraban kediri tabanan regency bali 82121 tabanan ash nuanu", { lat: -8.62722, lng: 115.099095 }],
  ["jl petitenget no 468x kerobokan kuta utara badung regency cést la vie restaurant and bar", { lat: -8.67929, lng: 115.153652 }],
  ["jl penestanan kelod jl penestanan no 8 sayan kecamatan ubud gianyar dragon tea temple", { lat: -8.506078, lng: 115.251081 }],
  ["nuanu creative city tabanan nuanu creative city", { lat: -8.62722, lng: 115.099095 }],
  ["jl nelayan jl raya nelayan beach no 1 canggu kuta utara badung regency manta bar & grill", { lat: -8.657407, lng: 115.134564 }],
  ["jl canggu padang linjong no 39 canggu kec kuta utara kabupaten badung bali 80361 indonesia badung samadi bali canggu", { lat: -8.64404, lng: 115.137119 }],
  ["jl canggu padang linjong no 75a canggu bali 80351 canggu karelab store", { lat: -8.646456, lng: 115.135748 }],
  ["jl gn sari peliatan kecamatan ubud kancil art home", { lat: -8.509826, lng: 115.277021 }],
  ["jl goutama sel ubud gianyar paradiso - ubud", { lat: -8.509033, lng: 115.264222 }],
  ["jl monkey forest ubud monkey forest", { lat: -8.514377, lng: 115.260526 }],
  ["jl cemara sanur kauh denpasar selatan kota denpasar bali 80228 south denpasar rip curl school of surf sanur bali", { lat: -8.710933, lng: 115.255895 }],
  ["jl dermaga ii jl raya pelabuhan benoa pedungan denpasar selatan kota denpasar bali denpasar beat boat bali - boat party", { lat: -8.742428, lng: 115.212535 }],
  ["jl bisma no 85 ubud sacred smoke incense studio", { lat: -8.516913, lng: 115.25938 }],
]);

/** Нормализация адреса: регистр, пунктуация, повторы пробелов. */
export function normAddr(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[.,;]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Пин площадки по адресу источника.
 * Сначала полное совпадение нормализованного адреса, затем — по улице (первый сегмент адреса),
 * если такая улица в словаре одна. Иначе null (центр района).
 * @param {string} addressText
 * @returns {{lat: number, lng: number} | null}
 */
export function megatixPinForAddress(addressText) {
  const full = normAddr(addressText);
  if (!full) return null;
  const hit = MEGATIX_VENUE_PINS.get(full);
  if (hit) return { lat: hit.lat, lng: hit.lng };

  const street = full.split(',')[0].trim();
  if (street.length < 6) return null;
  const byStreet = [];
  for (const [addr, pin] of MEGATIX_VENUE_PINS) {
    if (addr.split(',')[0].trim() === street) byStreet.push(pin);
  }
  // Улица с несколькими разными пинами — неоднозначно (разные дома), пин не выдумываем.
  const uniq = new Set(byStreet.map((p) => `${p.lat},${p.lng}`));
  if (uniq.size === 1) return { lat: byStreet[0].lat, lng: byStreet[0].lng };
  return null;
}
