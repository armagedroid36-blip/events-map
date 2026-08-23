// Справочник стран и определение страны по названию города.
//
// Канонический код страны (например 'indonesia') — ЕДИНОЕ значение фильтра
// «Страна» и поля country события. Отображаемое название выбирается
// из COUNTRY_NAMES по языку интерфейса (ru/en).

/** Названия страны на двух языках */
export interface CountryName {
  ru: string;
  en: string;
}

/** Код страны -> названия на двух языках */
export const COUNTRY_NAMES: Record<string, CountryName> = {
  indonesia: { ru: 'Индонезия', en: 'Indonesia' },
  thailand: { ru: 'Таиланд', en: 'Thailand' },
  singapore: { ru: 'Сингапур', en: 'Singapore' },
  vietnam: { ru: 'Вьетнам', en: 'Vietnam' },
  malaysia: { ru: 'Малайзия', en: 'Malaysia' },
  philippines: { ru: 'Филиппины', en: 'Philippines' },
  cambodia: { ru: 'Камбоджа', en: 'Cambodia' },
  laos: { ru: 'Лаос', en: 'Laos' },
  myanmar: { ru: 'Мьянма', en: 'Myanmar' },
  brunei: { ru: 'Бруней', en: 'Brunei' },
  timorleste: { ru: 'Восточный Тимор', en: 'East Timor' },
  taiwan: { ru: 'Тайвань', en: 'Taiwan' },
  hongkong: { ru: 'Гонконг', en: 'Hong Kong' },
  srilanka: { ru: 'Шри-Ланка', en: 'Sri Lanka' },
  maldives: { ru: 'Мальдивы', en: 'Maldives' },
  nepal: { ru: 'Непал', en: 'Nepal' },
  qatar: { ru: 'Катар', en: 'Qatar' },
  georgia: { ru: 'Грузия', en: 'Georgia' },
  kazakhstan: { ru: 'Казахстан', en: 'Kazakhstan' },
  egypt: { ru: 'Египет', en: 'Egypt' },
  turkey: { ru: 'Турция', en: 'Turkey' },
  russia: { ru: 'Россия', en: 'Russia' },
  australia: { ru: 'Австралия', en: 'Australia' },
  japan: { ru: 'Япония', en: 'Japan' },
  southkorea: { ru: 'Южная Корея', en: 'South Korea' },
  china: { ru: 'Китай', en: 'China' },
  india: { ru: 'Индия', en: 'India' },
  uae: { ru: 'ОАЭ', en: 'UAE' },
  oman: { ru: 'Оман', en: 'Oman' },
};

/** Список стран для фильтра (все ЮВА + популярные у туристов/экспатов) */
export const KNOWN_COUNTRIES: string[] = [
  'indonesia',
  'thailand',
  'singapore',
  'vietnam',
  'malaysia',
  'philippines',
  'cambodia',
  'laos',
  'myanmar',
  'brunei',
  'timorleste',
  'taiwan',
  'hongkong',
  'srilanka',
  'maldives',
  'nepal',
  'qatar',
  'georgia',
  'kazakhstan',
  'egypt',
  'turkey',
  'russia',
  'australia',
  'japan',
  'southkorea',
  'china',
  'india',
  'uae',
  'oman',
];

/**
 * Справочник город -> страна. Ключи совпадают с фрагментом названия города
 * (латиница и кириллица) — города в базе хранятся вперемешку
 * («Нячанг», «Убуд, Bali», «Ho Chi Minh City»).
 */
const RULES: Array<{ keys: string[]; country: string }> = [
  { keys: ['bali', 'denpasar', 'ubud', 'canggu', 'seminyak', 'kuta', 'jakarta', 'indonesia', 'lombok', 'jimbaran', 'nusa', 'gianyar', 'бали', 'убуд', 'чангу', 'семиньяк', 'кута', 'джакарта', 'денпасар', 'гианьяр', 'табанан', 'сукавати', 'переренан', 'тибубененг', 'печату', 'букит', 'беноа', 'далунг', 'чемаги', 'балиан'], country: 'indonesia' },
  { keys: ['bangkok', 'phuket', 'chiang mai', 'pattaya', 'thailand', 'бангкок', 'пхукет', 'чиангмай', 'паттайя'], country: 'thailand' },
  { keys: ['singapore', 'сингапур'], country: 'singapore' },
  { keys: ['hanoi', 'ho chi minh', 'danang', 'da nang', 'nha trang', 'hue', 'vietnam', 'ханой', 'хошимин', 'дананг', 'нячанг', 'хюэ', 'phuoc', 'phươc', 'фыок'], country: 'vietnam' },
  { keys: ['kuala lumpur', 'penang', 'malaysia', 'langkawi', 'куала-лумпур', 'малайзия', 'пенанг'], country: 'malaysia' },
  { keys: ['manila', 'cebu', 'philippines', 'манила', 'филиппины', 'себу'], country: 'philippines' },
  { keys: ['phnom penh', 'siem reap', 'cambodia', 'samaki', 'meanchey', 'пномпень', 'сиемреап', 'самаки'], country: 'cambodia' },
  { keys: ['vientiane', 'luang prabang', 'laos', 'вьентьян', 'луангпрабанг'], country: 'laos' },
  { keys: ['yangon', 'myanmar', 'mandalay', 'янгон', 'мандалай', 'мьянма'], country: 'myanmar' },
  { keys: ['brunei', 'bandar seri', 'бруней'], country: 'brunei' },
  { keys: ['dili', 'timor', 'дили', 'тимор'], country: 'timorleste' },
  { keys: ['taipei', 'taiwan', 'тайбэй', 'тайвань'], country: 'taiwan' },
  { keys: ['hong kong', 'гонконг'], country: 'hongkong' },
  { keys: ['colombo', 'negombo', 'sri lanka', 'коломбо', 'негомбо', 'шри-ланка'], country: 'srilanka' },
  { keys: ['malé', 'male', 'maldives', 'мале', 'мальдивы'], country: 'maldives' },
  { keys: ['kathmandu', 'nepal', 'катманду', 'непал'], country: 'nepal' },
  { keys: ['doha', 'qatar', 'доха', 'катар'], country: 'qatar' },
  { keys: ['tbilisi', 'batumi', 'georgia', 'тбилиси', 'батуми', 'грузия'], country: 'georgia' },
  { keys: ['almaty', 'astana', 'kazakhstan', 'алматы', 'астана', 'казахстан'], country: 'kazakhstan' },
  { keys: ['cairo', 'hurghada', 'sharm', 'egypt', 'каир', 'хургада', 'шарм', 'египет'], country: 'egypt' },
  { keys: ['istanbul', 'antalya', 'alanya', 'bodrum', 'turkey', 'стамбул', 'анталья', 'алания', 'бодрум', 'турция'], country: 'turkey' },
  { keys: ['moscow', 'saint petersburg', 'petersburg', 'sochi', 'russia', 'москва', 'санкт-петербург', 'сочи', 'россия', 'колпино', 'спб'], country: 'russia' },
  { keys: ['sydney', 'melbourne', 'perth', 'brisbane', 'australia', 'сидней', 'мельбурн', 'австралия'], country: 'australia' },
  { keys: ['tokyo', 'osaka', 'kyoto', 'japan', 'токио', 'осака', 'киото', 'япония'], country: 'japan' },
  { keys: ['seoul', 'busan', 'korea', 'сеул', 'пусан', 'корея'], country: 'southkorea' },
  { keys: ['beijing', 'shanghai', 'shenzhen', 'china', 'пекин', 'шанхай', 'шенчжэнь', 'китай'], country: 'china' },
  { keys: ['mumbai', 'delhi', 'goa', 'bengaluru', 'bangalore', 'india', 'мумбаи', 'дели', 'гоа', 'индия', 'бангалор'], country: 'india' },
  { keys: ['dubai', 'abu dhabi', 'sharjah', 'uae', 'дубай', 'абу-даби', 'шарджа'], country: 'uae' },
  { keys: ['suwayri', 'suwayq', 'muscat', 'oman', 'мускат', 'сувайк', 'оман'], country: 'oman' },
];

/** Страна по названию города (канонический код). Не найдено — '' */
export function detectCountry(city: string | null | undefined): string {
  if (!city) return '';
  const c = city.toLowerCase();
  for (const rule of RULES) {
    if (rule.keys.some((k) => c.includes(k))) return rule.country;
  }
  return '';
}

/**
 * Приводит сохранённое значение страны к каноническому коду:
 * принимает код ('indonesia'), русское или английское название.
 * Неизвестное значение возвращается как есть (чтобы одинаковые значения
 * в базе совпадали в фильтре).
 */
export function normalizeCountry(country?: string | null): string {
  if (!country) return '';
  const v = country.trim().toLowerCase();
  if (COUNTRY_NAMES[v]) return v;
  for (const [code, n] of Object.entries(COUNTRY_NAMES)) {
    if (v === n.ru.toLowerCase() || v === n.en.toLowerCase()) return code;
  }
  return v;
}

/** Страна события: из поля country, иначе из справочника по городу */
export function eventCountry(ev: { country?: string | null; city?: string | null }): string {
  return normalizeCountry(ev.country) || detectCountry(ev.city);
}
