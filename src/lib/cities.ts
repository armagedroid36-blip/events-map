// Соответствие русских и английских названий городов/стран региона.
// Нужно, чтобы фильтр по городу работал на обоих языках:
// пользователь вводит «Убуд» или «Бангкок» — находится «Ubud», «Bangkok».
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
  'таиланд': 'thailand',
  'вьетнам': 'vietnam',
  'индонезия': 'indonesia',
  'малайзия': 'malaysia',
  'камбоджа': 'cambodia',
  'филиппины': 'philippines',
  'мьянма': 'myanmar',
  'лаос': 'laos',
};

/** Проверяет, что событие в городе, подходящем под запрос (RU или EN) */
export function cityMatches(city: string, query: string): boolean {
  const q = query.toLowerCase().trim();
  if (!q) return false;
  const c = city.toLowerCase();
  if (c.includes(q)) return true;
  const en = RU_TO_EN[q] ?? q;
  if (en !== q && c.includes(en)) return true;
  return false;
}
