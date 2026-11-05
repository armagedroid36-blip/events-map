// Правило «недельные записи деревни под сезонным агрегатом» (класс 687).
//
// Что лечит: у рождественских деревень Кипра источник Cyprus Now отдаёт
// НЕДЕЛЬНЫЕ записи («Χριστουγεννιάτικο Χωριό Φικάρδου» — по одной на выходные),
// а Cyprus.BZ держит НЕЗАВИСИМУЮ интервальную запись всего сезона
// («Fikardou Christmas Village: Festive Season 2026–2027», 21.11→06.01).
// Класс возвращался трижды (687 → 694 → 711): каждый прогон добирал новые
// выходные, а `coveredByInterval` их не видел, потому что названия на разных
// языках (греческое против английского/русского) и город у записи другой.
//
// Правило узкое:
//   живой агрегат сезона (span 2..30 дней) с ключом деревни K
//   накрывает кандидата-однодневку/уикенд (span <= 2), у которого ключ деревни
//   совпадает по транслиту (общий префикс >= 6 знаков), дата внутри интервала.
// Соседнюю деревню того же округа правило не ест: сравнение идёт по имени
// деревни, а не по городу.

const DAY = 86400000;

function dnum(s) {
  const d = String(s || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  return Math.round(Date.parse(`${d}T00:00:00Z`) / DAY);
}

// Транслитерация греческого в латиницу в форме, близкой к английской записи
// топонимов: Φικάρδου → fikardou, Καλοπαναγιώτη → kalopanayioti (γ+ι → y).
const GR = {
  α: 'a', β: 'v', γ: 'g', δ: 'd', ε: 'e', ζ: 'z', η: 'i', θ: 'th', ι: 'i',
  κ: 'k', λ: 'l', μ: 'm', ν: 'n', ξ: 'x', ο: 'o', π: 'p', ρ: 'r', σ: 's',
  ς: 's', τ: 't', υ: 'y', φ: 'f', χ: 'ch', ψ: 'ps', ω: 'o',
};
const GR_DIGRAPH = [
  ['ου', 'ou'], ['αι', 'ai'], ['ει', 'i'], ['οι', 'i'], ['υι', 'i'],
  ['αυ', 'af'], ['ευ', 'ef'], ['ηυ', 'if'],
  ['μπ', 'b'], ['ντ', 'd'], ['γκ', 'g'], ['γγ', 'ng'], ['τσ', 'ts'],
  ['τζ', 'tz'], ['γχ', 'nch'], ['γξ', 'nx'],
];

function stripAccents(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[ΐΰ]/g, (c) => (c === 'ΐ' ? 'ι' : 'υ'))
    .toLowerCase();
}

export function translitGreek(text) {
  const s = stripAccents(text).replace(/[’'`]/g, '');
  let out = '';
  for (let i = 0; i < s.length; i += 1) {
    const two = s.slice(i, i + 2);
    const dg = GR_DIGRAPH.find(([a]) => a === two);
    if (dg) { out += dg[1]; i += 1; continue; }
    const c = s[i];
    if (c === 'γ') {
      // γ перед переднеязычным гласным — «y» (Γιώτη = yioti), иначе g.
      const next = s[i + 1] || '';
      out += ['ι', 'η', 'υ'].includes(next) ? 'y' : 'g';
      continue;
    }
    out += GR[c] !== undefined ? GR[c] : c;
  }
  return out;
}

const CYR = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ж: 'zh', з: 'z', и: 'i',
  й: 'i', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's',
  т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch',
  ъ: '', ы: 'i', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

export function translitCyrillic(text) {
  return String(text || '')
    .toLowerCase()
    .split('')
    .map((c) => (CYR[c] !== undefined ? CYR[c] : c))
    .join('');
}

// Служебные слова обоих языков: не участвуют в ключе деревни.
const STOP = new Set([
  'christmas', 'xmas', 'village', 'villages', 'festive', 'season', 'programme',
  'program', 'dates', 'fairytale', 'magical', 'the', 'of', 'in', 'at', 'and',
  'chori', 'chorio', 'xorio', 'dimou', 'christougenniatiko', 'christoygenniatiko',
  'rozhdestvenskaya', 'rozhdestvenskiy', 'derevnya', 'derevne', 'selo',
  'rozhdestvenskie', 'derevni', 'rozhdestvo', 'magic', 'returns', 'beginning', 'feel',
  'skazochnaya', 'volshebstvo', 'vozvraschaetsya', 'programma', 'dati',
  // города/округа в названиях («… Festive Season 2026-2027 in Nicosia») — не деревня
  'nicosia', 'lefkosia', 'limassol', 'lemesos', 'larnaca', 'larnaka', 'paphos', 'pafos',
  'famagusta', 'ammochostos', 'cyprus', 'kypros',
]);

const RE_VILLAGE_AGG = /christmas\s+village|χριστουγεννιατικ|рождественск/i;
// В JS \w не матчит ни греческий, ни кириллицу — диапазоны юникода прописаны явно.
const RE_VILLAGE_DAY = /χριστουγεννιατικ[Ͱ-Ͽ]*\s+χωρι|christmas\s+village|рождественск[а-яё]*\s+деревн/i;

// Кириллица → латиница до разбора на токены (греческий и латиница — как есть).
function latinize(text) {
  const s = stripAccents(text).replace(/ё/g, 'е');
  if (/[а-я]/.test(s)) return translitCyrillic(s);
  if (/[α-ω]/.test(s)) return translitGreek(s);
  return s;
}

/**
 * Ключ деревни: латинские токены названия без служебных слов и цифр.
 * @returns {string[]} токены длиной >=4 («fikardou», «kalopanayioti»)
 */
export function villageTokens(title) {
  const lat = latinize(title)
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\b(19|20)\d{2}\b/g, ' ');
  return [...new Set(
    lat.split(/\s+/).filter((w) => w.length >= 4 && !STOP.has(w) && !/^\d+$/.test(w)),
  )];
}

/** Общий префикс двух токенов (в знаках). */
export function commonPrefix(a, b) {
  const x = String(a || '');
  const y = String(b || '');
  let i = 0;
  while (i < x.length && i < y.length && x[i] === y[i]) i += 1;
  return i;
}

export const VILLAGE_PREFIX_MIN = 6;

/**
 * Две деревни — одна и та же? Сравнение по транслиту.
 * Короткие топонимы (Агрос/Агроу) различаются в последней букве, поэтому кроме
 * общего префикса 6 знаков допускается «отличие не больше одной буквы на конце»
 * при длине токена >= 5 (токены по 4 знака — это «pano»/«kato», они не деревни).
 */
export function sameVillage(aTokens, bTokens) {
  for (const a of aTokens || []) {
    for (const b of bTokens || []) {
      if (a === b) return true;
      const p = commonPrefix(a, b);
      if (p >= VILLAGE_PREFIX_MIN) return true;
      const minLen = Math.min(a.length, b.length);
      if (minLen >= 5 && p >= 4 && p >= minLen - 1) return true;
    }
  }
  return false;
}

const LIVE = new Set(['active', 'moderation', 'needs_changes']);
export const MIN_SPAN_DAYS = 2;
export const MAX_SPAN_DAYS = 60; // сезон деревни 21.11→06.01 = 46 дней
export const MAX_CAND_SPAN_DAYS = 2;

/**
 * Собрать живые агрегаты сезона по строкам базы.
 * @returns {Array<{tokens:string[], start:number, end:number, title:string}>}
 */
export function buildVillageAggregates(rows) {
  const out = [];
  for (const r of rows || []) {
    if (r.status && !LIVE.has(r.status)) continue;
    const a = dnum(r.start_date);
    const b = dnum(r.end_date);
    if (a === null || b === null) continue;
    const span = b - a;
    if (span < MIN_SPAN_DAYS || span > MAX_SPAN_DAYS) continue;
    for (const t of [r.title, r.title_ru, r.title_en]) {
      if (!t || !RE_VILLAGE_AGG.test(stripAccents(t))) continue;
      const tokens = villageTokens(t);
      if (tokens.length) out.push({ tokens, start: a, end: b, title: String(t) });
    }
  }
  return out;
}

/**
 * Кандидат — недельная запись деревни, уже накрытая живым агрегатом сезона?
 * @param {Array} aggregates результат buildVillageAggregates
 * @param {{title?:string, start_date?:string, end_date?:string}} cand
 */
export function coveredByVillageSeries(aggregates, cand) {
  const title = String((cand && cand.title) || '');
  if (!RE_VILLAGE_DAY.test(stripAccents(title))) return false;
  const a = dnum(cand && cand.start_date);
  if (a === null) return false;
  const b = dnum(cand && cand.end_date);
  const span = b === null ? 0 : b - a;
  if (span > MAX_CAND_SPAN_DAYS) return false;
  const tokens = villageTokens(title);
  if (!tokens.length) return false;
  for (const agg of aggregates || []) {
    if (agg.start >= a) continue; // кандидат не позже начала сезона
    if (a >= agg.end) continue; // конец интервала не накрывает
    if (sameVillage(tokens, agg.tokens)) return true;
  }
  return false;
}
