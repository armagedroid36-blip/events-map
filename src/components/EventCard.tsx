// Карточка выбранного события (появляется при клике на маркер или элемент списка).
// Поля: название, даты и время, город, описание, категория, фото.
// Фото: маленькие превью; клик по фото открывает карусель на весь экран.
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import type { Category, EventItem } from '../lib/types';
import { localizedText } from '../lib/translate';
import { languageName } from '../lib/languages';
import { formatDate } from '../lib/dates';
import { recurrenceLabel } from '../lib/recurrence';
import { photoUrl } from '../lib/api';
import { isValidCoords } from '../lib/coords';
import { nextZ } from '../lib/zindex';
import { navigate, slugify } from '../lib/navigate';
import FavoriteButton from './FavoriteButton';

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

/** Нормализация ссылок контактов */
function tgLink(v: string) {
  // Извлекает username из любого формата: @ник, ник, t.me/ник, https://t.me/ник
  // (в т.ч. с параметрами ?start=... и слэшем в конце)
  const s = v.trim().replace(/^@/, '').replace(/^https?:\/\//, '');
  const m = s.match(/(?:t\.me\/|telegram\.me\/)?([a-zA-Z0-9_]+)/);
  return `https://t.me/${m ? m[1] : ''}`;
}
function waLink(v: string) {
  const s = v.trim().replace(/[^\d]/g, '');
  return `https://wa.me/${s}`;
}
function igLink(v: string) {
  const s = v.trim().replace(/^@/, '').replace(/\/+$/, '').split('/').pop() || '';
  return `https://instagram.com/${s}`;
}

/** Короткий вид URL: без протокола, обрезать до ~40 символов */
function shortUrl(url: string): string {
  let s = url.replace(/^https?:\/\//, '');
  if (s.length > 40) s = s.slice(0, 40).replace(/[.,;:!?]+$/, '') + '…';
  return s;
}

/** Голые URL в тексте → кликабельные короткие ссылки */
function linkifyBare(text: string, keyBase: number): ReactNode {
  const parts = text.split(/(https?:\/\/[^\s<>)]+)/g);
  return parts.map((part, i) => {
    const k = `${keyBase}-${i}`;
    if (/^https?:\/\//.test(part)) {
      return (
        <a key={k} href={part} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline break-all">
          {shortUrl(part)}
        </a>
      );
    }
    return <span key={k}>{part}</span>;
  });
}

/** Кликабельные ссылки в описании: «текст (URL)» → подпись без URL; голый URL → короткая ссылка */
function linkifyText(text: string): ReactNode {
  const out: ReactNode[] = [];
  // Этап 1: «текст (https://…URL…)» — URL прячем, показываем только подпись
  const re = /([^()\n]*?)\s*\(https?:\/\/[^\s<>)]+\)/g;
  let last = 0;
  let k = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out.push(linkifyBare(text.slice(last, m.index), k++));
    const url = m[0].match(/https?:\/\/[^\s<>)]+/)?.[0] || '';
    const label = m[1].trim() || shortUrl(url);
    out.push(
      <a key={k++} href={url} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">
        {label}
      </a>,
    );
    last = m.index + m[0].length;
  }
  out.push(linkifyBare(text.slice(last), k));
  return <>{out}</>;
}

function CLink({ href, title, children }: { href: string; title: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={title}
      className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900"
    >
      {children}
    </a>
  );
}

interface Props {
  event: EventItem;
  categories: Category[];
  onClose: () => void;
  isAdmin?: boolean;
  /** Текущий пользователь — владелец события (organizer) */
  isOwner?: boolean;
  onDelete?: (id: string) => void;
  /** id событий в избранном; null — гость (сердечко показывается неактивным) */
  favoriteIds?: string[] | null;
  /** Переключить избранное (вызывается при клике на сердечко) */
  onToggleFavorite?: (id: string) => void;
  /** Заголовок как h1 вместо h3 — на странице события /event/<id>/<slug>,
   *  где это единственный h1 (бренд и городской SEO-блок там скрыты). */
  titleAsH1?: boolean;
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
  const [slideH, setSlideH] = useState(0);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const winZ = useRef(nextZ()).current;
  // Начало жеста
  const startRef = useRef<{
    dist: number;
    scale: number;
    x: number;
    y: number;
    pinch: boolean;
    startOffset: { x: number; y: number };
  } | null>(null);

  // Ширина/высота слайда (для сдвига трека и размера канваса)
  function measure() {
    if (wrapRef.current) {
      setSlideW(wrapRef.current.offsetWidth);
      setSlideH(wrapRef.current.offsetHeight);
    }
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

  // Канвас-зум: фото перерисовывается целиком (без швов-артефактов,
  // которые даёт CSS transform: scale на Android/Chrome)
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imgCache = useRef(new Map<string, HTMLImageElement>());

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const W = slideW;
    const H = slideH;
    if (!W || !H) return;
    const dpr = window.devicePixelRatio || 1;
    const pw = Math.round(W * dpr);
    const ph = Math.round(H * dpr);
    // Буфер пересоздаём только при изменении размера (иначе дёргается)
    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw;
      canvas.height = ph;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const src = fullUrl(photos[idx]);
    const draw = (im: HTMLImageElement) => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      const base = Math.min(W / im.naturalWidth, H / im.naturalHeight);
      const dw = im.naturalWidth * base * scale * dpr;
      const dh = im.naturalHeight * base * scale * dpr;
      const dx = (canvas.width - dw) / 2 + offset.x * dpr;
      const dy = (canvas.height - dh) / 2 + offset.y * dpr;
      ctx.drawImage(im, dx, dy, dw, dh);
    };
    const cached = imgCache.current.get(src);
    if (cached) {
      draw(cached);
    } else {
      const im = new Image();
      im.onload = () => {
        imgCache.current.set(src, im);
        draw(im);
      };
      im.src = src;
    }
  }, [scale, offset.x, offset.y, idx, photos, slideW, slideH]);

  return (
    <div
      className="glass-overlay fixed inset-0 z-[3000] flex items-center justify-center"
      style={{ zIndex: winZ, touchAction: 'none' }}
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
        className="relative h-[96vh] w-full max-w-full overflow-hidden rounded-2xl shadow-2xl"
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
              {i === idx ? (
                <canvas
                  ref={canvasRef}
                  style={{
                    width: slideW ? `${slideW}px` : '100%',
                    height: slideH ? `${slideH}px` : '100%',
                  }}
                />
              ) : (
                <img
                  src={fullUrl(p)}
                  alt=""
                  draggable={false}
                  className="event-lightbox-img h-full w-full select-none object-contain"
                />
              )}
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

/** Кнопка «Поделиться»: ссылка на событие в мессенджеры и email,
 *  копирование ссылки, нативная системная «Поделиться» (navigator.share).
 *  Панель — createPortal в body с тёмным оверлеем (паттерн меню шестерёнки). */
function ShareButton({ url, title }: { url: string; title: string }) {
  const { t } = useTranslation();
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ right: number; top: number } | null>(null);
  const [copied, setCopied] = useState(false);
  const z = useRef(nextZ()).current;
  const copyTimer = useRef<number | null>(null);

  function openPanel() {
    const r = btnRef.current?.getBoundingClientRect();
    if (r) {
      // Панель под кнопкой, с зажимом по краям экрана
      setPos({
        right: Math.max(8, Math.round(window.innerWidth - r.right)),
        top: Math.min(Math.round(r.bottom + 8), Math.max(8, window.innerHeight - 280)),
      });
    } else {
      setPos({ right: 12, top: 72 });
    }
    setOpen(true);
  }

  function closePanel() {
    setOpen(false);
    setCopied(false);
    if (copyTimer.current) window.clearTimeout(copyTimer.current);
  }

  function copyLink() {
    navigator.clipboard?.writeText(url).then(() => {
      setCopied(true);
      if (copyTimer.current) window.clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }

  const shareText = `${title} — ${url}`;
  const itemCls = 'block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50';

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          openPanel();
        }}
        title={t('card.share')}
        aria-label={t('card.share')}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
      >
        {/* Иконка share: стрелка из коробки */}
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
          <polyline points="16 6 12 2 8 6" />
          <line x1="12" y1="2" x2="12" y2="15" />
        </svg>
      </button>

      {open &&
        createPortal(
          <>
            <div className="fixed inset-0 bg-black/20" style={{ zIndex: z }} onClick={closePanel} />
            <div
              className="glass fixed w-56 rounded-lg py-1 shadow-xl"
              style={pos ? { right: pos.right, top: pos.top, zIndex: z + 1 } : { zIndex: z + 1 }}
            >
              <a
                href={`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={closePanel}
                className={itemCls}
              >
                {t('card.shareTelegram')}
              </a>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(shareText)}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={closePanel}
                className={itemCls}
              >
                {t('card.shareWhatsapp')}
              </a>
              <a
                href={`viber://forward?text=${encodeURIComponent(shareText)}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={closePanel}
                className={itemCls}
              >
                {t('card.shareViber')}
              </a>
              <a
                href={`mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(url)}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={closePanel}
                className={itemCls}
              >
                {t('card.shareEmail')}
              </a>
              <button type="button" onClick={copyLink} className={itemCls}>
                {copied ? t('card.copied') : t('card.copyLink')}
              </button>
              {typeof navigator.share === 'function' && (
                <button
                  type="button"
                  onClick={() => {
                    navigator.share({ title, text: title, url }).catch(() => {});
                    closePanel();
                  }}
                  className={itemCls}
                >
                  {t('card.shareNative')}
                </button>
              )}
            </div>
          </>,
          document.body,
        )}
    </>
  );
}

export default function EventCard({
  event,
  categories,
  onClose,
  isAdmin,
  isOwner,
  onDelete,
  favoriteIds = null,
  onToggleFavorite,
  titleAsH1,
}: Props) {
  const { t, i18n } = useTranslation();
  const [lightbox, setLightbox] = useState<number | null>(null);
  // Индексы фото с битыми ссылками (onError) — скрываем их, не пряча молча
  const [brokenPhotos, setBrokenPhotos] = useState<Set<number>>(() => new Set());
  // Битая аватарка организатора — вместо неё заглушка-иконка
  const [brokenOrgAvatar, setBrokenOrgAvatar] = useState(false);
  // При смене события сбрасываем отметки битых фото
  useEffect(() => {
    setBrokenPhotos(new Set());
    setBrokenOrgAvatar(false);
  }, [event.id]);
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

  const dateLabel = event.recurrence
    ? (recurrenceLabel(event, lang, t) ?? '')
    : event.end_date
      ? t('card.dates', {
          start: formatDate(event.start_date, lang),
          end: formatDate(event.end_date, lang),
        })
      : t('card.dateSingle', { start: formatDate(event.start_date, lang) });

  // Точное время, если указано
  const timeLabel =
    event.start_time && (event.end_time ? `${event.start_time} – ${event.end_time}` : event.start_time);

  const photos = (event.photos ?? []).filter((p) => p);

  // Рабочие фото: без битых ссылок (onError)
  const okPhotos = photos.filter((_, i) => !brokenPhotos.has(i));

  // Удаление доступно админу или владельцу события, с подтверждением
  const handleDelete = () => {
    if (onDelete && window.confirm('Удалить событие?')) onDelete(event.id);
  };

  return (
    <div className="rounded-lg p-4">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="flex-1">
          {titleAsH1 ? (
            <h1 className="text-base font-semibold leading-snug text-gray-900">{title}</h1>
          ) : (
            <h3 className="text-base font-semibold leading-snug text-gray-900">{title}</h3>
          )}
          {event.is_international && (
            <span className="mt-1 inline-block rounded-full bg-[#72D2CF]/25 px-2 py-0.5 text-[10px] font-semibold text-[#0F766E]">
              {t('card.international')}
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {/* Поделиться — доступно всем, в т.ч. гостям */}
          <ShareButton
            url={`${window.location.origin}/event/${event.id}/${slugify(event.title)}`}
            title={title}
          />
          {/* Сердечко — для всех; гость (favoriteIds === null) видит его неактивным */}
          {onToggleFavorite && (
            <FavoriteButton
              active={favoriteIds?.includes(event.id) ?? false}
              guest={favoriteIds === null}
              onToggle={() => onToggleFavorite(event.id)}
            />
          )}
        </div>
      </div>

      {/* Фото: маленькие превью, клик — карусель на весь экран.
          Нет рабочих фото — заглушка вместо пустого верха карточки */}
      {okPhotos.length === 0 ? (
        <div className="mb-3 flex h-32 w-full items-center justify-center gap-2 rounded-md border border-gray-200 bg-gray-100">
          <span className="text-2xl leading-none">📷</span>
          <span className="text-sm text-gray-500">{t('card.noPhoto')}</span>
        </div>
      ) : (
        <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
          {okPhotos.map((src, i) => (
            <img
              key={i}
              src={fullUrl(src)}
              alt=""
              className="h-20 w-28 shrink-0 cursor-pointer rounded-md object-cover hover:opacity-90"
              onClick={() => setLightbox(i)}
              onError={() =>
                setBrokenPhotos((prev) => {
                  if (prev.has(i)) return prev;
                  const next = new Set(prev);
                  next.add(i);
                  return next;
                })
              }
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
        {event.languages?.length ? (
          <>
            <span className="text-gray-300">•</span>
            <span>🌐 {event.languages.map((c) => languageName(c, lang)).filter(Boolean).join(' · ')}</span>
          </>
        ) : event.language ? (
          <>
            <span className="text-gray-300">•</span>
            <span>🗣 {languageName(event.language, lang)}</span>
          </>
        ) : null}
      </div>

      {/* Адрес: клик открывает Google Maps. Если адреса нет, но координаты есть
          (центр города от сборщика) — показываем «место уточнить у организатора» */}
      {event.address && isValidCoords(event.lat, event.lng) ? (
        <a
          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${event.lat},${event.lng}`)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mb-2 block text-sm text-gray-600 hover:text-gray-900 hover:underline"
        >
          📍 {event.address}
        </a>
      ) : isValidCoords(event.lat, event.lng) || event.address ? (
        <p className="mb-2 block text-sm text-gray-600">📍 {t('card.placeUnknown')}</p>
      ) : null}

      {/* Цена: 0 = бесплатно, пусто = уточнять, иначе сумма */}
      <div className="mb-2 text-sm font-semibold">
        {event.price == null ? (
          <span className="text-gray-600">{t('card.priceUnknown')}</span>
        ) : event.price === 0 ? (
          <span className="text-green-600">{t('card.free')}</span>
        ) : (
          <span className="text-gray-900">{formatPrice(event.price, event.currency)}</span>
        )}
      </div>

      <p className="mb-3 whitespace-pre-line text-sm leading-relaxed text-gray-700">{linkifyText(description)}</p>

      {/* Организатор: кружок с аватаркой (клик — публичный профиль)
          + контакты организатора (векторные иконки-ссылки) */}
      {(event.owner_id || event.contact_telegram || event.contact_whatsapp || event.contact_email || event.contact_phone || event.contact_instagram) && (
        <div className="mb-3 border-t border-gray-200 pt-2">
          <p className="mb-1.5 text-xs font-medium text-gray-500">{t('card.organizer')}</p>
          {event.owner_id && (
            <button
              type="button"
              onClick={() => {
                onClose();
                // Чистый URL профиля организатора (/org/<id>); Home/App сами
                // разберут маршрут
                navigate(`/org/${encodeURIComponent(event.owner_id ?? '')}`);
              }}
              title={t('card.organizer')}
              aria-label={t('card.organizer')}
              className="mb-2 flex items-center gap-2 rounded-full hover:bg-gray-50"
            >
              {event.org_avatar_url && !brokenOrgAvatar ? (
                <img
                  src={fullUrl(event.org_avatar_url)}
                  alt=""
                  className="h-10 w-10 shrink-0 rounded-full object-cover"
                  onError={() => setBrokenOrgAvatar(true)}
                />
              ) : (
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-400">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    width="20"
                    height="20"
                  >
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                </span>
              )}
              {event.org_display_name && (
                <span className="text-sm font-medium text-gray-900">{event.org_display_name}</span>
              )}
            </button>
          )}
          {(event.contact_telegram || event.contact_whatsapp || event.contact_email || event.contact_phone || event.contact_instagram) && (
          <div className="flex flex-wrap gap-2">
            {event.contact_telegram && (
              <CLink href={tgLink(event.contact_telegram)} title="Telegram">
                <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                  <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
                </svg>
              </CLink>
            )}
            {event.contact_whatsapp && (
              <CLink href={waLink(event.contact_whatsapp)} title="WhatsApp">
                <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
                </svg>
              </CLink>
            )}
            {event.contact_instagram && (
              <CLink href={igLink(event.contact_instagram)} title="Instagram">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
                  <rect x="2" y="2" width="20" height="20" rx="5" />
                  <circle cx="12" cy="12" r="4" />
                  <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
                </svg>
              </CLink>
            )}
            {event.contact_email && (
              <CLink href={`mailto:${event.contact_email}`} title="Email">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
                  <rect x="2" y="4" width="20" height="16" rx="2" />
                  <path d="m22 7-10 6L2 7" />
                </svg>
              </CLink>
            )}
            {event.contact_phone && (
              <CLink href={`tel:${event.contact_phone.replace(/[^\d+]/g, '')}`} title="Phone">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                </svg>
              </CLink>
            )}
          </div>
          )}
        </div>
      )}

      {event.website && (
        <a
          href={event.website}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block rounded-md bg-[#e66343] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#d95a3c]"
        >
          {t('card.details')} →
        </a>
      )}

      {lightbox !== null && okPhotos.length > 0 &&
        createPortal(
          <Lightbox photos={okPhotos} start={lightbox} onClose={() => setLightbox(null)} />,
          document.body,
        )}

      {/* Удаление (админ или владелец события) — внизу карточки, справа */}
      {(isAdmin || isOwner) && onDelete && (
        <div className="mt-3 flex justify-end">
          <button
            onClick={handleDelete}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-red-50 text-red-600 shadow hover:bg-red-100"
            title="Удалить событие"
            aria-label="Удалить событие"
          >
            🗑
          </button>
        </div>
      )}
    </div>
  );
}
