// Список событий рядом с картой (на мобильных — ниже).
// Сортировка по ближайшей дате, счётчик результатов, пустое состояние,
// автоподгрузка порциями при прокрутке (infinite scroll, без кнопки).
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ReactNode } from 'react';
import type { Category, EventItem } from '../lib/types';
import { localizedText } from '../lib/translate';
import { formatTimeHM, todayIso } from '../lib/dates';
import { nextOccurrenceDate } from '../lib/recurrence';
import FavoriteButton from './FavoriteButton';

/** Размер первой порции и шаг догрузки */
const PAGE_SIZE = 30;

interface Props {
  events: EventItem[];
  categories: Category[];
  selectedId: string | null;
  onSelect: (ev: EventItem) => void;
  /** id событий в избранном; null — гость (сердечко показывается неактивным) */
  favoriteIds?: string[] | null;
  /** Переключить избранное (вызывается при клике на сердечко) */
  onToggleFavorite?: (id: string) => void;
  /** Развернуть детали выбранного события сразу под его превью.
   *  Необязательный: без него поведение как раньше (главная не передаёт). */
  renderExpanded?: (ev: EventItem) => ReactNode;
}

/** Ближайший прокручиваемый предок (панель-контейнер списка) или null = окно */
function scrollableAncestor(el: HTMLElement | null): HTMLElement | null {
  let node = el?.parentElement ?? null;
  while (node) {
    const o = getComputedStyle(node).overflowY;
    if ((o === 'auto' || o === 'scroll') && node.scrollHeight > node.clientHeight) return node;
    node = node.parentElement;
  }
  return null;
}

/** Компактная строка даты ближайшего вхождения: «Сб 12.09, 19:00» / «Sat Sep 12, 19:00».
 *  Время — без секунд; год добавляется, только если отличается от текущего. */
function occurrenceLine(
  occ: string,
  time: string | undefined,
  lang: 'ru' | 'en',
  weekdayNames: string[],
): string {
  const d = new Date(occ + 'T12:00:00');
  if (Number.isNaN(d.getTime())) return occ;
  const wd = weekdayNames[(d.getDay() + 6) % 7] ?? '';
  const y = d.getFullYear();
  const year =
    y !== new Date().getFullYear() ? (lang === 'ru' ? `.${String(y).slice(2)}` : `, ${y}`) : '';
  let datePart: string;
  if (lang === 'ru') {
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    datePart = `${wd} ${dd}.${mm}${year}`;
  } else {
    const ms = d.toLocaleDateString('en-US', { month: 'short' });
    datePart = `${wd} ${ms} ${d.getDate()}${year}`;
  }
  const tm = formatTimeHM(time);
  return tm ? `${datePart}, ${tm}` : datePart;
}

export default function EventsList({ events, categories, selectedId, onSelect, favoriteIds = null, onToggleFavorite, renderExpanded }: Props) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.startsWith('ru') ? 'ru' : 'en';
  const weekdayNames = t('weekdaysShort', { returnObjects: true }) as string[];

  // Сортировка по ближайшему БУДУЩЕМУ вхождению: для recurring-серий — по
  // правилу повтора (не по дате начала серии), для разовых — start_date.
  const sorted = useMemo(() => {
    const today = todayIso();
    const withOcc = events.map((ev) => ({ ev, occ: nextOccurrenceDate(ev, today) }));
    withOcc.sort((a, b) => {
      if (a.occ !== b.occ) return a.occ < b.occ ? -1 : 1;
      const at = a.ev.start_time ?? '';
      const bt = b.ev.start_time ?? '';
      if (at !== bt) return at < bt ? -1 : 1;
      return a.ev.start_date < b.ev.start_date ? -1 : a.ev.start_date > b.ev.start_date ? 1 : 0;
    });
    return withOcc;
  }, [events]);

  const total = sorted.length;
  // Догрузка порциями: первая порция PAGE_SIZE, дальше — по скроллу
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [loadingMore, setLoadingMore] = useState(false);
  const busyRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLLIElement | null>(null);

  // Смена набора событий (фильтры/поиск/город/маршрут): сброс на первую
  // порцию, отмена незавершённой догрузки и прокрутка контейнера наверх
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
    setLoadingMore(false);
    busyRef.current = false;
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    const scroller = scrollableAncestor(rootRef.current);
    if (scroller) scroller.scrollTop = 0;
    else window.scrollTo({ top: 0 });
  }, [events]);

  const shown = sorted.slice(0, visibleCount);
  const hasMore = visibleCount < total;

  // Сторожевой элемент: когда он подходит к концу списка — догружаем порцию.
  // root = окно: работает и для скролла окна (Избранное), и для внутреннего
  // скролл-контейнера нижней панели (главная) — вложенный скролл обрезается
  // автоматически, элемент пересекает окно, только попав в видимую зону.
  useEffect(() => {
    if (!hasMore) return;
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((en) => en.isIntersecting)) return;
        if (busyRef.current) return;
        busyRef.current = true;
        setLoadingMore(true);
        timerRef.current = window.setTimeout(() => {
          busyRef.current = false;
          timerRef.current = null;
          setLoadingMore(false);
          setVisibleCount((n) => Math.min(n + PAGE_SIZE, total));
        }, 150);
      },
      { rootMargin: '0px 0px 200px 0px' },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      busyRef.current = false;
      setLoadingMore(false);
    };
  }, [hasMore, total]);

  if (!total) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 bg-white p-6 text-center">
        <p className="text-sm font-medium text-gray-700">{t('list.empty')}</p>
        <p className="mt-1 text-xs text-gray-500">{t('list.emptyHint')}</p>
      </div>
    );
  }

  return (
    <div ref={rootRef}>
      <p className="mb-2 text-xs font-medium text-gray-500">
        {t('list.results', { count: total })}
      </p>
      <ul className="space-y-2">
        {shown.map(({ ev, occ }) => {
          const cat = categories.find((c) => c.id === ev.category_id);
          const title = localizedText(ev.title, ev.title_ru, ev.title_en, ev.source_lang, lang);
          const isSelected = ev.id === selectedId;
          const meta = [occurrenceLine(occ, ev.start_time, lang, weekdayNames), ev.city]
            .filter(Boolean)
            .join(' • ');
          return (
            <li key={ev.id} className="flex flex-col gap-1">
              {/* Ряд превью: кнопка + сердечко (как раньше, на всю ширину строки) */}
              <div className="flex items-stretch gap-1">
                <button
                  onClick={() => onSelect(ev)}
                  className={`min-w-0 flex-1 rounded-lg border p-3 text-left transition-colors ${
                    isSelected
                      ? 'border-gray-900 bg-white/50 ring-1 ring-gray-900'
                      : 'border-white/50 bg-white/25 hover:bg-white/50'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <span className="text-base leading-none" aria-hidden>
                      {cat?.emoji ?? '📍'}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-gray-900">{title}</p>
                      <p className="mt-0.5 text-xs text-gray-500">{meta}</p>
                    </div>
                  </div>
                </button>
                {/* Сердечко — для всех; гость (favoriteIds === null) видит его неактивным */}
                {onToggleFavorite && (
                  <div className="flex items-center">
                    <FavoriteButton
                      active={favoriteIds?.includes(ev.id) ?? false}
                      guest={favoriteIds === null}
                      onToggle={() => onToggleFavorite(ev.id)}
                    />
                  </div>
                )}
              </div>
              {/* Детали выбранного события — сразу под его превью */}
              {isSelected && renderExpanded?.(ev)}
            </li>
          );
        })}
        {/* Страж догрузки: индикатор виден только в момент подгрузки порции */}
        {hasMore && (
          <li ref={sentinelRef} aria-hidden className="flex justify-center py-2">
            {loadingMore && (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-gray-500" />
            )}
          </li>
        )}
      </ul>
    </div>
  );
}
