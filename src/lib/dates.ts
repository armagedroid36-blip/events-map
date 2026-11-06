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

/** Время HH:MM без секунд: «19:00:00» → «19:00», «19:00» как есть; пусто — '' */
export function formatTimeHM(t?: string | null): string {
  if (!t) return '';
  const m = /^(\d{1,2}:\d{2})/.exec(t);
  return m ? m[1] : t;
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
 * Окно индексируемости архива событий (дней): прошедшее событие остаётся в
 * sitemap и БЕЗ noindex, пока с его последнего дня прошло не больше N дней.
 * Более старые архивные страницы отдают 200, но получают noindex,follow.
 * ЗЕРКАЛО: ARCHIVE_INDEX_WINDOW_DAYS в scripts/seo-prerender.mjs (статика) —
 * менять оба значения одинаково.
 */
export const ARCHIVE_INDEX_WINDOW_DAYS = 14;

/** ISO-дата (YYYY-MM-DD) ± N дней */
export function shiftIsoDays(iso: string, days: number): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Архивная страница ещё индексируется: последний день события в прошлом, но не
 * старше окна ARCHIVE_INDEX_WINDOW_DAYS. Событие с будущей датой («снято с
 * афиши») не индексируется никогда. Правило — то же, что archiveIndexable в
 * scripts/seo-prerender.mjs: статика и SPA обязаны совпадать.
 */
export function isArchiveIndexable(
  lastDay: string | null | undefined,
  today: string = todayIso(),
): boolean {
  const iso = (lastDay ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  if (iso >= today) return false; // не прошедшее (в т.ч. «снято с афиши»)
  return iso >= shiftIsoDays(today, -ARCHIVE_INDEX_WINDOW_DAYS);
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
  const endTime = endTimeOf(event) ?? event.start_time;
  return nowHHMM() < endTime;
}

/**
 * Время окончания, пригодное для сравнения и показа.
 * Заглушка источника «окончание 00:00 в тот же день, что и начало» (Cyprus Now,
 * cyprus.bz, Балифорум отдают её, когда времени окончания в источнике нет) означает
 * «окончание неизвестно»: иначе событие дня считалось бы прошедшим с полуночи и
 * исчезало из предстоящих, а на карточке печаталось «16:00 – 00:00».
 */
export function endTimeOf(event: {
  start_date: string;
  end_date?: string;
  start_time?: string;
  end_time?: string;
}): string | undefined {
  const st = event.start_time;
  const et = event.end_time;
  if (!et) return undefined;
  if (!st) return et;
  const sameDay = (event.end_date ?? event.start_date) === event.start_date;
  if (sameDay && et <= st) return undefined;
  return et;
}
