// Карточка выбранного события (появляется при клике на маркер или элемент списка).
// Поля: название, даты и время, город, описание, категория, фото.
// Фото: маленькие превью; клик по фото открывает карусель на весь экран.
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Category, EventItem } from '../lib/types';
import { localizedText } from '../lib/translate';
import { formatDate } from '../lib/dates';
import { photoUrl } from '../lib/api';

interface Props {
  event: EventItem;
  categories: Category[];
  onClose: () => void;
}

/** Полный URL фото: загруженные файлы хранятся как пути в хранилище */
function fullUrl(src: string): string {
  return src.startsWith('http') ? src : photoUrl(src);
}

/** Карусель на весь экран */
function Lightbox({
  photos,
  start,
  onClose,
}: {
  photos: string[];
  start: number;
  onClose: () => void;
}) {
  const [idx, setIdx] = useState(start);
  return (
    <div
      className="fixed inset-0 z-[3000] flex flex-col items-center justify-center bg-black/90"
      onClick={onClose}
    >
      <button
        className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
        onClick={onClose}
        aria-label="close"
      >
        ✕
      </button>
      <img
        src={fullUrl(photos[idx])}
        alt=""
        className="max-h-[80vh] max-w-[92vw] rounded-lg object-contain"
        onClick={(e) => e.stopPropagation()}
      />
      {photos.length > 1 && (
        <div className="mt-4 flex items-center gap-4" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => setIdx((i) => (i - 1 + photos.length) % photos.length)}
            className="rounded-full bg-white/10 px-4 py-2 text-white hover:bg-white/20"
          >
            ←
          </button>
          <span className="text-sm text-white/70">
            {idx + 1} / {photos.length}
          </span>
          <button
            onClick={() => setIdx((i) => (i + 1) % photos.length)}
            className="rounded-full bg-white/10 px-4 py-2 text-white hover:bg-white/20"
          >
            →
          </button>
        </div>
      )}
    </div>
  );
}

export default function EventCard({ event, categories, onClose }: Props) {
  const { t, i18n } = useTranslation();
  const [lightbox, setLightbox] = useState<number | null>(null);
  const lang = i18n.language.startsWith('ru') ? 'ru' : 'en';
  const cat = categories.find((c) => c.id === event.category_id);

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

  // Точное время, если указано
  const timeLabel =
    event.start_time && (event.end_time ? `${event.start_time} – ${event.end_time}` : event.start_time);

  const photos = (event.photos ?? []).filter((p) => p);

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

      {/* Фото: маленькие превью, клик — карусель на весь экран */}
      {photos.length > 0 && (
        <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
          {photos.map((src, i) => (
            <img
              key={i}
              src={fullUrl(src)}
              alt=""
              className="h-20 w-28 shrink-0 cursor-pointer rounded-md object-cover hover:opacity-90"
              onClick={() => setLightbox(i)}
              onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')}
            />
          ))}
        </div>
      )}

      <div className="mb-2 flex flex-wrap items-center gap-2 text-sm text-gray-600">
        <span>{dateLabel}</span>
        {timeLabel && (
          <>
            <span className="text-gray-300">•</span>
            <span>🕒 {timeLabel}</span>
          </>
        )}
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

      <p className="mb-3 text-sm leading-relaxed text-gray-700">{description}</p>

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

      {lightbox !== null && photos.length > 0 && (
        <Lightbox photos={photos} start={lightbox} onClose={() => setLightbox(null)} />
      )}
    </div>
  );
}
