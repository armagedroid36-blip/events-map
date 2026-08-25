// Утилиты работы с датами событий.

/** ISO-дата (YYYY-MM-DD) -> человеческий вид по языку интерфейса */
export function formatDate(iso: string, lang?: 'ru' | 'en'): string {
  const d = new Date(iso + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(lang === 'en' ? 'en-US' : 'ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/** Сегодняшняя дата в формате YYYY-MM-DD (в часовом поясе пользователя) */
export function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Завтрашняя дата в формате YYYY-MM-DD (в часовом поясе пользователя) */
export function tomorrowIso(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Текущее локальное время HH:MM (для сравнения с временем события) */
export function nowHHMM(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * Событие ещё не закончилось (предстоящее).
 * Учитывает время: сегодняшнее событие скрывается, как только прошло
 * (end_time ?? start_time); без времени — событие на весь день.
 */
export function isUpcoming(event: {
  start_date: string;
  end_date?: string;
  start_time?: string;
  end_time?: string;
  recurrence?: { freq: 'daily' | 'weekly'; days?: number[] } | null;
}): boolean {
  const today = todayIso();
  // Регулярное событие: бессрочная или активная серия — предстоящее
  if (event.recurrence) {
    if (event.end_date && event.end_date < today) return false; // серия закончилась
    return true;
  }
  const endDate = event.end_date ?? event.start_date;
  // Дата окончания/начала в будущем — предстоящее
  if (endDate > today) return true;
  // Дата в прошлом — прошедшее
  if (endDate < today) return false;
  // Дата — сегодня: без времени — весь день
  if (!event.start_time) return true;
  const endTime = event.end_time ?? event.start_time;
  return nowHHMM() < endTime;
}
