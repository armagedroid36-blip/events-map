// Единый вид валюты карточки. Исторически источники писали код и в ВЕРХНЕМ
// регистре (театр-заглушки, TG-групповые афиши: 'IDR', 'USD', 'VND'), и в нижнем
// (Балифорум, Cyprus Now, Cyprus.BZ: 'idr', 'vnd', 'eur'). Фильтр на сайте
// сравнивает код СТРОГО (`eventFilters.ts`: ev.currency !== filters.currency),
// а список в фильтре — нижний регистр из i18n, поэтому карточки с 'IDR' не
// находились фильтром «Индонезийская рупия». Канон — нижний регистр.
//
// Ключ дедупа (city|title+address) валюту не использует, поэтому нормализация
// безопасна для повторного сбора: дублей она не создаёт.

export const CURRENCIES = [
  'usd', 'eur', 'rub', 'idr', 'thb', 'vnd', 'sgd', 'myr', 'gbp', 'aud',
  'inr', 'cny', 'jpy', 'krw', 'chf', 'try', 'aed', 'php',
];

const ALIASES = {
  '$': 'usd', 'us$': 'usd', 'доллар': 'usd', 'долл': 'usd',
  '€': 'eur', 'евро': 'eur',
  '₽': 'rub', 'руб': 'rub', 'р.': 'rub',
  'rp': 'idr', 'рупия': 'idr', 'рупий': 'idr',
  '฿': 'thb', 'бат': 'thb',
  '₫': 'vnd', 'đ': 'vnd', 'донг': 'vnd',
  's$': 'sgd', '£': 'gbp', '₹': 'inr', '¥': 'cny', '₱': 'php',
};

/** Код валюты → канон (нижний регистр) или null, если код не распознан. */
export function cleanCurrency(value) {
  if (value == null) return null;
  if (typeof value === 'number') return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const low = raw.toLowerCase();
  if (ALIASES[low]) return ALIASES[low];
  // 'IDR', 'Idr', ' idr ' → 'idr'; прочие коды с буквами длины 3 тоже приводим
  const code = low.replace(/[^a-z]/g, '');
  if (CURRENCIES.includes(code)) return code;
  return null;
}

/** Цена карточки: валюта без цены бессмысленна (карточка печатает только сумму). */
export function cleanMoney(price, currency) {
  const p = typeof price === 'number' && Number.isFinite(price) ? price : null;
  const c = cleanCurrency(currency);
  if (p == null) return { price: null, currency: null };
  return { price: p, currency: c };
}
