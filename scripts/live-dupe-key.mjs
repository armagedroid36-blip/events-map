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

// ===== Класс «аббревиатура в названии» (S.V.E.T. / С.В.Е.Т.) =====
// Обычный words() режет «S.V.E.T.» на токены длиной 1 и выбрасывает их, поэтому
// пары одного события с аббревиатурой в названии строгий ключ не видит.
// Здесь точки схлопываются («S.V.E.T.» → «svet»), а проверка места мягче
// (общий токен адреса ИЛИ координаты ≤1 км). Калибровка 04.10.2026: 9 ложных
// пар отсеяны — правила ниже (индекс-число, дистанция >2 км у пары из 2 слов,
// слова-«вода» площадки) добавлены именно для этого.

/** Слова адреса, не доказывающие одно место. */
export const ADDR_STOP = new Set(['municipal', 'community', 'square', 'centre', 'center', 'cultural', 'площадь',
  'central', 'theatre', 'theater', 'bar', 'resto', 'hotel', 'stage', 'park', 'парк']);
/** Слова-«вода» площадки («studio», «street»): общий токен такого слова ничего не доказывает. */
export const EXTRA_STOP = new Set(['studio', 'studios', 'street', 'road', 'cafe', 'coffee']);

/** «S.V.E.T.» → «svet», «С.В.Е.Т.» → «свет». */
export const collapseAbbrev = (s) => String(s || '').replace(/(\p{L})\./gu, '$1');

// Транслитерация кириллических аббревиатур в латиницу: «свет» и «svet» — одна
// аббревиатура, записанная двумя алфавитами (реальная пара ETKO 10.10: «S.V.E.T. at ETKO»
// ↔ «С.В.Е.Т: Симфоническое оркестровое визуальное шоу», оба active, склеивались только
// по месту). Без неё такой дубль не ловит ни строгий ключ, ни аббревиатурный.
const TRANSLIT = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ж: 'zh', з: 'z', и: 'i', й: 'i', к: 'k', л: 'l',
  м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh',
  щ: 'sch', ы: 'y', э: 'e', ю: 'yu', я: 'ya', ь: '', ъ: '' };
export const translit = (s) => [...norm(s)].map((c) => (TRANSLIT[c] !== undefined ? TRANSLIT[c] : c)).join('');

/** Каноничные аббревиатуры названия: последовательности «буква+точка» (2+ подряд),
 *  схлопнутые и приведённые к латинице: «С.В.Е.Т.» → свет → svet. */
export function abbrevCanon(r) {
  const out = new Set();
  for (const t of [r.title, r.title_ru, r.title_en]) {
    const m = String(t || '').match(/(?:\p{L}\.){2,}\p{L}?/gu);
    if (!m) continue;
    for (const seq of m) out.add(translit(collapseAbbrev(seq)));
  }
  return out;
}

/** Общая аббревиатура (в любом алфавите) — и сама по себе сигнал, если день+город+место совпали. */
export function sameAbbrev(a, b) {
  const sa = abbrevCanon(a), sb = abbrevCanon(b);
  for (const w of sa) if (sb.has(w) && w.length >= 2) return w;
  return null;
}

/** Слова названия для аббревиатурного ключа: длина 2+, есть буква. */
export const abbrevWords = (s) => [...new Set(norm(collapseAbbrev(s)).split(' ')
  .filter((w) => w.length > 2 && /\p{L}/u.test(w) && !STOP.has(w) && !GENERIC.has(w)))];

/** Сколько значимых слов общих у лучшей пары псевдонимов (с учётом аббревиатур). */
export function abbrevOverlap(a, b) {
  let best = 0;
  for (const ta of [a.title, a.title_ru, a.title_en].filter(Boolean).map(collapseAbbrev))
    for (const tb of [b.title, b.title_ru, b.title_en].filter(Boolean).map(collapseAbbrev)) {
      const sb = new Set(abbrevWords(tb));
      let n = 0;
      for (const w of abbrevWords(ta)) if (sb.has(w)) n++;
      best = Math.max(best, n);
    }
  return best;
}

/** Проверка пары с аббревиатурой в названии: причина склейки или null.
 *  Сигнал: 3+ общих слова по имени ИЛИ 2 слова + общий токен адреса.
 *  Место: общий токен адреса ИЛИ координаты ≤1 км (адрес-заглушка «<город>, Кипр»
 *  у обеих карточек не считается — там координаты = центр города). */
export function liveAbbrevMatch(a, b) {
  if (dayKey(a) !== dayKey(b)) return null;
  const placeTokens = (s) => new Set(words(s).filter((w) => !GENERIC.has(w) && !PLACE_STOP.has(w) && !ADDR_STOP.has(w)));
  const sa = placeTokens(norm(a.address)), sb = placeTokens(norm(b.address));
  let common = null;
  for (const w of sa) if (sb.has(w)) { common = w; break; }
  const stubBoth = isCityLevelAddr(a) && isCityLevelAddr(b);
  const near = hasCoords(a) && hasCoords(b) ? distanceM(a, b) : null;
  const ov = abbrevOverlap(a, b);
  const ab = sameAbbrev(a, b);
  const why = ov >= 3 ? `аббрев-имя ${ov}сл`
    : (ov >= 2 && common) ? `аббрев-имя ${ov}сл+адрес~${common}`
      : (ab && (common || (near !== null && near <= 300))) ? `общая аббревиатура ${ab}`
        : null;
  if (!why) return null;
  const near1k = !stubBoth && near !== null && near <= 1000;
  if (!common && !near1k) return null;
  if (ov < 3 && common && /^\d+$/.test(common)) return null;       // почтовый индекс/номер дома
  if (ov < 3 && near !== null && near > 2000) return null;          // разные площадки в разных концах города
  if (ov < 3 && common && EXTRA_STOP.has(common)) return null;      // «studio»/«street» — вода
  return why + (near !== null ? ` / ${Math.round(near)}м` : '');
}
