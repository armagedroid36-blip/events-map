// Отсев «окончания-заглушки» в момент вставки события.
//
// Источники отдают полночь как признак «времени окончания нет»:
// Cyprus Now — JSON-LD endDate = 00:00 того же дня (3rd-street-party 18.10:
// start 16:00+03:00, end 18.10 00:00+03:00, текст «έως τις 00:00»), cyprus.bz —
// endDate = startDate, Балифорум — UTC-полночь. Раньше такая полночь уезжала в
// events.end_time, карточка печатала «16:00 – 00:00», а isUpcoming() на сайте
// считал событие СВОЕГО дня прошедшим с полуночи (запуск 167, закрыто guard'ом
// endTimeOf в src/lib/dates.ts). Здесь тот же признак снимается у источника.
//
// Правило: если дата окончания не отличается от даты начала и время окончания
// не позже времени начала — это не время окончания, пишем null.
export function cleanEndTime({ start_date, start_time, end_date, end_time } = {}) {
  if (!end_time) return null;
  const hm = (s) => (typeof s === 'string' && /^\d{1,2}:\d{2}/.test(s) ? s.slice(0, 5) : null);
  const et = hm(end_time);
  if (!et) return end_time; // неразобранный формат (пусть решает вызывающий) — не трогаем
  const sameDay = !end_date || end_date === start_date;
  const st = hm(start_time);
  // «23:59» у лент — заглушка «время не указано» (Балифорум пишет её в startAt/endAt
  // парами, Cyprus Now — в конце суток). Раньше чистилось только начало, а окончание
  // уезжало в базу, и карточка печатала «до 23:59» (замер 20.10.2026: 83 живых
  // карточки Бали с пустым start_time и end_time 23:59). Без начала окончание бессмысленно.
  if (!st && et === '23:59') return null;
  if (sameDay && st && et <= st) return null;
  return end_time;
}
