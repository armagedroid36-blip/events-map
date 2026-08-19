// Соответствие русских и английских названий городов/стран региона.
// Нужно, чтобы фильтр по городу работал на обоих языках:
// пользователь вводит «Убуд» или «Nha Trang» — находится «Ubud», «Нячанг».
const RU_TO_EN: Record<string, string> = {
  'убуд': 'ubud',
  'бали': 'bali',
  'бангкок': 'bangkok',
  'сингапур': 'singapore',
  'хошимин': 'ho chi minh',
  'чангу': 'canggu',
  'кута': 'kuta',
  'семиньяк': 'seminyak',
  'джакарта': 'jakarta',
  'куала-лумпур': 'kuala lumpur',
  'пхукет': 'phuket',
  'паттайя': 'pattaya',
  'чиангмай': 'chiang mai',
  'манила': 'manila',
  'нячанг': 'nha trang',
  'дананг': 'da nang',
  'денпасар': 'denpasar',
  'таиланд': 'thailand',
  'вьетнам': 'vietnam',
  'индонезия': 'indonesia',
  'малайзия': 'malaysia',
  'камбоджа': 'cambodia',
  'филиппины': 'philippines',
  'мьянма': 'myanmar',
  'лаос': 'laos',
};

/** Обратный словарь: английское название -> русское (для поиска EN-запросами) */
const EN_TO_RU: Record<string, string> = {
  ...Object.fromEntries(Object.entries(RU_TO_EN).map(([ru, en]) => [en, ru])),
  // Слитный вариант «Da Nang» — тоже валидное английское написание
  'danang': 'дананг',
};

/** Проверяет, что событие в городе, подходящем под запрос (RU или EN) */
export function cityMatches(city: string, query: string): boolean {
  const q = query.toLowerCase().trim();
  if (!q) return false;
  const c = city.toLowerCase();
  // Без пробелов, чтобы «da nang» и «danang» считались одним названием
  const norm = (s: string) => s.replace(/\s+/g, '');
  // 1) город содержит запрос как есть
  if (c.includes(q) || norm(c).includes(norm(q))) return true;
  // 2) запрос на русском — ищем английский перевод в названии города
  const en = RU_TO_EN[q] ?? q;
  if (en !== q && (c.includes(en) || norm(c).includes(norm(en)))) return true;
  // 3) запрос на английском — ищем русский перевод в названии города
  const ru = EN_TO_RU[q] ?? q;
  if (ru !== q && (c.includes(ru) || norm(c).includes(norm(ru)))) return true;
  return false;
}

/** Переводит русское название города/страны в английское (для поиска на карте) */
export function ruToEn(query: string): string {
  const q = query.toLowerCase().trim();
  return RU_TO_EN[q] ?? query;
}
