// Утилиты работы с датами событий.

/** ISO-дата (YYYY-MM-DD) -> человеческий вид по языку интерфейса */
export function formatDate(iso: string, lang: 'ru' | 'en'): string {
  const d = new Date(iso + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-US', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/** Сегодняшняя дата в формате YYYY-MM-DD (для сравнений) */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Событие ещё не закончилось (предстоящее) */
export function isUpcoming(event: { start_date: string; end_date?: string }): boolean {
  return (event.end_date ?? event.start_date) >= todayIso();
}
