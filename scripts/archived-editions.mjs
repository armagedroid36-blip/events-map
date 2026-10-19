// Класс «издание серии срезано правилом „копия внутри интервала“».
//
// Правило 331 (`interval-cover.mjs`) архивировало записи, чью дату накрывает
// многодневная карточка. До защиты 332 (`series_count > 1`) оно срезало и
// ЗАКОННЫЕ издания серий — они остаются в архиве, потому что защита не чинит
// уже нанесённый ущерб (кейс `cfad1e23`, 333).
//
// Здесь ищем такие строки: АРХИВНАЯ карточка в БУДУЩЕМ, накрытая ЖИВЫМ
// интервалом (то же ядро названия, тот же город, дата строго внутри), у которой
// нет живого близнеца по названию+дате ⇒ дата события пропала с карты.
// Прошедшие даты не считаем: их всё равно снимает `archive-past`.

import { buildIntervalIndex, coveredByInterval, coreTitle, cityKey } from './interval-cover.mjs';

const LIVE = new Set(['active', 'moderation', 'needs_changes']);

function dayStr(s) {
  return String(s || '').slice(0, 10);
}

/** Чистая функция: rows → [{ row, cover }] */
export function findLostEditions(rows, today = new Date().toISOString().slice(0, 10)) {
  const all = rows || [];
  const live = all.filter((r) => LIVE.has(r.status));
  const index = buildIntervalIndex(all);

  const liveKeys = new Set();
  for (const r of live) liveKeys.add(`${coreTitle(r.title)}|${dayStr(r.start_date)}`);

  const out = [];
  for (const a of all) {
    if (a.status !== 'archived') continue;
    const d = dayStr(a.start_date);
    if (!d || d < today) continue;            // прошедшее — законный архив
    if (!coveredByInterval(index, a)) continue; // не накрыт живым интервалом
    if (liveKeys.has(`${coreTitle(a.title)}|${d}`)) continue; // живой близнец есть

    const cover = live.find((r) => {
      if (cityKey(r.city) !== cityKey(a.city)) return false;
      const s = dayStr(r.start_date);
      const e = dayStr(r.end_date);
      if (!e) return false;
      const span = (Date.parse(e) - Date.parse(s)) / 86400000;
      if (span < 2 || span > 30) return false;
      const ca = coreTitle(r.title);
      const cb = coreTitle(a.title);
      const sameTitle = ca === cb || ca.includes(cb) || cb.includes(ca);
      return sameTitle && d > s && d < e;
    });
    out.push({ row: a, cover: cover || null });
  }
  return out;
}
