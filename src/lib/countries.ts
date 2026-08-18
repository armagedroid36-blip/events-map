// Определение страны по названию города (для фильтра «Страна» и формы).
const RULES: Array<{ keys: string[]; country: string }> = [
  { keys: ['bali', 'denpasar', 'ubud', 'canggu', 'seminyak', 'kuta', 'jakarta', 'indonesia', 'lombok', 'jimbaran', 'nusa', 'gianyar'], country: 'Индонезия' },
  { keys: ['bangkok', 'phuket', 'chiang mai', 'pattaya', 'thailand'], country: 'Таиланд' },
  { keys: ['singapore'], country: 'Сингапур' },
  { keys: ['hanoi', 'ho chi minh', 'danang', 'da nang', 'nha trang', 'hue', 'vietnam'], country: 'Вьетнам' },
  { keys: ['kuala lumpur', 'penang', 'malaysia', 'langkawi'], country: 'Малайзия' },
  { keys: ['manila', 'cebu', 'philippines'], country: 'Филиппины' },
  { keys: ['phnom penh', 'siem reap', 'cambodia'], country: 'Камбоджа' },
  { keys: ['vientiane', 'luang prabang', 'laos'], country: 'Лаос' },
  { keys: ['yangon', 'myanmar', 'mandalay'], country: 'Мьянма' },
];

/** Страна по городу (например, «Убуд, Бали» → «Индонезия»). Если не найдено — '' */
export function detectCountry(city: string | null | undefined): string {
  if (!city) return '';
  const c = city.toLowerCase();
  for (const rule of RULES) {
    if (rule.keys.some((k) => c.includes(k))) return rule.country;
  }
  return '';
}

/** Список известных стран региона (для фильтра) */
export const KNOWN_COUNTRIES = [
  'Индонезия',
  'Таиланд',
  'Сингапур',
  'Вьетнам',
  'Малайзия',
  'Филиппины',
  'Камбоджа',
  'Лаос',
  'Мьянма',
];
