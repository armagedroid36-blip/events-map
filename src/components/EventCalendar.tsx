// Календарь событий: неделя (7 колонок) и месяц (компактная сетка).
// Данные приходят снаружи — тот же отфильтрованный список, что у ленты,
// календарь сам к базе не ходит. В ячейке до 3 событий, дальше «+N»; тап по
// дню (или «+N») раскрывает список событий под сеткой. Пустой день остаётся
// видимой пустой ячейкой — сетка не «схлопывается».
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Category, EventItem } from '../lib/types';
import {
  dayNumber,
  eventsOnDate,
  monthGrid,
  periodLabel,
  shiftDays,
  weekDates,
  weekdayLabels,
} from '../lib/calendar';
import { formatTimeHM, todayIso } from '../lib/dates';

type Mode = 'week' | 'month';

type Props = {
  /** События для показа (уже отфильтрованные, как лента) */
  events: EventItem[];
  categories: Category[];
  /** Период: неделя или месяц (неделя — по умолчанию) */
  mode: Mode;
  /** Любая дата внутри показываемого периода (ISO) */
  date: string;
  selectedId: string | null;
  lang: 'ru' | 'en';
  onSelect: (ev: EventItem) => void;
  onModeChange: (mode: Mode) => void;
  onDateChange: (iso: string) => void;
};

/** Сколько событий показывать в ячейке до «+N» */
const MAX_CELL = 3;

export default function EventCalendar({
  events,
  categories,
  mode,
  date,
  selectedId,
  lang,
  onSelect,
  onModeChange,
  onDateChange,
}: Props) {
  const { t } = useTranslation();
  const [openDay, setOpenDay] = useState<string | null>(null);
  const today = todayIso();

  const days = useMemo(() => (mode === 'week' ? weekDates(date) : []), [mode, date]);
  const grid = useMemo(() => (mode === 'month' ? monthGrid(date) : []), [mode, date]);
  const weekdays = useMemo(() => weekdayLabels(lang), [lang]);

  /** События по дате — считается один раз на сетку */
  const byDate = useMemo(() => {
    const map = new Map<string, EventItem[]>();
    const dates = mode === 'week' ? days : grid.map((c) => c.iso);
    for (const iso of dates) map.set(iso, eventsOnDate(events, iso));
    return map;
  }, [events, mode, days, grid]);

  const catOf = (id: string): Category | undefined => categories.find((c) => c.id === id);
  const catLabel = (ev: EventItem): string => {
    const c = catOf(ev.category_id);
    const name = c ? (lang === 'ru' ? c.name_ru : c.name_en) : '';
    return `${c?.emoji ?? ''} ${name}`.trim();
  };

  const cellEvents = (iso: string): EventItem[] => byDate.get(iso) ?? [];
  const step = mode === 'week' ? 7 : 30;

  return (
    <div className="flex flex-col gap-2">
      {/* Шапка: навигация по периодам + переключатель неделя/месяц */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label={t('calendar.prev')}
            onClick={() => onDateChange(shiftDays(date, -step))}
            className="rounded-md px-2 py-1 text-sm font-semibold text-gray-600 hover:bg-gray-100"
          >
            ←
          </button>
          <span className="min-w-[9rem] text-center text-sm font-semibold text-gray-900">
            {periodLabel(mode, date, lang)}
          </span>
          <button
            type="button"
            aria-label={t('calendar.next')}
            onClick={() => onDateChange(shiftDays(date, step))}
            className="rounded-md px-2 py-1 text-sm font-semibold text-gray-600 hover:bg-gray-100"
          >
            →
          </button>
          <button
            type="button"
            onClick={() => onDateChange(today)}
            className="ml-1 rounded-md border border-gray-200 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
          >
            {t('calendar.today')}
          </button>
        </div>
        <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5">
          {(['week', 'month'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => onModeChange(m)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                mode === m ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {t(`calendar.${m}`)}
            </button>
          ))}
        </div>
      </div>

      {/* Подписи дней недели */}
      <div className="grid grid-cols-7 gap-1">
        {weekdays.map((w) => (
          <div key={w} className="text-center text-[10px] font-medium uppercase text-gray-400">
            {w}
          </div>
        ))}
      </div>

      {/* Сетка: неделя — крупные ячейки, месяц — компактная */}
      <div className="grid grid-cols-7 gap-1">
        {(mode === 'week' ? days : grid.map((c) => c.iso)).map((iso) => {
          const list = cellEvents(iso);
          const inMonth = mode === 'week' || grid.find((c) => c.iso === iso)?.inMonth !== false;
          const isToday = iso === today;
          return (
            <div
              key={iso}
              className={`relative flex flex-col rounded-lg border p-1 ${
                isToday ? 'border-[#72D2CF] bg-[#72D2CF]/10' : 'border-gray-200 bg-white'
              } ${inMonth ? '' : 'opacity-50'}`}
            >
              {/* На телефоне заголовок растянут на всю ячейку: пальцем не попасть
                  в кнопки событий (они ~20 px), поэтому тап по ЛЮБОМУ месту дня
                  раскрывает список под сеткой. На десктопе — обычный заголовок. */}
              <button
                type="button"
                onClick={() => setOpenDay(openDay === iso ? null : iso)}
                className="absolute inset-0 z-0 mb-1 flex items-start justify-between rounded px-1 pt-0.5 text-left hover:bg-gray-50 sm:static sm:inset-auto sm:z-auto sm:items-center sm:px-0.5"
                aria-label={t('calendar.openDay')}
              >
                <span
                  className={`text-xs font-semibold ${isToday ? 'text-[#0F766E]' : 'text-gray-700'}`}
                >
                  {dayNumber(iso)}
                </span>
                {list.length > MAX_CELL && (
                  <span className="absolute right-1 top-0.5 text-[10px] font-medium text-[#E66343] sm:static sm:right-auto sm:top-auto">
                    {t('calendar.more', { count: list.length - MAX_CELL })}
                  </span>
                )}
              </button>

              {list.length === 0 ? (
                // Пустой день не скрываем: пустая ячейка с высотой строки
                <span className="min-h-[1.5rem] flex-1" aria-hidden="true" />
              ) : mode === 'week' ? (
                <div className="pointer-events-none relative z-10 flex flex-1 flex-col gap-0.5 sm:pointer-events-auto">
                  {list.slice(0, MAX_CELL).map((ev) => (
                    <button
                      key={ev.id}
                      type="button"
                      onClick={() => onSelect(ev)}
                      title={ev.title}
                      className={`flex min-w-0 items-center gap-1 rounded px-1 py-0.5 text-left text-[10px] leading-tight hover:bg-gray-100 ${
                        selectedId === ev.id ? 'bg-[#72D2CF]/20' : ''
                      }`}
                    >
                      <span className="shrink-0 text-gray-500">
                        {formatTimeHM(ev.start_time) || '—'}
                      </span>
                      <span className="hidden min-w-0 truncate text-gray-800 sm:inline">
                        {ev.title}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                // Месяц: точки + счётчик, подробности — в списке под сеткой
                <div className="pointer-events-none relative z-10 flex flex-wrap items-center gap-0.5">
                  {list.slice(0, MAX_CELL).map((ev) => (
                    <span
                      key={ev.id}
                      title={ev.title}
                      className={`h-1.5 w-1.5 rounded-full ${
                        selectedId === ev.id ? 'bg-[#E66343]' : 'bg-[#72D2CF]'
                      }`}
                    />
                  ))}
                  {list.length > 0 && (
                    <span className="text-[10px] text-gray-500">{list.length}</span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Подсказка (только телефон): по дню надо именно тапнуть */}
      {!openDay && (
        <p className="mt-2 text-center text-[11px] text-gray-500 sm:hidden">{t('calendar.tapHint')}</p>
      )}

      {/* Список выбранного дня — раскрывается под сеткой */}
      {openDay && (
        <div className="rounded-xl border border-gray-200 bg-white p-2">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-700">
              {new Intl.DateTimeFormat(lang === 'ru' ? 'ru-RU' : 'en-US', {
                day: 'numeric',
                month: 'long',
                weekday: 'short',
                timeZone: 'UTC',
              }).format(new Date(`${openDay}T00:00:00Z`))}
            </span>
            <button
              type="button"
              onClick={() => setOpenDay(null)}
              className="rounded px-1 text-xs text-gray-500 hover:bg-gray-100"
              aria-label={t('common.close')}
            >
              ✕
            </button>
          </div>
          {cellEvents(openDay).length === 0 ? (
            <p className="py-2 text-center text-xs text-gray-500">{t('calendar.emptyDay')}</p>
          ) : (
            <ul className="flex flex-col gap-0.5">
              {cellEvents(openDay).map((ev) => (
                <li key={ev.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(ev)}
                    className={`flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left hover:bg-gray-50 ${
                      selectedId === ev.id ? 'bg-[#72D2CF]/20' : ''
                    }`}
                  >
                    <span className="w-11 shrink-0 text-xs text-gray-500">
                      {formatTimeHM(ev.start_time) || '—'}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-gray-900">{ev.title}</span>
                      <span className="block truncate text-[11px] text-gray-500">
                        {[catLabel(ev), ev.city].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
