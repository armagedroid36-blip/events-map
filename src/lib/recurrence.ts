// Регулярные (повторяющиеся) события: правило повтора в events.recurrence.
// null/отсутствует = разовое событие.
// {freq:'daily'} = каждый день.
// {freq:'weekly', days:[1,3,5]} = еженедельно по дням (1=Пн … 7=Вс, ISO).
// start_date = первое вхождение, end_date = последнее (пусто = бессрочно).
import type { TFunction } from 'i18next';
import type { Recurrence } from './types';
import { formatDate } from './dates';

/** ISO-дата (YYYY-MM-DD) -> день недели по ISO: 1=Пн … 7=Вс */
export function isoDayOfWeek(iso: string): number {
  const js = new Date(iso + 'T00:00:00').getDay();
  return js === 0 ? 7 : js;
}

/** Проходит ли регулярное событие в конкретную дату (ISO). Только для событий с recurrence. */
export function recurrenceMatchesDate(
  ev: { recurrence?: Recurrence | null; start_date: string; end_date?: string },
  isoDate: string,
): boolean {
  const r = ev.recurrence;
  if (!r) return false;
  if (isoDate < ev.start_date) return false;
  if (ev.end_date && isoDate > ev.end_date) return false;
  if (r.freq === 'daily') return true;
  return (r.days ?? []).includes(isoDayOfWeek(isoDate));
}

/** Человеческий текст повтора для карточки/списка; null — разовое событие. */
export function recurrenceLabel(
  ev: { recurrence?: Recurrence | null; end_date?: string },
  lang: 'ru' | 'en',
  t: TFunction,
): string | null {
  const r = ev.recurrence;
  if (!r) return null;
  let base: string;
  if (r.freq === 'daily') {
    base = t('card.recurrenceDaily');
  } else {
    const days = t('weekdaysShort', { returnObjects: true }) as string[];
    const names = (r.days ?? []).map((d) => days[d - 1] ?? '').filter(Boolean);
    base = t('card.recurrenceWeekly', { days: names.join(', ') });
  }
  if (ev.end_date) {
    base += ' ' + t('card.recurrenceUntil', { date: formatDate(ev.end_date, lang) });
  }
  return base;
}
