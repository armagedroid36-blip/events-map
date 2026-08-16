// Карточка выбранного события (появляется при клике на маркер или элемент списка).
// Поля: название, даты и время, город, описание, категория, фото.
// Фото: маленькие превью; клик по фото открывает карусель на весь экран.
import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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

/** Карусель на весь экран: свайп для листания, щипок для плавного зума */
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
  const [scale, setScale] = useState(1);
  const [dragX, setDragX] = useState(0);
  // Начало жеста: расстояние между пальцами и стартовый масштаб (для плавного зума)
  const startRef = useRef<{ dist: number; scale: number; x: number; pinch: boolean } | null>(null);

  function goTo(i: number) {
    setIdx((i + photos.length) % photos.length);
    setScale(1);
    setDragX(0);
  }

  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches;
    if (t.length === 2) {
      const d = Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
      startRef.current = { dist: d, scale, x: 0, pinch: true };
    } else if (t.length === 1) {
      startRef.current = { dist: 0, scale, x: t[0].clientX, pinch: false };
    }
  }

  function onTouchMove(e: React.TouchEvent) {
    const st = startRef.current;
    if (!st) return;
    const t = e.touches;
    if (t.length === 2 && st.pinch) {
      // Плавный пинч: масштаб от начального, пропорционально расстоянию пальцев
      const d = Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
      setScale(Math.min(4, Math.max(1, st.scale * (d / (st.dist || 1)))));
    } else if (t.length === 1 && !st.pinch && scale <= 1) {
      setDragX(t[0].clientX - st.x);
    }
  }

  function onTouchEnd() {
    const st = startRef.current;
    startRef.current = null;
    if (st && !st.pinch && Math.abs(dragX) > 60 && scale <= 1) {
      goTo(idx + (dragX < 0 ? 1 : -1));
    } else {
      setDragX(0);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/90"
      style={{ touchAction: 'none' }}
      onClick={onClose}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <button
        className="absolute right-4 top-4 z-10 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
        onClick={onClose}
        aria-label="close"
      >
        ✕
      </button>

      {/* Фото по центру экрана, в окне с закруглёнными краями */}
      <div
        className="relative max-h-[85vh] max-w-[92vw] overflow-hidden rounded-2xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={() => setScale(scale > 1 ? 1 : 2)}
      >
        <img
          key={idx}
          src={fullUrl(photos[idx])}
          alt=""
          draggable={false}
          className="lightbox-fade max-h-[85vh] max-w-[92vw] select-none object-contain"
          style={{
            transform: scale > 1 ? `scale(${scale})` : `translateX(${dragX}px)`,
            transition: 'transform 0.12s ease-out',
            cursor: scale > 1 ? 'grab' : 'zoom-in',
          }}
        />
      </div>

      {/* Стрелки и счётчик — внизу, не влияют на центрирование фото */}
      {photos.length > 1 && (
        <div
          className="absolute bottom-6 left-1/2 z-10 flex -translate-x-1/2 items-center gap-4"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => goTo(idx - 1)}
            className="rounded-full bg-white/10 px-4 py-2 text-white hover:bg-white/20"
          >
            ←
          </button>
          <span className="text-sm text-white/70">
            {idx + 1} / {photos.length}
          </span>
          <button
            onClick={() => goTo(idx + 1)}
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
    <div className="rounded-lg p-4">
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

      {lightbox !== null && photos.length > 0 &&
        createPortal(
          <Lightbox photos={photos} start={lightbox} onClose={() => setLightbox(null)} />,
          document.body,
        )}
    </div>
  );
}
