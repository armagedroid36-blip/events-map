// Строгий ключ «живого дубля»: одно событие у источника лежит под несколькими
// URL и/или с разными переводами названия (Cyprus Now, афиши городов).
// Ключ `title|start_date` к таким слеп, поэтому на карте появляются 2-4 точки.
//
// Строгий ключ = тот же день + тот же нормализованный город +
// пересечение значимых слов >= 3 у ЛЮБОЙ пары псевдонимов title/title_ru/title_en
// + «то же место» (адрес или координаты).
//
// Единый источник правил: используется и разовым ремонтом
// (scripts/dot-live-dupe-fix.mjs), и штатным дедупом
// (scripts/dedupe-events.mjs) — логика не копипастится.

export const STOP = new Set(['festival', 'фестиваль', 'day', 'night', 'the', 'and', 'for', 'with', 'from', '2026', '2027',
  'для', 'день', 'ночь', 'при', 'как', 'или', 'это', 'bali', 'кипр', 'cyprus', 'international', 'международный']);

// Слова-шаблоны: сами по себе не доказывают, что это одно событие
// (иначе «Деревня Рождества Фикарду» склеится с «Деревней Рождества Какопетрия»).
export const GENERIC = new Set(['village', 'деревня', 'деревне', 'деревни', 'christmas', 'рождества', 'рождественская',
  'рождественской', 'program', 'программа', 'программу', 'edition', 'выпуск', 'series', 'live', 'show', 'шоу',
  'tour', 'тур', 'event', 'race', 'забег', 'марафон', 'fest', 'music', 'музыка', 'музыки', 'theatre', 'theater',
  'театр', 'театре', 'comedy', 'комедия', 'комедии', 'night', 'nights', 'party', 'вечеринка', 'nightlife',
  'dance', 'dances', 'танца', 'танцевальные', 'танцевальный', 'представления', 'представление',
  'performance', 'performances', 'искусства', 'art',
  // сезонные/праздничные шаблоны: сами по себе не доказывают одно событие
  // (иначе «Halloween Party: Kids & Family» склеится с «Psyloween: ... Forest Party»)
  'halloween', 'хэллоуин', 'хэллоуинская', 'хэллоуинской', 'хэллоуинский', 'psyloween']);

// Топонимы-«вода»: сами по себе не доказывают одно место
// (иначе «Танцевальные представления в Ubud Palace» склеится с храмом Сарасвати).
export const PLACE_STOP = new Set(['ubud', 'bali', 'jl', 'jalan', 'raya', 'индонезия', 'indonesia', 'кипр', 'cyprus',
  'kecamatan', 'kabupaten', 'gianyar', 'лимассол', 'никосия', 'ларнака', 'пафос', 'limassol', 'nicosia',
  'pura', 'dalem', 'taman', 'banjar', 'bale', 'temple', 'храм', 'храме', 'palace', 'дворец',
  // «парк» есть в адресах десятков площадок — как общий токен места не годится
  'park', 'парк', 'парке', 'парка']);

export const norm = (s) => String(s || '').toLowerCase().replace(/[^\p{L}\p{N} ]/gu, ' ').replace(/\s+/g, ' ').trim();
export const words = (s) => [...new Set(norm(s).split(' ').filter((w) => w.length > 3 && !STOP.has(w)))];
export const aliases = (r) => [r.title, r.title_ru, r.title_en].map(norm).filter(Boolean);
export const cityKey = (r) => norm(r.city).replace(/,\s*(кипр|bali|бали|vietnam|вьетнам)$/, '');
export const dayKey = (r) => `${String(r.start_date || '').slice(0, 10)}|${cityKey(r)}`;

export const hasCoords = (r) => typeof r.lat === 'number' && typeof r.lng === 'number';
export function distanceM(a, b) {
  const R = 6371000, rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Адрес уровня города («<город>, Кипр») — источник не дал площадку. */
export const isCityLevelAddr = (r) => {
  const a = norm(r.address), c = cityKey(r), ct = c.split(' ')[0];
  return !a || a === `${c} кипр` || a === c || (c && (a === `${c} bali` || a === ct));
};

/** Одно и то же место? Общий не-шаблонный значимый токен адреса, те же координаты (±300 м)
 *  или адрес-заглушка «<город>, Кипр» у одной из карточек (источник не дал площадку). */
export function samePlace(a, b) {
  const na = norm(a.address), nb = norm(b.address);
  if (na && na === nb) return 'адрес=';
  const ws = (s) => new Set(words(s).filter((w) => !GENERIC.has(w) && !PLACE_STOP.has(w)));
  const sa = ws(na), sb = ws(nb);
  for (const w of sa) if (sb.has(w)) return `адрес~${w}`;
  if (hasCoords(a) && hasCoords(b) && distanceM(a, b) <= 300) return 'коорд≤300м';
  if ((isCityLevelAddr(a) || isCityLevelAddr(b)) && hasCoords(a) && hasCoords(b) && distanceM(a, b) <= 5000) return 'город-заглушка';
  return null;
}

/** Сколько значимых слов общих у лучшей пары псевдонимов. */
export function overlap(a, b) {
  let best = 0;
  for (const wa of aliases(a)) for (const wb of aliases(b)) {
    const sb = new Set(words(wb));
    let n = 0; for (const w of words(wa)) if (sb.has(w)) n++;
    best = Math.max(best, n);
  }
  return best;
}

/** Строгая проверка пары: причина склейки или null.
 *  Требуется тот же день и тот же город — вызывающий может группировать по dayKey(). */
export function liveDupeMatch(a, b) {
  if (dayKey(a) !== dayKey(b)) return null;
  if (overlap(a, b) < 3) return null;
  const place = samePlace(a, b);
  return place ? `живой дубль (${place})` : null;
}
