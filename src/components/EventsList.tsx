// Список событий рядом с картой (на мобильных — ниже).
// Сортировка по дате, счётчик результатов, пустое состояние.
import { useTranslation } from 'react-i18next';
import type { ReactNode } from 'react';
import type { Category, EventItem } from '../lib/types';
import { localizedText } from '../lib/translate';
import { formatDate } from '../lib/dates';
import { recurrenceLabel } from '../lib/recurrence';
import FavoriteButton from './FavoriteButton';

interface Props {
  events: EventItem[];
  categories: Category[];
  selectedId: string | null;
  onSelect: (ev: EventItem) => void;
  /** id событий в избранном; null — гость (сердечко скрыто) */
  favoriteIds?: string[] | null;
  /** Переключить избранное (вызывается при клике на сердечко) */
  onToggleFavorite?: (id: string) => void;
  /** Развернуть детали выбранного события сразу под его превью.
   *  Необязательный: без него поведение как раньше (главная не передаёт). */
  renderExpanded?: (ev: EventItem) => ReactNode;
}

export default function EventsList({ events, categories, selectedId, onSelect, favoriteIds = null, onToggleFavorite, renderExpanded }: Props) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.startsWith('ru') ? 'ru' : 'en';

  // Сортировка по дате начала
  const sorted = [...events].sort((a, b) => a.start_date.localeCompare(b.start_date));

  if (!sorted.length) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 bg-white p-6 text-center">
        <p className="text-sm font-medium text-gray-700">{t('list.empty')}</p>
        <p className="mt-1 text-xs text-gray-500">{t('list.emptyHint')}</p>
      </div>
    );
  }

  return (
    <div>
      <p className="mb-2 text-xs font-medium text-gray-500">
        {t('list.results', { count: sorted.length })}
      </p>
      <ul className="space-y-2">
        {sorted.map((ev) => {
          const cat = categories.find((c) => c.id === ev.category_id);
          const title = localizedText(ev.title, ev.title_ru, ev.title_en, ev.source_lang, lang);
          const isSelected = ev.id === selectedId;
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
                      <p className="mt-0.5 text-xs text-gray-500">
                        {ev.recurrence
                          ? (recurrenceLabel(ev, lang, t) ?? '')
                          : `${formatDate(ev.start_date, lang)}${ev.end_date ? ` — ${formatDate(ev.end_date, lang)}` : ''}`}
                        {' • '}
                        {ev.city}
                      </p>
                    </div>
                  </div>
                </button>
                {/* Сердечко — только для вошедших (favoriteIds !== null) */}
                {favoriteIds !== null && onToggleFavorite && (
                  <div className="flex items-center">
                    <FavoriteButton
                      active={favoriteIds.includes(ev.id)}
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
      </ul>
    </div>
  );
}
