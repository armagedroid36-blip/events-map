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

/** Событие ещё не закончилось (предстоящее) */
export function isUpcoming(event: { start_date: string; end_date?: string }): boolean {
  return (event.end_date ?? event.start_date) >= todayIso();
}
