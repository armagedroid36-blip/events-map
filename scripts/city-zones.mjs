// Зоны городов для геопривязки событий без точного адреса.
// Если организатор указал только часть города («север Нячанга», «южный пляж»,
// «район My Gia»), событие получает якорные координаты ЗОНЫ, а не центр города.
// Используется collect-tg.mjs (перед финальным fallback на центр) и
// scripts/backfill-zones.mjs (переезд уже собранных событий из центра в зону).
//
// Якоря НЕ выдуманы: каждый помечен источником (координаты события из базы
// с подтверждённым адресом, словарь PLACE_COORDS collect-tg, геокодер
// Nominatim). Порядок зон в массиве = приоритет: направление («север/юг»)
// важнее generic-«пляжа», «пляж» важнее «центра» («центральный пляж» — это
// пляж, а не центр).

/** Зоны городов. city -> { fallback: центр города (как в CHANNELS collect-tg),
 *  zones: [{ id, label, markers: [подстроки в нижнем регистре], coords, comment }] } */
export const CITY_ZONES = {
  Нячанг: {
    fallback: { lat: 12.2388, lng: 109.1967 }, // центр Нячанга (CHANNELS collect-tg)
    zones: [
      {
        id: 'north',
        label: 'север',
        markers: ['север', 'north', 'океанус', 'oceanus', 'boton', 'pham van dong', 'phạm văn đồng', 'фам ван донг', 'hòn chồng', 'hon chong'],
        coords: { lat: 12.273779, lng: 109.202092 },
        comment: 'Север Нячанга — район Океанус/Hòn Chồng (нижняя граница севера, где проходят почти все «северные» события). Источник: координаты события «кафе рядом с Океанусом (север)» и PLACE_COORDS collect-tg.',
      },
      {
        id: 'south',
        label: 'юг',
        markers: ['юг', 'южн', 'south', 'my gia', 'mygia'],
        coords: { lat: 12.198586, lng: 109.211651 },
        comment: 'Юг Нячанга — Vĩnh Hải (южнее центра, у берега). Источник: событие БД «GLOW FLOW Pole & Dance, 64A Nguyễn Thiện Thuật…» (подтверждённые координаты юга). My Gia — ориентир юга (точного адреса в БД/OSM нет, ложится на юг).',
      },
      {
        id: 'beach',
        label: 'пляж',
        markers: ['пляж', 'beach', 'набережн', 'tran phu', 'trần phú', 'тран фу', 'bãi biển', 'бай биен'],
        coords: { lat: 12.243427, lng: 109.196493 },
        comment: 'Центральный пляж/набережная Trần Phú. Источник: Nominatim «Trần Phú, Nha Trang» (улица идёт вдоль пляжа, сам пляж ~100 м восточнее). «Южный пляж» ловится зоной south раньше.',
      },
      {
        id: 'center',
        label: 'центр',
        markers: ['центр', 'center', 'centre', 'neverland'],
        coords: { lat: 12.2407732, lng: 109.1894251 },
        comment: 'Центр Нячанга. Источник: PLACE_COORDS collect-tg (Neverland, 40 Hồng Bàng) + событие «Клуб игр NEVERLAND (центр)».',
      },
    ],
  },
  Дананг: {
    fallback: { lat: 16.0544, lng: 108.2022 }, // центр Дананга (CHANNELS collect-tg)
    zones: [
      {
        id: 'north',
        label: 'север',
        markers: ['север', 'north', 'sơn trà', 'son tra', 'сон ча', 'tiên sa', 'tien sa', 'тиен ша', 'simple beach'],
        coords: { lat: 16.125405, lng: 108.266605 },
        comment: 'Север Дананга — Tiên Sa / п-ов Sơn Trà. Источник: событие БД «Simple Beach Tien Sa, 3a Yết Kiêu, Sơn Trà» (16.125405/108.2666052).',
      },
      {
        id: 'south',
        label: 'юг',
        markers: ['юг', 'южн', 'south', 'ngũ hành sơn', 'ngu hanh son', 'нгу хань шон', 'non nuoc', 'нон ныок', 'marble mountain'],
        coords: { lat: 16.010798, lng: 108.253178 },
        comment: 'Юг Дананга — Ngũ Hành Sơn (район Marble Mountains). Источник: событие БД «THE SANCTUARY, 20A Mỹ Đa Đông 8, Ngũ Hành Sơn» (16.010798/108.253178).',
      },
      {
        id: 'beach',
        label: 'пляж Mỹ Khê',
        markers: ['пляж', 'beach', 'mỹ khê', 'my khe', 'ми кхе', 'bãi biển', 'бай биен'],
        coords: { lat: 16.075625, lng: 108.246878 },
        comment: 'Пляж Mỹ Khê. Источник: Nominatim «Bãi biển Mỹ Khê» (16.075625/108.246878); полоса пляжа тянется от Sơn Trà до Ngũ Hành Sơn.',
      },
      {
        id: 'center',
        label: 'центр',
        markers: ['центр', 'center', 'centre', 'hải châu', 'hai chau', 'хай чау'],
        coords: { lat: 16.058954, lng: 108.219484 },
        comment: 'Центр Дананга — Hải Châu. Источник: Nominatim «Hải Châu, Đà Nẵng» (16.058954/108.219484).',
      },
    ],
  },
};

/**
 * Найти зону города по тексту (адрес + пост). Текст приводится к нижнему
 * регистру; маркеры — подстроки. Возвращает первую зону по приоритету
 * (north/south -> beach -> center) или null.
 * @param {string} city город события («Нячанг»/«Дананг»)
 * @param {string|null} text текст для анализа
 * @returns {{ zone: string, label: string, lat: number, lng: number } | null}
 */
export function findCityZone(city, text) {
  const cfg = CITY_ZONES[city];
  if (!cfg || !text) return null;
  const low = ` ${String(text).toLowerCase()} `;
  for (const z of cfg.zones) {
    for (const m of z.markers) {
      if (low.includes(m)) {
        return { zone: z.id, label: z.label, lat: z.coords.lat, lng: z.coords.lng };
      }
    }
  }
  return null;
}
