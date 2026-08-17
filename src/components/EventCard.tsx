// Карточка выбранного события (появляется при клике на маркер или элемент списка).
// Поля: название, даты и время, город, описание, категория, фото.
// Фото: маленькие превью; клик по фото открывает карусель на весь экран.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import type { Category, EventItem } from '../lib/types';
import { localizedText } from '../lib/translate';
import { languageName } from '../lib/languages';
import { formatDate } from '../lib/dates';
import { photoUrl } from '../lib/api';

/** Символы валют */
const CURRENCY_SYMBOLS: Record<string, string> = {
  usd: '$',
  eur: '€',
  rub: '₽',
  idr: 'Rp',
  thb: '฿',
  vnd: '₫',
  sgd: 'S$',
  myr: 'RM',
  php: '₱',
  gbp: '£',
  aud: 'A$',
  jpy: '¥',
  cny: '¥',
  krw: '₩',
  khr: '៛',
  lak: '₭',
  mmk: 'K',
};

/** Цена в читаемом виде: «Бесплатно» или «$50 USD» */
export function formatPrice(price?: number | null, currency?: string | null): string | null {
  if (price == null) return null;
  const code = (currency || 'usd').toUpperCase();
  const sym = CURRENCY_SYMBOLS[code.toLowerCase()] || '';
  return `${sym}${Number(price).toLocaleString('en-US')} ${code}`.trim();
}

interface Props {
  event: EventItem;
  categories: Category[];
  onClose: () => void;
}

/** Полный URL фото: загруженные файлы хранятся как пути в хранилище */
function fullUrl(src: string): string {
  return src.startsWith('http') ? src : photoUrl(src);
}

/** Карусель на весь экран: галерея со слайдом, пинч-зум */
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
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [slideW, setSlideW] = useState(0);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  // Начало жеста
  const startRef = useRef<{
    dist: number;
    scale: number;
    x: number;
    y: number;
    pinch: boolean;
    startOffset: { x: number; y: number };
  } | null>(null);

  // Ширина слайда (для сдвига трека в пикселях)
  function measure() {
    if (wrapRef.current) setSlideW(wrapRef.current.offsetWidth);
  }

  useEffect(() => {
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  function goTo(i: number) {
    setIdx((i + photos.length) % photos.length);
    setScale(1);
    setDragX(0);
    setOffset({ x: 0, y: 0 });
  }

  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches;
    if (t.length === 2) {
      const d = Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
      startRef.current = { dist: d, scale, x: 0, y: 0, pinch: true, startOffset: offset };
    } else if (t.length === 1) {
      startRef.current = { dist: 0, scale, x: t[0].clientX, y: t[0].clientY, pinch: false, startOffset: offset };
      setDragging(true);
      setDragX(0);
    }
  }

  function onTouchMove(e: React.TouchEvent) {
    const st = startRef.current;
    if (!st) return;
    const t = e.touches;
    if (t.length === 2 && st.pinch) {
      // Плавный пинч-зум
      const d = Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
      setScale(Math.min(4, Math.max(1, st.scale * (d / (st.dist || 1)))));
      setDragX(0);
    } else if (t.length === 1 && !st.pinch) {
      if (scale > 1) {
        // Панорама: двигаем увеличенное фото, чтобы рассмотреть углы
        const maxX = (scale - 1) * (slideW / 2) + 20;
        const maxY = (scale - 1) * 300 + 20;
        const nx = Math.max(-maxX, Math.min(maxX, st.startOffset.x + (t[0].clientX - st.x)));
        const ny = Math.max(-maxY, Math.min(maxY, st.startOffset.y + (t[0].clientY - st.y)));
        setOffset({ x: nx, y: ny });
        setDragX(0);
      } else {
        // Галерея: фото следует за пальцем, соседнее пододвигается
        setDragX(t[0].clientX - st.x);
      }
    }
  }

  function onTouchEnd() {
    const st = startRef.current;
    startRef.current = null;
    setDragging(false);
    if (st && !st.pinch && scale <= 1) {
      if (Math.abs(dragX) > slideW * 0.22) {
        goTo(idx + (dragX < 0 ? 1 : -1));
      } else {
        setDragX(0);
      }
    }
  }

  return (
    <div
      className="glass-overlay fixed inset-0 z-[3000] flex items-center justify-center"
      style={{ touchAction: 'none' }}
      onClick={onClose}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <button
        className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/60 text-gray-900 shadow hover:bg-white/80"
        onClick={onClose}
        aria-label="close"
      >
        ✕
      </button>

      {/* Окно галереи: трек со всеми фото, сдвигается как в обычной галерее */}
      <div
        ref={wrapRef}
        className="relative max-h-[85vh] w-full max-w-[92vw] overflow-hidden rounded-2xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={() => {
          if (scale > 1) {
            setScale(1);
            setOffset({ x: 0, y: 0 });
          } else {
            setScale(2);
          }
        }}
      >
        <div
          className="flex h-full"
          style={{
            transform:
              scale > 1
                ? `translateX(${-idx * slideW}px)`
                : `translateX(${-idx * slideW + dragX}px)`,
            transition: dragging ? 'none' : 'transform 0.3s ease-out',
          }}
        >
          {photos.map((p, i) => (
            <div key={i} className="h-full w-full shrink-0">
              <img
                src={fullUrl(p)}
                alt=""
                draggable={false}
                className="max-h-[85vh] w-full select-none object-contain"
                style={{
                  transform:
                    i === idx && scale > 1
                      ? `translate(${offset.x}px, ${offset.y}px) scale(${scale})`
                      : undefined,
                  transition: dragging ? 'none' : 'transform 0.1s ease-out',
                }}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Стрелки и счётчик — внизу, не влияют на центрирование фото */}
      {photos.length > 1 && (
        <div
          className="absolute bottom-6 left-1/2 z-10 flex -translate-x-1/2 items-center gap-4"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => goTo(idx - 1)}
            className="rounded-full bg-white/60 px-4 py-2 text-gray-900 shadow hover:bg-white/80"
          >
            ←
          </button>
          <span className="text-sm text-gray-800">
            {idx + 1} / {photos.length}
          </span>
          <button
            onClick={() => goTo(idx + 1)}
            className="rounded-full bg-white/60 px-4 py-2 text-gray-900 shadow hover:bg-white/80"
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
        {event.language && (
          <>
            <span className="text-gray-300">•</span>
            <span>🗣 {languageName(event.language, lang)}</span>
          </>
        )}
      </div>

      {/* Цена: «Бесплатно» или сумма с валютой */}
      <div className="mb-2 text-sm font-semibold">
        {event.price == null ? (
          <span className="text-green-600">{t('card.free')}</span>
        ) : (
          <span className="text-gray-900">{formatPrice(event.price, event.currency)}</span>
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
