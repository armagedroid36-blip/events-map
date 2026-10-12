// Время-заглушка источника.
//
// Балифорум для событий без указанного времени пишет в поле `startAt` конец суток
// «23:59:59» (а не «00:00»): у саван-вечеров и многодневных курсов `startAt` и
// `endAt` совпадают до секунды — событие нулевой длительности, чего не бывает.
// Реальные времена у источника приходят нормально («09:00:00», «19:30:00»).
// Карта печатала «23:59» как настоящее начало, поэтому такие значения
// превращаем в «время не указано» (null) — сайт показывает «время начала неизвестно».
//
// Проверено 12.10.2026: в ленте 69 записей с 23:59:59 против 242 с 18:00,
// у карточки «Курс подготовки преподавателей йоги» лента даёт 20 дат 23:59→23:59.

const STUB_TIME = '23:59:59';

/** true, если в поле времени источника стоит заглушка «конец суток» */
export function isStubTime(raw) {
  if (!raw) return false;
  const t = String(raw).trim();
  const hhmmss = t.includes('T') ? t.split('T')[1] : t.includes(' ') ? t.split(' ')[1] : t;
  const s = String(hhmmss);
  return s.slice(0, 8) === STUB_TIME || s.slice(0, 5) === '23:59';
}

/**
 * Время начала карточки по сырому полю источника.
 * @param {string|Date|null} raw — `startAt` ленты ('2026-10-12 23:59:59' или ISO)
 * @returns {string|null} 'HH:MM' либо null, если источник времени не дал
 */
export function cleanStartTime(raw) {
  if (!raw) return null;
  if (isStubTime(raw)) return null;
  const t = String(raw).trim();
  const timePart = t.includes('T') ? t.split('T')[1] : t.includes(' ') ? t.split(' ')[1] : t;
  const hhmm = String(timePart).slice(0, 5);
  return /^\d{2}:\d{2}$/.test(hhmm) ? hhmm : null;
}
