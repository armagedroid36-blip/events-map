// Близнецы «одно событие — две карточки», которых не видит штатный дедуп.
// Признак-основа: ТОТ ЖЕ ДЕНЬ, ТО ЖЕ ВРЕМЯ (±10 мин), пины рядом — а ключ дедупа
// (title|start_date, liveDupeMatch/liveAbbrevMatch) пару не склеил, потому что адреса
// записаны по-разному или название переведено.
//
// Уровни:
//  A — названия пересекаются по >=2 значимым словам, пины <= 1500 м: вероятный дубль,
//      закрывать можно после сверки зала/времени по страницам источников;
//  B — общих слов 0-1 (перевод названия), но пины <= 300 м: та же площадка, кандидат
//      в дубли — нужен ручной арбитр (перевод/фото/организатор).
// Почему не «городская карточка-копия» (узкое определение): проверка на базе 17.10.2026
// (run 298) показала, что из 4 пар, закрытых вручную в run 297, адрес уровня города был
// только у ОДНОЙ — остальные три различались написанием зала (Pattichio/Pattihio) либо
// языком адреса. Узкое правило «ровно один адрес-заглушка» давало 0 пар даже с архивом.
import { words, isCityLevelAddr, distanceM } from './live-dupe-key.mjs';

export const DEFAULT_MAX_DIST_M = 1500;
export const TIER_B_MAX_DIST_M = 300;
export const DEFAULT_MAX_TIME_DIFF_MIN = 10;
export const DEFAULT_MIN_WORDS = 2;

const liveStatus = (s) => s === 'active' || s === 'moderation';
const dayOf = (r) => String(r.start_date || '').slice(0, 10);
const hasGeo = (r) => typeof r.lat === 'number' && typeof r.lng === 'number';

/** Минуты от начала суток; null если время не указано или формат не HH:MM. */
export function minutesOf(t) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(t || ''));
  if (!m) return null;
  const h = +m[1], min = +m[2];
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** Разница во времени в минутах (по кругу суток); null если у одной из карточек время не задано. */
export function timeDiffMin(a, b) {
  const x = minutesOf(a.start_time), y = minutesOf(b.start_time);
  if (x === null || y === null) return null;
  const d = Math.abs(x - y);
  return Math.min(d, 1440 - d);
}

/** Значимые общие слова по ЛЮБОЙ паре псевдонимов названия (words() из общего ключа дедупа). */
export function commonWords(a, b) {
  const out = new Set();
  for (const x of [a.title, a.title_ru, a.title_en]) {
    if (!x) continue;
    const wx = words(x);
    if (!wx.length) continue;
    for (const y of [b.title, b.title_ru, b.title_en]) {
      if (!y) continue;
      const wy = new Set(words(y));
      for (const w of wx) if (wy.has(w)) out.add(w);
    }
  }
  return [...out];
}

/**
 * Пара-близнец. Возвращает { tier: 'A'|'B', distM, timeDiffMin, common, keep, drop } или null.
 * keep — карточка с более информативным адресом (не город-заглушка) и/или не CN-копия;
 * drop — копия (адрес уровня города, иначе вторая по порядку).
 */
export function twinMatch(a, b, opt = {}) {
  const maxDistM = opt.maxDistM ?? DEFAULT_MAX_DIST_M;
  const tierBDistM = opt.tierBDistM ?? TIER_B_MAX_DIST_M;
  const maxTimeDiffMin = opt.maxTimeDiffMin ?? DEFAULT_MAX_TIME_DIFF_MIN;
  const minWords = opt.minWords ?? DEFAULT_MIN_WORDS;
  if (!a || !b || a.id === b.id) return null;
  if (!liveStatus(a.status) || !liveStatus(b.status)) return null;
  if (!hasGeo(a) || !hasGeo(b)) return null;
  const day = dayOf(a);
  if (!day || day !== dayOf(b)) return null;
  const dt = timeDiffMin(a, b);
  if (dt === null || dt > maxTimeDiffMin) return null;
  const d = distanceM(a, b);
  if (d > maxDistM) return null;
  const common = commonWords(a, b);
  let tier = null;
  if (common.length >= minWords) tier = 'A';
  else if (d <= tierBDistM) tier = 'B';
  if (!tier) return null;
  const cityA = isCityLevelAddr(a), cityB = isCityLevelAddr(b);
  let keep = a.id, drop = b.id;
  if (cityA && !cityB) { keep = b.id; drop = a.id; }
  else if (!cityA && !cityB) {
    // оба адреса называют площадку — копией считаем более куцый адрес (у копии адрес короче)
    const la = String(a.address || '').length, lb = String(b.address || '').length;
    if (lb > la) { keep = b.id; drop = a.id; }
  }
  return { tier, distM: Math.round(d), timeDiffMin: dt, common, keep, drop };
}

/** Все пары по массиву строк (группировка по дню, затем попарно внутри дня). */
export function twinPairs(rows, opt = {}) {
  const live = (rows || []).filter((r) => liveStatus(r.status) && hasGeo(r) && dayOf(r));
  const groups = new Map();
  for (const r of live) {
    const k = dayOf(r);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  const pairs = [];
  for (const [day, g] of groups) {
    for (let i = 0; i < g.length; i += 1) {
      for (let j = i + 1; j < g.length; j += 1) {
        const m = twinMatch(g[i], g[j], opt);
        if (m) pairs.push({ day, a: g[i], b: g[j], ...m });
      }
    }
  }
  return pairs.sort((x, y) => (x.tier === y.tier ? x.distM - y.distM : x.tier < y.tier ? -1 : 1));
}
