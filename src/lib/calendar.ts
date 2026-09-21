// Календарный вид: какие события проходят в дате и как строится сетка недели/месяца.
// Данные — тот же список событий, что у ленты (RPC list_active_events): новых
// запросов к базе календарь не делает.
//
// Правило «событие проходит в дату»:
//   • разовое — попадает в интервал start_date…(end_date || start_date);
//   • многодневное разовое (start_date…end_date) — каждый день интервала;
//   • повторяющееся (recurrence) — по правилу повтора внутри start_date…end_date
//     (recurrenceMatchesDate): одна карточка события = сколько угодно дат, но в
//     конкретной ячейке событие показывается РОВНО ОДИН раз (дублей нет).
import type { EventItem } from './types';
import { isoDayOfWeek, recurrenceMatchesDate } from './recurrence';

/** Date → ISO-дата (UTC, без времени) */
function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** ISO-дата → Date (UTC-полночь) */
function parse(isoDate: string): Date {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** Сдвиг ISO-даты на n дней */
export function shiftDays(isoDate: string, n: number): string {
  const dt = parse(isoDate);
  dt.setUTCDate(dt.getUTCDate() + n);
  return iso(dt);
}

/** Событие проходит в эту дату? (см. правило в шапке файла) */
export function eventOccursOn(ev: EventItem, isoDate: string): boolean {
  if (!ev || typeof ev.start_date !== 'string' || !ev.start_date) return false;
  if (ev.recurrence) return recurrenceMatchesDate(ev, isoDate);
  const last = ev.end_date && ev.end_date > ev.start_date ? ev.end_date : ev.start_date;
  return isoDate >= ev.start_date && isoDate <= last;
}

/** Порядок внутри дня: по времени начала, без времени — в конец дня */
export function byStartTime(a: EventItem, b: EventItem): number {
  const ta = (a.start_time ?? '').slice(0, 5);
  const tb = (b.start_time ?? '').slice(0, 5);
  if (ta === tb) return (a.title ?? '').localeCompare(b.title ?? '');
  if (!ta) return 1;
  if (!tb) return -1;
  return ta < tb ? -1 : 1;
}

/** События, проходящие в дату: без дублей по id, по возрастанию времени */
export function eventsOnDate(events: EventItem[], isoDate: string): EventItem[] {
  const seen = new Set<string>();
  const out: EventItem[] = [];
  for (const ev of events) {
    if (!ev || typeof ev.id !== 'string' || seen.has(ev.id)) continue;
    if (eventOccursOn(ev, isoDate)) {
      seen.add(ev.id);
      out.push(ev);
    }
  }
  return out.sort(byStartTime);
}

/** Понедельник недели, в которую попадает дата */
export function startOfWeekIso(isoDate: string): string {
  const shift = isoDayOfWeek(isoDate) - 1; // 1 = Пн → сдвиг 0
  return shiftDays(isoDate, -shift);
}

/** Семь дат недели (Пн…Вс), начиная с понедельника недели даты */
export function weekDates(isoDate: string): string[] {
  const start = startOfWeekIso(isoDate);
  return Array.from({ length: 7 }, (_, i) => shiftDays(start, i));
}

/** Ячейка сетки месяца: дата + признак «этот день в показываемом месяце» */
export interface MonthCell {
  iso: string;
  inMonth: boolean;
}

/**
 * Сетка месяца от понедельника первой недели до воскресенья последней —
 * ровно 6 недель (42 ячейки) или 5, если месяц укладывается: считаем от
 * понедельника недели с 1-м числом и добираем недели до конца месяца.
 */
export function monthGrid(isoDate: string): MonthCell[] {
  const dt = parse(isoDate);
  const year = dt.getUTCFullYear();
  const month = dt.getUTCMonth(); // 0..11
  const first = iso(new Date(Date.UTC(year, month, 1)));
  const start = startOfWeekIso(first);
  const cells: MonthCell[] = [];
  for (let i = 0; i < 42; i += 1) {
    const dayIso = shiftDays(start, i);
    const d = parse(dayIso);
    cells.push({ iso: dayIso, inMonth: d.getUTCMonth() === month });
  }
  // Обрезаем хвостовые недели, в которых нет дней текущего месяца
  while (cells.length > 7 && !cells.slice(-7).some((c) => c.inMonth)) {
    cells.splice(-7, 7);
  }
  return cells;
}

/** Заголовок периода: неделя («8–14 сентября 2026») или месяц («Сентябрь 2026») */
export function periodLabel(
  mode: 'week' | 'month',
  isoDate: string,
  lang: 'ru' | 'en',
): string {
  const locale = lang === 'ru' ? 'ru-RU' : 'en-US';
  if (mode === 'month') {
    return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' })
      .format(parse(isoDate))
      .replace(/^./, (c) => c.toUpperCase());
  }
  const days = weekDates(isoDate);
  const a = parse(days[0]);
  const b = parse(days[6]);
  const sameMonth = a.getUTCMonth() === b.getUTCMonth();
  const fmtA = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    ...(sameMonth ? {} : { month: 'short' }),
    timeZone: 'UTC',
  }).format(a);
  const fmtB = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(b);
  return `${fmtA} – ${fmtB}`;
}

/** Короткие подписи дней недели (Пн…Вс) для шапки сетки */
export function weekdayLabels(lang: 'ru' | 'en'): string[] {
  const locale = lang === 'ru' ? 'ru-RU' : 'en-US';
  const fmt = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' });
  // 2026-09-07 — понедельник
  return Array.from({ length: 7 }, (_, i) => fmt.format(parse(shiftDays('2026-09-07', i))).replace('.', ''));
}

/** День месяца числом */
export function dayNumber(isoDate: string): number {
  return parse(isoDate).getUTCDate();
}
