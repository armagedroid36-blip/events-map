// Класс «городская карточка-копия»: одно событие, две ЖИВЫЕ карточки, у одной адрес —
// просто имя города («Лимасол, Кипр»), у другой названа площадка. Штатный дедуп такое
// видит не всегда: liveAbbrevMatch требует 3 значимых слова ЛИБО совпадения адресов, а здесь
// адреса разные по построению (у копии адрес-заглушка). Разбор run 297: 4 пары этого класса
// пришлось закрывать вручную скриптом keep/drop.
//
// Отличие от зонда dot-cross-source-dupe-probe: здесь добавлено ТОЧНОЕ совпадение времени
// (±10 минут) и требование «ровно один адрес городской» — без них зонд отдавал и пару
// «полнолуние» 19:30 ↔ 16:10 (расхождение 3 ч 20 м, разные каналы противоречат), которую
// верно оставлять без правки. Точность на разборе run 297: 4/4 против 4/5.
import { words, isCityLevelAddr, distanceM, cityKey } from './live-dupe-key.mjs';

export const DEFAULT_MAX_DIST_M = 1500;
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
 * Пара «городская карточка-копия». Возвращает { distM, timeDiffMin, common, keep, drop } или null.
 * keep — карточка с названной площадкой, drop — копия с адресом уровня города.
 * Опции: maxDistM (1500), maxTimeDiffMin (10), minWords (2).
 */
export function cityCopyMatch(a, b, opt = {}) {
  const maxDistM = opt.maxDistM ?? DEFAULT_MAX_DIST_M;
  const maxTimeDiffMin = opt.maxTimeDiffMin ?? DEFAULT_MAX_TIME_DIFF_MIN;
  const minWords = opt.minWords ?? DEFAULT_MIN_WORDS;
  if (!a || !b || a.id === b.id) return null;
  if (!liveStatus(a.status) || !liveStatus(b.status)) return null;
  if (!hasGeo(a) || !hasGeo(b)) return null;
  const day = dayOf(a);
  if (!day || day !== dayOf(b)) return null;
  if (cityKey(a) !== cityKey(b)) return null;
  const cityA = isCityLevelAddr(a), cityB = isCityLevelAddr(b);
  if (cityA === cityB) return null; // нужен ровно один адрес-заглушка
  const dt = timeDiffMin(a, b);
  if (dt === null || dt > maxTimeDiffMin) return null;
  const d = distanceM(a, b);
  if (d > maxDistM) return null;
  const common = commonWords(a, b);
  if (common.length < minWords) return null;
  return {
    distM: Math.round(d),
    timeDiffMin: dt,
    common,
    keep: cityA ? b.id : a.id,
    drop: cityA ? a.id : b.id,
  };
}

/** Все пары класса по массиву строк (группировка по день|город, затем попарно). */
export function cityCopyPairs(rows, opt = {}) {
  const live = (rows || []).filter((r) => liveStatus(r.status) && hasGeo(r) && dayOf(r));
  const groups = new Map();
  for (const r of live) {
    const k = `${dayOf(r)}|${cityKey(r)}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  const pairs = [];
  for (const [key, g] of groups) {
    for (let i = 0; i < g.length; i += 1) {
      for (let j = i + 1; j < g.length; j += 1) {
        const m = cityCopyMatch(g[i], g[j], opt);
        if (m) pairs.push({ key, a: g[i], b: g[j], ...m });
      }
    }
  }
  return pairs.sort((x, y) => x.distM - y.distM);
}
