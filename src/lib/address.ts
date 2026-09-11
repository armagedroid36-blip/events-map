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

/** Путь городской страницы события (как slugify(labelEn) в config.quickLocations) */
export type CityPath = 'bali' | 'da-nang' | 'nha-trang';

/** RU-имена городов по пути — как в JSON-LD BreadcrumbList (cityCrumb.name) */
const CITY_NAME_RU: Record<CityPath, string> = {
  bali: 'Бали',
  'da-nang': 'Дананг',
  'nha-trang': 'Нячанг',
};

/** RU-имя города в ПРЕДЛОЖНОМ падеже для строки «Ещё события {{city}}: афиша»
 * (предлог хранится в самой метке целиком — у «Бали» он «на», а не «в»).
 * Зеркало CITY_NAME_RU_LOCATIVE в scripts/seo-prerender.mjs — менять синхронно.
 * Новый город добавлять сюда же; нераспознанный → пустой локатив (блока нет). */
const CITY_NAME_RU_LOCATIVE: Record<CityPath, string> = {
  bali: 'на Бали',
  'da-nang': 'в Дананге',
  'nha-trang': 'в Нячанге',
};

/** EN-имена городов по пути — как labelEn в config / CITY_NAME_EN пре-рендера */
const CITY_NAME_BY_PATH: Record<CityPath, string> = {
  bali: 'Bali',
  'da-nang': 'Da Nang',
  'nha-trang': 'Nha Trang',
};

/**
 * Город события по свободному тексту ev.city → путь городской страницы:
 * Бали и его районы (Убуд, Чангу, Семиньяк, Кута, Денпасар, Гианьяр) → bali,
 * «Дананг»/«Da Nang»/«Danang» → da-nang, «Нячанг»/«Nha Trang» → nha-trang.
 * Регистронезависимо, поиск подстроки. Не распознано → null: ссылку на
 * несуществующую городскую страницу не создаём (зеркало cityCrumb в
 * scripts/seo-prerender.mjs — менять синхронно).
 */
export function cityPath(rawCity: string | null | undefined): CityPath | null {
  const city = String(rawCity ?? '').toLowerCase();
  if (!city) return null;
  if (city.includes('нячанг') || city.includes('nha trang')) return 'nha-trang';
  if (
    city.includes('дананг') ||
    city.includes('da nang') ||
    city.includes('danang')
  ) {
    return 'da-nang';
  }
  const baliKeys = [
    'бали', 'bali', 'ubud', 'убуд', 'canggu', 'чангу',
    'seminyak', 'семиньяк', 'kuta', 'кута', 'denpasar', 'gianyar',
  ];
  if (baliKeys.some((k) => city.includes(k))) return 'bali';
  return null;
}

/**
 * EN-имя города события: «Нячанг»/«Nha Trang» → Nha Trang,
 * «Дананг»/«Da Nang»/«Danang» → Da Nang, Бали и его районы (Убуд, Чангу,
 * Семиньяк, Кута, Денпасар, Гианьяр) → Bali. Не распознано → '' (пустая
 * строка = город неизвестен, EN-имя подставлять нельзя).
 */
export function cityNameEn(rawCity: string | null | undefined): string {
  const path = cityPath(rawCity);
  return path ? CITY_NAME_BY_PATH[path] : '';
}

/** Локализованное имя города для видимой хлебной крошки (как name в JSON-LD
 * BreadcrumbList). Город не распознан → '' (крошка без звена города). */
export function cityCrumbLabel(
  rawCity: string | null | undefined,
  lang: 'ru' | 'en',
): string {
  const path = cityPath(rawCity);
  if (!path) return '';
  return lang === 'en' ? CITY_NAME_BY_PATH[path] : CITY_NAME_RU[path];
}

/** Имя города в предложном падеже для строки «Ещё события {{city}}: афиша»
 * (RU): «на Бали», «в Дананге», «в Нячанге». Точное зеркало cityCrumbLabel:
 * город не распознан → '' — строка не выводится (как и сейчас, блока нет).
 * EN-вариант не нужен: в en.moreInCity предлог английский («in Nha Trang»),
 * а имя города даёт cityCrumbLabel. */
export function cityCrumbLabelLocative(
  rawCity: string | null | undefined,
): string {
  const path = cityPath(rawCity);
  if (!path) return '';
  return CITY_NAME_RU_LOCATIVE[path];
}

/** Относительный href городской страницы своего языка: '/bali/' (RU) или
 * '/en/bali/' (EN) — как страницы sitemap; null — город не распознан. */
export function cityPageHref(
  rawCity: string | null | undefined,
  lang: 'ru' | 'en',
): string | null {
  const path = cityPath(rawCity);
  if (!path) return null;
  return `${lang === 'en' ? '/en' : ''}/${path}/`;
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
