// Адрес события для публичных страниц: локализация для EN-версий (/en/*).
// Зеркало логики scripts/seo-prerender.mjs (cityCrumb + CITY_NAME_EN +
// placeLabel) — при правках менять оба места.
//
// Зачем: адрес сборщика — свободный текст. На EN-страницах в нём встречаются
// RU-названия стран («…, Bali 80361, Индонезия»), EN-город дублируется
// («…, Indonesia, Bali» — потому что город приписывался к строке), а часть
// адресов набрана по-русски («район My An, студия в Son Tra»). RU-страницы
// показывают строку из данных без изменений.

/** RU→EN названия стран/регионов внутри свободного текста адреса */
const COUNTRY_NAME_EN: Record<string, string> = {
  индонезия: 'Indonesia',
  вьетнам: 'Vietnam',
  мьянма: 'Myanmar',
  малайзия: 'Malaysia',
  таиланд: 'Thailand',
  камбоджа: 'Cambodia',
  сингапур: 'Singapore',
  филиппины: 'Philippines',
};

/** Признак кириллицы (остаточный RU-фрагмент адреса) */
const CYRILLIC_RE = /[\u0400-\u04FF]/;

/**
 * EN-имя города события: «Нячанг»/«Nha Trang» → Nha Trang,
 * «Дананг»/«Da Nang»/«Danang» → Da Nang, Бали и его районы (Убуд, Чангу,
 * Семиньяк, Кута, Денпасар, Гианьяр) → Bali. Не распознано → '' (пустая
 * строка = город неизвестен, EN-имя подставлять нельзя).
 */
export function cityNameEn(rawCity: string | null | undefined): string {
  const city = String(rawCity ?? '').toLowerCase();
  if (!city) return '';
  if (city.includes('нячанг') || city.includes('nha trang')) return 'Nha Trang';
  if (
    city.includes('дананг') ||
    city.includes('da nang') ||
    city.includes('danang')
  ) {
    return 'Da Nang';
  }
  const baliKeys = [
    'бали', 'bali', 'ubud', 'убуд', 'canggu', 'чангу',
    'seminyak', 'семиньяк', 'kuta', 'кута', 'denpasar', 'gianyar',
  ];
  if (baliKeys.some((k) => city.includes(k))) return 'Bali';
  return '';
}

/** Локализует RU-названия стран внутри адреса: «…, Индонезия» → «…, Indonesia».
 * Замена по границам слов, регистронезависимо. */
export function localizeCountryNames(text: string): string {
  let out = text;
  for (const [ru, en] of Object.entries(COUNTRY_NAME_EN)) {
    out = out.replace(new RegExp(`(?<![\\p{L}])${ru}(?![\\p{L}])`, 'giu'), en);
  }
  return out;
}

/** Есть ли needle в hay как отдельное слово (границы — не буквы, регистр не
 * важен): «Bali» находится в «…, Bali 80361», но не в «Balinese». */
function hasWord(hay: string, needle: string): boolean {
  if (!hay || !needle) return false;
  const esc = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![\\p{L}])${esc}(?![\\p{L}])`, 'iu').test(hay);
}

/** Убирает ХВОСТОВОЙ повтор города в адресе, если город уже назван раньше
 * («Culture House of Labor Da Nang, …, Hai Chau, Da Nang» → «…, Hai Chau»;
 * «Vega City Nha Trang, …, Vinh Hoa Ward, Nha Trang City» → «…, Vinh Hoa
 * Ward»). Дубли приходят из данных — в free-текст адреса город приписывал
 * сборщик. Сегмент убирается, только если это последний сегмент, он содержит
 * EN-имя города И имя города есть до него (адрес без города не остаётся). */
function stripRedundantCityTail(text: string, city: string): string {
  if (!city || !text) return text;
  const i = text.lastIndexOf(',');
  if (i < 0) return text;
  const head = text.slice(0, i).trim();
  const tail = text.slice(i + 1).trim();
  if (!hasWord(tail, city) || !hasWord(head, city)) return text;
  return head;
}

/**
 * Адрес для показа на странице языка lang: RU — строка из данных как есть,
 * EN — (a) RU-названия стран локализуются; (b) хвостовой повтор города
 * убирается (stripRedundantCityTail), EN-город не приписывается, если уже
 * есть в строке отдельным словом (убирает двойной «, Bali»); (c) если после
 * (a)-(b) осталась кириллица и город распознан — возвращается только EN-имя
 * города (RU-фрагмент не выводим); (d) город не распознан — строка как в
 * данных. Пусто на входе → пусто на выходе.
 */
export function placeLabel(
  address: string | null | undefined,
  city: string | null | undefined,
  lang: 'ru' | 'en',
): string {
  const raw = String(address ?? '').trim();
  if (lang !== 'en') return raw;
  const enCity = cityNameEn(city);
  let place = stripRedundantCityTail(localizeCountryNames(raw), enCity);
  if (enCity && !hasWord(place, enCity)) {
    place = place ? `${place}, ${enCity}` : enCity;
  }
  if (CYRILLIC_RE.test(place) && enCity) place = enCity;
  return place;
}
