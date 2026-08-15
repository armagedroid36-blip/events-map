// Карточка выбранного события (появляется при клике на маркер или элемент списка).
// Поля: название, даты, город, краткое описание, категория, ссылка на подробнее,
// фотографии (не больше 5).
import { useTranslation } from 'react-i18next';
import type { Category, EventItem } from '../lib/types';
import { localizedText } from '../lib/translate';
import { formatDate } from '../lib/dates';

interface Props {
  event: EventItem;
  categories: Category[];
  onClose: () => void;
}

export default function EventCard({ event, categories, onClose }: Props) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.startsWith('ru') ? 'ru' : 'en';
  const cat = categories.find((c) => c.id === event.category_id);

  // Название и описание — на языке интерфейса; нет перевода — оригинал
  const title = localizedText(event.title, event.title_ru, event.title_en, event.source_lang, lang);
  const description = localizedText(
    event.description,
    event.description_ru,
    event.description_en,
    event.source_lang,
    lang,
  );

  const dateLabel = event.end_date
    ? t('card.dates', {
        start: formatDate(event.start_date, lang),
        end: formatDate(event.end_date, lang),
      })
    : t('card.dateSingle', { start: formatDate(event.start_date, lang) });

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-start justify-between gap-2">
        <h3 className="text-base font-semibold leading-snug text-gray-900">{title}</h3>
        <button
          onClick={onClose}
          className="shrink-0 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          aria-label={t('common.close')}
        >
          ✕
        </button>
      </div>

      {/* Фотографии (до 5, по внешним ссылкам) */}
      {event.photos && event.photos.length > 0 && (
        <div className="mb-3 flex gap-1.5 overflow-x-auto">
          {event.photos.slice(0, 5).map((src, i) => (
            <img
              key={i}
              src={src}
              alt=""
              className="h-20 w-28 shrink-0 rounded-md object-cover"
              onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')}
            />
          ))}
        </div>
      )}

      <div className="mb-2 flex flex-wrap items-center gap-2 text-sm text-gray-600">
        <span>{dateLabel}</span>
        <span className="text-gray-300">•</span>
        <span>{event.city}</span>
        {cat && (
          <>
            <span className="text-gray-300">•</span>
            <span>
              {cat.emoji} {lang === 'ru' ? cat.name_ru : cat.name_en}
            </span>
          </>
        )}
      </div>

      <p className="mb-3 text-sm leading-relaxed text-gray-700 line-clamp-4">{description}</p>

      {event.website && (
        <a
          href={event.website}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-medium text-gray-900 underline underline-offset-2 hover:text-gray-500"
        >
          {t('card.details')} →
        </a>
      )}
    </div>
  );
}
