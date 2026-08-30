// Справочник ISO-2 кодов стран -> названия на двух языках + хелперы
// флагов и имён. Используется в статистике посещений по странам
// (visits_country_daily хранит коды ISO-2, напр. 'RU', 'ID', 'unknown').

/** Название страны на двух языках */
export interface CountryName {
  ru: string;
  en: string;
}

/** ISO-2 код -> названия (популярные страны аудитории сайта) */
export const ISO_COUNTRY_NAMES: Record<string, CountryName> = {
  RU: { ru: 'Россия', en: 'Russia' },
  ID: { ru: 'Индонезия', en: 'Indonesia' },
  VN: { ru: 'Вьетнам', en: 'Vietnam' },
  TH: { ru: 'Таиланд', en: 'Thailand' },
  SG: { ru: 'Сингапур', en: 'Singapore' },
  MY: { ru: 'Малайзия', en: 'Malaysia' },
  PH: { ru: 'Филиппины', en: 'Philippines' },
  KH: { ru: 'Камбоджа', en: 'Cambodia' },
  LA: { ru: 'Лаос', en: 'Laos' },
  MM: { ru: 'Мьянма', en: 'Myanmar' },
  BN: { ru: 'Бруней', en: 'Brunei' },
  TL: { ru: 'Восточный Тимор', en: 'East Timor' },
  TW: { ru: 'Тайвань', en: 'Taiwan' },
  HK: { ru: 'Гонконг', en: 'Hong Kong' },
  LK: { ru: 'Шри-Ланка', en: 'Sri Lanka' },
  MV: { ru: 'Мальдивы', en: 'Maldives' },
  NP: { ru: 'Непал', en: 'Nepal' },
  QA: { ru: 'Катар', en: 'Qatar' },
  GE: { ru: 'Грузия', en: 'Georgia' },
  KZ: { ru: 'Казахстан', en: 'Kazakhstan' },
  EG: { ru: 'Египет', en: 'Egypt' },
  TR: { ru: 'Турция', en: 'Turkey' },
  AU: { ru: 'Австралия', en: 'Australia' },
  JP: { ru: 'Япония', en: 'Japan' },
  KR: { ru: 'Южная Корея', en: 'South Korea' },
  CN: { ru: 'Китай', en: 'China' },
  IN: { ru: 'Индия', en: 'India' },
  AE: { ru: 'ОАЭ', en: 'UAE' },
  OM: { ru: 'Оман', en: 'Oman' },
  US: { ru: 'США', en: 'USA' },
  GB: { ru: 'Великобритания', en: 'UK' },
  DE: { ru: 'Германия', en: 'Germany' },
  FR: { ru: 'Франция', en: 'France' },
  ES: { ru: 'Испания', en: 'Spain' },
  IT: { ru: 'Италия', en: 'Italy' },
  NL: { ru: 'Нидерланды', en: 'Netherlands' },
  PL: { ru: 'Польша', en: 'Poland' },
  UA: { ru: 'Украина', en: 'Ukraine' },
  CZ: { ru: 'Чехия', en: 'Czech Republic' },
  IL: { ru: 'Израиль', en: 'Israel' },
  BR: { ru: 'Бразилия', en: 'Brazil' },
  MX: { ru: 'Мексика', en: 'Mexico' },
  AR: { ru: 'Аргентина', en: 'Argentina' },
  CA: { ru: 'Канада', en: 'Canada' },
  NZ: { ru: 'Новая Зеландия', en: 'New Zealand' },
  ZA: { ru: 'ЮАР', en: 'South Africa' },
  // Частые в статистике туристического сайта
  CH: { ru: 'Швейцария', en: 'Switzerland' },
  SE: { ru: 'Швеция', en: 'Sweden' },
  NO: { ru: 'Норвегия', en: 'Norway' },
  FI: { ru: 'Финляндия', en: 'Finland' },
  DK: { ru: 'Дания', en: 'Denmark' },
  AT: { ru: 'Австрия', en: 'Austria' },
  BE: { ru: 'Бельгия', en: 'Belgium' },
  PT: { ru: 'Португалия', en: 'Portugal' },
  GR: { ru: 'Греция', en: 'Greece' },
  IE: { ru: 'Ирландия', en: 'Ireland' },
  RO: { ru: 'Румыния', en: 'Romania' },
  HU: { ru: 'Венгрия', en: 'Hungary' },
  BG: { ru: 'Болгария', en: 'Bulgaria' },
  HR: { ru: 'Хорватия', en: 'Croatia' },
  RS: { ru: 'Сербия', en: 'Serbia' },
  LT: { ru: 'Литва', en: 'Lithuania' },
  LV: { ru: 'Латвия', en: 'Latvia' },
  EE: { ru: 'Эстония', en: 'Estonia' },
  SK: { ru: 'Словакия', en: 'Slovakia' },
};

/** Эмодзи-флаг из ISO-2 кода ('RU' → 🇷🇺). 'unknown'/некорректные → 🌐 */
export function countryFlag(code: string): string {
  if (!code || code.length !== 2) return '🌐';
  const c = code.toUpperCase();
  const a = c.charCodeAt(0);
  const b = c.charCodeAt(1);
  if (a < 65 || a > 90 || b < 65 || b > 90) return '🌐';
  return String.fromCodePoint(a + 127397, b + 127397);
}

/** Название страны по коду и языку интерфейса; нет в справочнике → сам код */
export function countryName(code: string, lang: 'ru' | 'en'): string {
  const entry = ISO_COUNTRY_NAMES[code.toUpperCase()];
  if (!entry) return code;
  return entry[lang];
}
