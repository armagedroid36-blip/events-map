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
  'для', 'день', 'ночь', 'при', 'как', 'или', 'это', 'bali', 'кипр', 'cyprus', 'international', 'международный',
  // «Что это за событие» и месяц: не доказывают, что событие ОДНО.
  // Без них разные фильмы одного кинотеатра склеивались («Кинопоказ Gran Torino
  // в Paradiso Ubud 9 октября» ↔ «Кинопоказ Brave в Paradiso Ubud 9 октября»:
  // общих слов 4 — кинопоказ/paradiso/ubud/октября — и общий адрес).
  'кинопоказ', 'показ', 'показа', 'screening', 'screening', 'film', 'movie', 'кино',
  // «Чем это событие является» (занятие/класс/урок): не доказывает, что занятие ОДНО.
  // Прогон 38601237058: «Занятие по Робототехнике в Unicorns» (16:00) склеилось с
  // «Занятие по рисованию в Unicorns» (12:00) — общих 2 слова (занятие+unicorns),
  // но различающее слово (робототехнике/рисованию) разное → ложный архив.
  'занятие', 'занятия', 'занятий', 'класс', 'class', 'classes', 'урок', 'уроки',
  'lesson', 'lessons', 'workshop', 'воркшоп', 'мастер',
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября',
  'октября', 'ноября', 'декабря',
  'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september',
  // Греческие служебные слова названия фестиваля: у программы «Διεθνές Φεστιβάλ
  // Λευκωσίας 2026» РАЗНЫЕ концерты одного вечера на одной площадке давали по
  // греческому псевдониму 3 общих слова (διεθνές/φεστιβάλ/λευκωσίας) + общий адрес
  // → ложная склейка (прогон 38024912841: ΙΔΑΙΟΝ PROJECT ↔ Andreas Krambias Quintet,
  // 24.10 19:00, Nicosia Municipal Theatre). Тип события — не признак одного события.
  'διεθνές', 'φεστιβάλ', 'λευκωσίας',
  'october', 'november', 'december',
  // Бренд программы студии, а не событие: у Kuns Studio (Никосия, 07.11) две РАЗНЫЕ
  // гончарные мастерские названы «… – One Off Experience» и склеились по общим
  // one/off/experience + адресу, хотя идут в 10:30 и 15:30 (прогон 39003436064,
  // «Fruit Bowl Hand-Building and Paint» ↔ «Breakfast Set of 2»).
  'one', 'off', 'experience', 'workshops',
  // «workshop» (единственное число) — тип занятия, а не признак одного события:
  // у Pangolin (Улувату) в один день идут РАЗНЫЕ мастерские с общим «Pangolin Creative
  // Workshop» в названии («Plaster Painting» 16:30 ↔ «Slime» 16:30), и дедуп склеивал их
  // по pangolin/creative/workshop + общему адресу. Plaster Painting 17–18.11 ушёл в архив
  // без единого живого близнеца (прогон 44171736504, разбор 17.11.2026).
  'workshop', 'master', 'class', 'classes',
  // РУССКИЕ эквиваленты того же типа занятия — без них правка выше не работала на
  // русских псевдонимах (замер 19.11.2026 по волне сбора 04:40Z): у Pangolin (Улувату)
  // «Творческая мастерская Pangolin: мастер-класс …» (16:30) склеилась с
  // «Творческая мастерская Pangolin: украшение перьев …» (08:00) по общим
  // творческая/мастерская/pangolin, а «Клуб панголинов для детей» — с
  // «Клуб для детей Pangolin: мастер-класс по созданию …». 7 карточек одной волны
  // ушли в архив без живого близнеца и на карту не попали.
  'творческая', 'творческой', 'мастерская', 'мастерской', 'мастерские',
  'клуб', 'клуба', 'клубе', 'детей', 'детский', 'детские', 'детская',
  'няня', 'услуги',
  // Название самой студии в заголовке — тоже не признак одного события
  // (Pangolin/Панголин: «Клуб панголинов для детей» 08:00 ↔ «КЛУБ ДЛЯ ДЕТЕЙ
  // PANGOLIN: УСЛУГИ НЯНИ» 09:00 склеивались ветвью «2 слова + адрес~»).
  'pangolin', 'панголин', 'панголинов',
  // Пункт назначения и тип активности тура, а не его название (19.11.2026, прогон
  // 44568813589): у одного оператора Мегатикса в Сануре на 20.11 07:00 стоят два РАЗНЫХ
  // тура — «Poseidon Voyage - Sport Fishing + 4 Spots Snorkeling at Nusa Penida» и
  // «Azure Odyssey - Land Tour Nusa Penida + Snorkeling at Manta Point». Общие
  // nusa/penida/snorkeling давали 3 слова + тот же пирс отправления ⇒ «живой дубль»,
  // тур-рыбалка уходил в архив. Различающее слово (Poseidon/Azure, fishing/land tour)
  // в названии есть — значит склейка ложная.
  // Русские псевдонимы тех же карточек дали ТУ ЖЕ пару на следующий день (19.11.2026,
  // DRY dedupe по 1518 живым): «Лазурная одиссея - наземный тур по Нуса-Пенида + снорклинг
  // на Манта-Пойнт» ↔ «Poseidon Voyage - Спортивная рыбалка + снорклинг в 4 местах на
  // Нуса-Пениде» — общие «нуса» + «снорклинг» (форма «пенида»/«пениде» не совпала) давали
  // ov=2 при том же пирсе Sanur Harbour ⇒ 15c33473 снова уходил в архив. Латинские
  // стоп-слова не работают на кириллице — нужны обе формы.
  'snorkeling', 'nusa', 'penida', 'tour',
  'нуса', 'пенида', 'пениде', 'пениду', 'пениды', 'снорклинг', 'снорклинга', 'снорклинге']);



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

// Служебные/местоименные слова RU и EN: сами по себе не доказывают, что событие ОДНО.
// Прогон 38282590591: «Йога у ОКЕАНУСА для тех, кто хочет результат» (здание Атласа
// на 6 этаже, 09:30) ↔ «ЙОГА ДЛЯ ТЕХ, КОМУ «ПРОСТО ПОТЯНУТЬСЯ» НЕДОСТАТОЧНО»
// (Orhideya Ballet Studio, 08:00–10:30) — РАЗНЫЕ занятия (разные площадки в 219 м,
// разные часы и инструкторы), но англ. псевдонимы дали «3 общих слова»
// yoga/those/who, где два последних — служебные. Ветка «имя 3сл» склеила их.
export const FUNC = new Set([
  // EN
  'who', 'whose', 'whom', 'those', 'these', 'this', 'that', 'than', 'then', 'there', 'here',
  'they', 'them', 'their', 'your', 'yours', 'you', 'our', 'ours', 'will', 'would', 'can', 'could',
  'should', 'have', 'has', 'had', 'just', 'more', 'most', 'need', 'needs', 'want', 'wants',
  'about', 'into', 'over', 'very', 'also', 'only', 'some', 'any', 'all', 'come', 'comes',
  // RU
  'тех', 'кто', 'кому', 'кем', 'чем', 'что', 'чтобы', 'себе', 'меня', 'тебя', 'вас', 'нас',
  'них', 'если', 'тоже', 'также', 'очень', 'всех', 'всем', 'будет', 'будем', 'есть', 'можно',
  'нужно', 'надо', 'этом', 'этого', 'этой', 'такие', 'такой', 'много', 'даже', 'еще', 'ещё',
  'когда', 'где']);

export const norm = (s) => String(s || '').toLowerCase().replace(/[^\p{L}\p{N} ]/gu, ' ').replace(/\s+/g, ' ').trim();
export const words = (s) => [...new Set(norm(s).split(' ').filter((w) => w.length > 3 && !STOP.has(w) && !FUNC.has(w)))];
export const aliases = (r) => [r.title, r.title_ru, r.title_en].map(norm).filter(Boolean);
export const cityKey = (r) => norm(r.city).replace(/,\s*(кипр|bali|бали|vietnam|вьетнам)$/, '');
export const dayKey = (r) => `${String(r.start_date || '').slice(0, 10)}|${cityKey(r)}`;

export const hasCoords = (r) => typeof r.lat === 'number' && typeof r.lng === 'number';
/** Разница времени начала в минутах (null, если у одной из карточек время не задано). */
export function timeDiffMin(a, b) {
  const parse = (t) => {
    const m = String(t || '').match(/^(\d{1,2}):(\d{2})/);
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  };
  const ta = parse(a.start_time), tb = parse(b.start_time);
  if (ta === null || tb === null) return null;
  let d = Math.abs(ta - tb);
  if (d > 720) d = 1440 - d;   // полночь: 23:30 и 00:30 — 60 минут, а не 23 часа
  return d;
}
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
  // Время начала решает, дубль это или разные сеансы на одной площадке (кейс 23.11.2026:
  // «Christmas Films at Ayia Napa Marina» 17:00 ↔ «Рождественская деревня …» 11:00 —
  // одно и то же место и общие слова, но разные события; без этой ветки шаг дедупа
  // архивировал кинопоказ). Та же логика, что в liveAbbrevMatch (правка 1007).
  const td = timeDiffMin(a, b);
  if (td !== null && td > 60) return null;
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
// Греческий алфавит: без него «Σατιρικό» и «Сатирико» (→ satiriko) не совпадали,
// и кросс-источниковые дубли одного события (греческий источник + RU-агрегатор)
// жили в БД двумя карточками. Диакритика снимается через NFD до замены.
const TRANSLIT_GR = {
  'ς': 's', σ: 's', α: 'a', β: 'v', γ: 'g', δ: 'd', ε: 'e', ζ: 'z', η: 'i', θ: 'th',
  ι: 'i', κ: 'k', λ: 'l', μ: 'm', ν: 'n', ξ: 'x', ο: 'o', π: 'p', ρ: 'r', τ: 't',
  υ: 'y', φ: 'f', χ: 'ch', ψ: 'ps', ω: 'o',
};
export const translit = (s) =>
  [...norm(String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, ''))]
    .map((c) => (TRANSLIT[c] !== undefined ? TRANSLIT[c] : TRANSLIT_GR[c] !== undefined ? TRANSLIT_GR[c] : c))
    .join('');

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

/** Слова названия для аббревиатурного ключа: длина 2+, есть буква.
 *  Топонимы площадки (PLACE_STOP: ubud, bali, limassol, …) исключены: слова
 *  самой площадки не доказывают, что событие одно — иначе разные фильмы одного
 *  кинотеатра («Кинопоказ Gran Torino в Paradiso Ubud» ↔ «…Sense and
 *  Sensibility…») склеивались по 2 общим словам + общему токену адреса. */
export const abbrevWords = (s) => [...new Set(norm(collapseAbbrev(s)).split(' ')
  .filter((w) => w.length > 2 && /\p{L}/u.test(w) && !STOP.has(w) && !GENERIC.has(w)
    && !PLACE_STOP.has(w) && !ADDR_STOP.has(w) && !EXTRA_STOP.has(w) && !FUNC.has(w)))];

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

// ===== Класс «одно место в двух языках» (RU ↔ EN) =====
// У двух зеркал адрес ОДНОЙ площадки записан разными алфавитами, а координаты
// второго источника стоят на центровой точке города (или отсутствуют), поэтому
// строгий ключ и аббревиатурный такие пары пропускают:
//   «Муниципальный садовый театр „Мариос Токас“» ↔ «Marios Tokas Municipal Garden Theatre»
//   «Skali Amphitheatre, Aglantzia»              ↔ «Скали Агланцияс»
// Условия намеренно жёсткие (иначе правило начнёт архивировать живые события):
// тот же день + тот же город + ТО ЖЕ время + 3+ общих значимых слова названия
// + общий топоним адреса после транслитерации; адреса-заглушки «<город>, Кипр»
// места не называют и правило не включают.

const PLACE_STOP_ALL = ADDR_STOP; // ссылка для читаемости ниже

/** Токены адреса, приведённые к латинице (для сравнения RU↔EN). */
export function langTokensOf(address) {
  const out = new Set();
  for (const w of norm(address).split(' ')) {
    const t = translit(w);
    if (t.length >= 4 && !STOP.has(t) && !GENERIC.has(t) && !PLACE_STOP.has(t)
      && !PLACE_STOP_ALL.has(t) && !EXTRA_STOP.has(t) && !STOP.has(w) && !GENERIC.has(w)
      && !PLACE_STOP.has(w) && !PLACE_STOP_ALL.has(w) && !EXTRA_STOP.has(w)) out.add(t);
  }
  return out;
}

const commonPrefix = (x, y) => {
  let i = 0;
  while (i < x.length && i < y.length && x[i] === y[i]) i++;
  return i;
};

/** Общие топонимы адресов (в т.ч. один и тот же в двух алфавитах). */
export function langPlaceTokens(a, b) {
  const ta = langTokensOf(a.address), tb = langTokensOf(b.address);
  const out = new Set();
  for (const x of ta) for (const y of tb) {
    if (x === y) { out.add(x); continue; }
    const [s, l] = x.length <= y.length ? [x, y] : [y, x];
    if (s.length >= 5 && l.startsWith(s)) { out.add(s); continue; }   // «marios» → «marios…»
    const cp = commonPrefix(x, y);
    if (cp >= 6) out.add(x.slice(0, cp));                             // «aglantsiyas» ~ «aglantzia»
  }
  return out;
}

/** Время «00:00» (и пустое) — это НЕ значение, а «источник не дал время». */
export const isUnknownTime = (t) => {
  const s = String(t || '').slice(0, 5);
  return !s || s === '00:00';
};

/** Проверка пары «одно место в двух языках»: причина склейки или null. */
export function liveLangPlaceMatch(a, b) {
  if (dayKey(a) !== dayKey(b)) return null;
  const ta = String(a.start_time || '').slice(0, 5), tb = String(b.start_time || '').slice(0, 5);
  // Одно неизвестное время (пусто/00:00) не мешает паре; оба известных и
  // разные — это разные сеансы.
  if (!isUnknownTime(ta) && !isUnknownTime(tb) && ta !== tb) return null;
  if (overlap(a, b) < 3) return null;
  const t = [...langPlaceTokens(a, b)];
  // Адрес-заглушка уровня города у ОДНОЙ карточки не блокирует пару, если у
  // второй есть отличительный топоним площадки: место доказывает вторая.
  const bothStub = isCityLevelAddr(a) && isCityLevelAddr(b);
  if (bothStub) return null;
  if (!t.length) return null;
  return `одно место в двух языках (${t.slice(0, 2).join(', ')})`;
}

// ===== Класс «одно событие из двух источников, разные алфавиты» =====
// Греческий источник + RU/EN-агрегатор дают ДВЕ карточки одного события:
// названия на разных языках, адреса «Κεντρική Πλατεία Αχερίτου» ↔ «Фамагуста,
// Кипр» (заглушка уровня города), у одной время-заглушка 00:00. После
// транслитерации (translit знает греческий) сравниваем токены названий и
// топонимы; склейка — только при доказанном месте.

/** Алфавит строки: greek / cyrillic / latin / other. */
export function scriptOf(s) {
  const str = String(s || '');
  if (/[\u0370-\u03ff\u1f00-\u1fff]/.test(str)) return 'greek';
  if (/[\u0400-\u04ff]/.test(str)) return 'cyrillic';
  if (/[a-z]/i.test(str)) return 'latin';
  return 'other';
}

const FOLD_STOP = new Set([...STOP, ...FUNC, ...GENERIC, ...PLACE_STOP]);

/** Значимые токены названия после транслитерации (STOP/GENERIC/служебные — мимо). */
export function foldedTitleTokens(r) {
  const out = new Set();
  for (const t of [r.title, r.title_ru, r.title_en]) {
    if (!t) continue;
    for (const w of translit(collapseAbbrev(t)).split(' ')) {
      if (w.length > 2 && !FOLD_STOP.has(w)) out.add(w);
    }
  }
  return out;
}

/** Токены адреса после транслитерации (площадные: без «воды» и служебных). */
export function foldedPlaceTokens(address) {
  const out = new Set();
  for (const w of translit(address).split(' ')) {
    if (w.length >= 4 && !FOLD_STOP.has(w) && !ADDR_STOP.has(w) && !EXTRA_STOP.has(w)) out.add(w);
  }
  return out;
}

const sameToken = (x, y) => {
  if (!x || !y) return false;
  if (x === y) return true;
  if (x.length >= 5 && y.length >= 5 && (x.startsWith(y) || y.startsWith(x))) return true;
  return commonPrefix(x, y) >= 5;
};

/**
 * Кросс-источниковый дубль (греческий ↔ RU/EN): тот же день, та же категория,
 * тот же город, 2+ общих значимых токена названия после транслитерации и
 * доказанное место — общий топоним адреса/названия, координаты ≤300 м или
 * (разные алфавиты адресов + ≤2 км). Разное известное время (>60 мин) —
 * разные сеансы, не дубль.
 */
/**
 * Кросс-источниковый дубль (греческий источник ↔ RU/EN агрегатор).
 *
 * Высокая точность важнее полноты: такие пары склеиваются только при
 * ДОКАЗАННОМ совпадении названия, а не по общим словам «город/фестиваль».
 * Условия (все обязательны): тот же день, та же категория, тот же город, и
 *   (A) нормализованные названия РАВНЫ (после транслитерации, «theatre»=
 *       «theater», без пунктуации) при длине >= 12 символов; либо
 *   (B) вложение названий: 3+ общих значимых токена у одной пары псевдонимов
 *       и общие/меньшее >= 0.7; либо
 *   (C) (B) + редкий топоним площадки: токен из АДРЕСА одной карточки есть в
 *       адресе или названии другой.
 * Плюс доказанное место: общий токен адреса, координаты <=300 м или разные
 * алфавиты адресов при <=2 км. Разное известное время (>60 мин) — разные
 * сеансы, не дубль. Время 00:00/пусто = «неизвестно».
 */
export function liveCrossSourceMatch(a, b) {
  if (dayKey(a) !== dayKey(b)) return null;
  if (!a.category_id || !b.category_id || a.category_id !== b.category_id) return null;
  // Класс именно кросс-источниковый: одна из карточек пришла с греческого
  // источника. Без этого ограничения правило начинало склеивать обычные
  // пары одного языка (разные события одной площадки в один день).
  const hasScript = (r, s) =>
    scriptOf(r.title) === s || scriptOf(r.title_ru) === s || scriptOf(r.title_en) === s ||
    scriptOf(r.address) === s;
  if (!hasScript(a, 'greek') && !hasScript(b, 'greek')) return null;

  // Токены названий без города карточки: «nicosia/leykosia» совпадают у всех
  // событий города и ничего не доказывают.
  const cityTokens = (r) => foldedPlaceTokens(cityKey(r));
  const ta = foldedTitleTokens(a);
  const tb = foldedTitleTokens(b);
  for (const t of cityTokens(a)) ta.delete(t);
  for (const t of cityTokens(b)) tb.delete(t);

  const common = [];
  for (const x of ta) for (const y of tb) if (sameToken(x, y)) { common.push(x); break; }
  const smaller = Math.min(ta.size, tb.size) || 1;
  const ratio = common.length / smaller;

  const foldTitle = (s) => translit(collapseAbbrev(s)).replace(/\btheatre\b/g, 'theater').replace(/\s+/g, ' ').trim();
  const titlesA = [a.title, a.title_ru, a.title_en].filter(Boolean).map(foldTitle).filter((s) => s.length >= 12);
  const titlesB = [b.title, b.title_ru, b.title_en].filter(Boolean).map(foldTitle).filter((s) => s.length >= 12);
  const equalTitle = titlesA.some((x) => titlesB.includes(x));

  const addrA = foldedPlaceTokens(a.address);
  const addrB = foldedPlaceTokens(b.address);

  // «Ядро» названия — общие токены, которых НЕТ в адресах: имена, топонимы
  // события. Без него пара «Christmas Villages … Troodos» ↔ «Kiperunta
  // Christmas Village» склеивалась по словам, которые уже есть в адресе.
  const inAddr = (t) => {
    for (const x of addrA) if (sameToken(x, t)) return true;
    for (const x of addrB) if (sameToken(x, t)) return true;
    return false;
  };
  const commonCore = common.filter((t) => !inAddr(t));

  const nameWhy = equalTitle
    ? 'названия совпали'
    : common.length >= 3 && ratio >= 0.7 && commonCore.length >= 2
      ? `названия ${common.length}сл (${Math.round(ratio * 100)}%), ядро ${commonCore.length}`
      : null;
  if (!nameWhy) return null;
  let placeWhy = null;
  for (const x of addrA) {
    if (placeWhy) break;
    for (const y of addrB) if (sameToken(x, y)) { placeWhy = `адрес~${x}`; break; }
  }
  if (!placeWhy) {
    for (const x of addrA) {
      if (placeWhy) break;
      for (const y of tb) if (sameToken(x, y) && x.length >= 5) { placeWhy = `топоним ${x}`; break; }
    }
  }
  if (!placeWhy) {
    for (const x of addrB) {
      if (placeWhy) break;
      for (const y of ta) if (sameToken(x, y) && x.length >= 5) { placeWhy = `топоним ${x}`; break; }
    }
  }
  const dist = hasCoords(a) && hasCoords(b) ? distanceM(a, b) : null;
  if (!placeWhy && dist !== null && dist <= 300) placeWhy = 'коорд≤300м';
  if (!placeWhy && dist !== null && dist <= 2000) {
    const sa = scriptOf(a.address);
    const sb = scriptOf(b.address);
    if (sa !== sb && (sa === 'greek' || sb === 'greek')) {
      placeWhy = `разные алфавиты + ${Math.round(dist)}м`;
    }
  }
  if (!placeWhy) return null;

  const knownA = !isUnknownTime(a.start_time);
  const knownB = !isUnknownTime(b.start_time);
  if (knownA && knownB) {
    const d = timeDiffMin(a, b);
    if (d !== null && d > 60) return null;
  }
  return `кросс-источник (${nameWhy}; ${placeWhy})`;
}

/** Проверка пары с аббревиатурой в названии: причина склейки или null.
 *  Сигнал: 3+ общих слова по имени ИЛИ 2 слова + общий токен адреса.
 *  Место: общий токен адреса ИЛИ координаты ≤1 км (адрес-заглушка «<город>, Кипр»
 *  у обеих карточек не считается — там координаты = центр города). */
export function liveAbbrevMatch(a, b) {
  if (dayKey(a) !== dayKey(b)) return null;
  const placeTokens = (s) => new Set(words(s).filter((w) => !GENERIC.has(w) && !PLACE_STOP.has(w) && !ADDR_STOP.has(w)));
  const sa = placeTokens(norm(a.address)), sb = placeTokens(norm(b.address));
  const common = (() => {
    for (const w of sa) if (sb.has(w)) return w;
    return null;
  })();
  const stubBoth = isCityLevelAddr(a) && isCityLevelAddr(b);
  const near = hasCoords(a) && hasCoords(b) ? distanceM(a, b) : null;
  const ov = abbrevOverlap(a, b);
  // Слова площадки исключаем из доказательства: если название клуба стоит и в
  // заголовке, и в адресе («Lubimaya – ION at Dusty Munky» ↔ «Jepe at Dusty Munky»,
  // адрес у обеих «Dusty Munky»), то «2 общих слова + адрес» — это НЕ одно событие,
  // а два разных вечера одного клуба. Считаем отдельно слова, которых нет в адресах.
  const addrWords = new Set([...sa, ...sb]);
  const ovCore = (() => {
    let best = 0;
    for (const ta of [a.title, a.title_ru, a.title_en].filter(Boolean).map(collapseAbbrev))
      for (const tb of [b.title, b.title_ru, b.title_en].filter(Boolean).map(collapseAbbrev)) {
        const s = new Set(abbrevWords(tb));
        let n = 0;
        for (const w of abbrevWords(ta)) if (s.has(w) && !addrWords.has(w)) n++;
        best = Math.max(best, n);
      }
    return best;
  })();
  // Токен, стоящий в НАЗВАНИЯХ ОБЕИХ карточек (обычно название города), не может
  // служить независимым доказательством одного МЕСТА: город уже совпал по dayKey, а
  // площадку доказывает адрес, а не повтор её имени в заголовках. Прогон 38133851150:
  // «Qigong in Nha Trang» ↔ «Sunday (October 11) Nha Trang» (TG-афиша Нячанга: в RU-псевдониме
  // город в кириллице «нячанге»/«нячанг», в EN — латиницей «Nha Trang») дали 2 общих слова
  // nha/trang + общий токен адреса «trang» = сам город → ложная склейка занятия 07:00
  // и вечера в караоке 20:00 в 614 м.
  const titleWordsOf = (r) => {
    const out = new Set();
    for (const t of [r.title, r.title_ru, r.title_en].filter(Boolean))
      for (const w of words(collapseAbbrev(t))) out.add(w);
    return out;
  };
  const twa = titleWordsOf(a), twb = titleWordsOf(b);
  const commonOk = common && !(twa.has(common) && twb.has(common)) ? common : null;
  const ab = sameAbbrev(a, b);
  // Ветка «2 слова + адрес~» закрыта дополнительным требованием места: общий токен адреса
  // у двух карточек одного города — это почти всегда НАЗВАНИЕ ГОРОДА/района (kuta, bali, trang),
  // а не площадка, поэтому она ловила разные события одного района.
  // Прогон 38248519181: «женский завтрак❣️» (ZAI cafe, 12:00–15:00, 11/12/15.10) ↔
  // «Женский завтрак и рисование нейрографики» (Murmur lounge restaurant, 12:00–13:00,
  // 12/13/14.10) — 2 общих слова (женский/завтрак) + общий токен адреса kuta = 1017 м,
  // разные площадки и разное расписание. Поэтому ветка принимает пару только когда
  // расстояние доказывает ОДНО место (≤300 м, как в samePlace); без координат — нет.
  const why = ov >= 3 ? `аббрев-имя ${ov}сл`
    : (ov >= 2 && ovCore >= 1 && commonOk && near !== null && near <= 300) ? `аббрев-имя ${ov}сл+адрес~${commonOk}`
      : (ab && (common || (near !== null && near <= 300))) ? `общая аббревиатура ${ab}`
        : null;
  if (!why) return null;
  // Время начала решает, дубль это или разные сеансы (19.11.2026, прогон 44568813589):
  // «Handstand Workshop - Vivienne Zeng» 11:15 ↔ «Vinyasa Flow - Vivienne Zeng» 09:30
  // (Чангу, один адрес) склеились по 2 общим словам — это ИМЯ ПРЕПОДАВАТЕЛЯ, а занятия
  // разные; разница времени 105 мин. Если у обеих карточек время задано и расходится
  // больше часа — это не дубль (у переводов/копий одного события время совпадает или
  // отличается на часовой пояс/округление, но не на два часа).
  const tdiff = timeDiffMin(a, b);
  if (tdiff !== null && tdiff > 60) return null;
  const near1k = !stubBoth && near !== null && near <= 1000;
  if (!common && !near1k) return null;
  if (ov < 3 && common && /^\d+$/.test(common)) return null;       // почтовый индекс/номер дома
  if (ov < 3 && near !== null && near > 2000) return null;          // разные площадки в разных концах города
  if (ov < 3 && common && EXTRA_STOP.has(common)) return null;      // «studio»/«street» — вода
  return why + (near !== null ? ` / ${Math.round(near)}м` : '');
}
