// Форма «Добавить мероприятие».
// - Точное время начала/окончания
// - Тычок по карте -> адрес и город заполняются автоматически
// - Организатор выбирает контакты для связи из своего профиля
// - Фото загружаются файлами (до 5, до 10 МБ, сжимаются на клиенте)
// - После сохранения событие уходит на модерацию
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { nextZ } from '../lib/zindex';
import * as maplibregl from 'maplibre-gl';
import { mapStyle } from '../lib/mapStyle';
import { z } from 'zod';
import type { Category, EventItem, Recurrence } from '../lib/types';
import { getApi, photoUrl } from '../lib/api';
import { compressImage } from '../lib/imageCompress';
import { geocodeAddress, reverseGeocode } from '../lib/geocode';
import { detectLang, translateText } from '../lib/translate';
import { LANGUAGES } from '../lib/languages';
import { contactErrors, normalizeContacts } from '../lib/contacts';
import { detectCountry } from '../lib/countries';
import { isValidCoords } from '../lib/coords';
import { todayIso } from '../lib/dates';
import { config } from '../config';
import { useAuth } from '../lib/auth';

interface Props {
  categories: Category[];
  onClose: () => void;
  /** Событие для повторения (данные подставляются в форму) */
  event?: EventItem | null;
  /** Режим редактирования существующего события (админ): сохраняет изменения */
  editEvent?: EventItem | null;
}

/** HTML чёрного пина 📍 для мини-карты формы (как был formIcon на Leaflet) */
const formMarkerHtml = `<span class="event-marker" style="--marker-bg:#111827;--marker-color:#111827">
  <svg width="36" height="46" viewBox="0 0 36 46" xmlns="http://www.w3.org/2000/svg">
    <path d="M18 1 C9 1 2 8.5 2 18 C2 29 18 44 18 44 C18 44 34 29 34 18 C34 8.5 27 1 18 1 Z"
      fill="var(--marker-bg, rgba(255,255,255,0.85))" stroke="var(--marker-color)" stroke-width="2"/>
  </svg>
  <span class="event-marker-emoji">📍</span>
</span>`;

/** Мини-карта формы: клик ставит маркер и координаты, внешние lat/lng двигают карту */
function MiniMap({
  lat,
  lng,
  onMove,
}: {
  lat: number;
  lng: number;
  onMove: (lat: number, lng: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;
  const lastKey = useRef('');

  // Инициализация — один раз
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const map = new maplibregl.Map({
      container: el,
      style: mapStyle,
      center: [lng, lat],
      zoom: 6,
      attributionControl: false,
    });
    map.addControl(
      new maplibregl.AttributionControl({ compact: true, customAttribution: config.mapAttribution }),
      'bottom-right',
    );
    const markerEl = document.createElement('div');
    markerEl.innerHTML = formMarkerHtml;
    const marker = new maplibregl.Marker({
      element: markerEl.firstElementChild as HTMLElement,
      anchor: 'bottom',
    })
      .setLngLat([lng, lat])
      .addTo(map);
    // Клик по мини-карте передвигает маркер и подставляет адрес
    map.on('click', (e: maplibregl.MapMouseEvent) => onMoveRef.current(e.lngLat.lat, e.lngLat.lng));
    mapRef.current = map;
    markerRef.current = marker;
    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Внешнее изменение центра (геолокация/геокодинг) — маркер + flyTo
  useEffect(() => {
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!map || !marker) return;
    const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
    if (key === lastKey.current) return;
    lastKey.current = key;
    marker.setLngLat([lng, lat]);
    map.flyTo({ center: [lng, lat], zoom: map.getZoom() });
  }, [lat, lng]);

  return <div ref={containerRef} className="h-full w-full" />;
}

/**
 * Фоновый перевод названия/описания на второй язык после сохранения события.
 * Сбой перевода не критичен: событие остаётся с оригиналом.
 */
async function translateInBackground(
  id: string,
  title: string,
  description: string,
  sourceLang: 'ru' | 'en',
): Promise<void> {
  try {
    const target: 'ru' | 'en' = sourceLang === 'ru' ? 'en' : 'ru';
    const [titleTr, descTr] = await Promise.all([
      translateText(title, target),
      translateText(description, target),
    ]);
    if (!titleTr && !descTr) return;
    const upd: Partial<EventItem> =
      target === 'ru'
        ? { title_ru: titleTr ?? undefined, description_ru: descTr ?? undefined }
        : { title_en: titleTr ?? undefined, description_en: descTr ?? undefined };
    await getApi().updateEvent(id, upd);
  } catch {
    // перевод недоступен — остаётся оригинал
  }
}

/** Значки для полей контактов */
const IconTelegram = (
  <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
    <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
  </svg>
);

const IconWhatsapp = (
  <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
  </svg>
);

const IconEmail = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <path d="m22 7-10 6L2 7" />
  </svg>
);

const IconPhone = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
  </svg>
);

const IconInstagram = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
    <rect x="2" y="2" width="20" height="20" rx="5" />
    <circle cx="12" cy="12" r="4" />
    <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
  </svg>
);

/** Поле ввода с иконкой слева */
function IconInput({
  icon,
  value,
  onChange,
  placeholder,
  type,
}: {
  icon: ReactNode;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  type?: string;
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400">
        {icon}
      </span>
      <input
        type={type ?? 'text'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-md border border-gray-300 py-2 pl-9 pr-2.5 text-sm focus:border-gray-900 focus:outline-none"
      />
    </div>
  );
}

/** Поле даты с крестиком очистки (✕ очищает без открытия календаря) */
function DateField({
  value,
  onChange,
  min,
  required,
}: {
  value: string;
  onChange: (v: string) => void;
  min?: string;
  required?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="relative">
      <input
        type="date"
        value={value}
        min={min}
        required={required}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-gray-300 px-2.5 py-2 pr-9 text-sm focus:border-gray-900 focus:outline-none"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          aria-label={t('common.clear')}
          title={t('common.clear')}
        >
          ✕
        </button>
      )}
    </div>
  );
}

/** Нормализация названия города: trim + первая буква заглавная */
function normalizeCity(s: string): string {
  const v = s.trim();
  return v ? v[0].toUpperCase() + v.slice(1) : v;
}

/** Ключ дедупа файла: размер + хэш первых байт (djb2) */
async function fileKey(f: File): Promise<string> {
  const buf = await f.slice(0, 65536).arrayBuffer();
  const u8 = new Uint8Array(buf);
  let h = 5381;
  for (let i = 0; i < u8.length; i++) h = ((h << 5) + h + u8[i]) >>> 0;
  return `${f.size}:${h.toString(36)}`;
}

export default function EventForm({ categories, onClose, event: eventProp, editEvent }: Props) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.startsWith('ru') ? 'ru' : 'en';
  const { user } = useAuth();
  const winZ = useRef(nextZ()).current;
  // Редактирование (админ) или повтор — данные в форме одни и те же
  const event = editEvent ?? eventProp;
  const isRepeat = !!event;
  const isEdit = !!editEvent;
  const isResubmit = isEdit && user?.role === 'org' && (event?.status === 'rejected' || event?.status === 'needs_changes');

  // --- Состояние формы (при повторе — данные из события) ---
  const [title, setTitle] = useState(event?.title ?? '');
  const [description, setDescription] = useState(event?.description ?? '');
  const [startDate, setStartDate] = useState(event?.start_date ?? '');
  const [endDate, setEndDate] = useState(event?.end_date ?? '');
  const [startTime, setStartTime] = useState(event?.start_time ?? '');
  const [endTime, setEndTime] = useState(event?.end_time ?? '');
  // Повторение: разовое / каждый день / по дням недели (из recurrence события)
  const [repeatMode, setRepeatMode] = useState<'once' | 'daily' | 'weekly'>(
    event?.recurrence?.freq === 'daily' ? 'daily' : event?.recurrence?.freq === 'weekly' ? 'weekly' : 'once',
  );
  const [repeatDays, setRepeatDays] = useState<number[]>(event?.recurrence?.days ?? []);
  const [city, setCity] = useState(event?.city ?? '');
  const [address, setAddress] = useState(event?.address ?? '');
  const [categoryId, setCategoryId] = useState(event?.category_id ?? '');
  const [language] = useState(event?.language ?? '');
  // Несколько языков: если заданы — берём их, иначе одиночный language
  const [languages, setLanguages] = useState<string[]>(
    event?.languages?.length ? event.languages : event?.language ? [event.language] : [],
  );
  const [website, setWebsite] = useState(event?.website ?? '');
  // Контакты: поля ввода (для организатора предзаполняются из профиля)
  const [contact, setContact] = useState(event?.contact ?? '');
  const [contactTg, setContactTg] = useState(event?.contact_telegram ?? '');
  const [contactWa, setContactWa] = useState(event?.contact_whatsapp ?? '');
  const [contactEmailVal, setContactEmailVal] = useState(event?.contact_email ?? '');
  const [contactPhoneVal, setContactPhoneVal] = useState(event?.contact_phone ?? '');
  const [contactIg, setContactIg] = useState(event?.contact_instagram ?? '');
  // Фото: пути загруженных файлов
  const [photos, setPhotos] = useState<string[]>(event?.photos ?? []);
  const [uploading, setUploading] = useState(false);
  // Битые фото (onError): вместо иконки «битый файл» — серая заглушка.
  // Ключ — сам src: устойчиво к удалению фото из середины списка.
  const [brokenPhotos, setBrokenPhotos] = useState<Set<string>>(() => new Set());
  // Ошибки выбора фото (размер/формат) и ключи загруженных файлов (дедуп)
  const [photoError, setPhotoError] = useState('');
  const [photoKeys, setPhotoKeys] = useState<Set<string>>(() => new Set());
  // Свой язык мероприятия (ввод с подсказками)
  const [customLang, setCustomLang] = useState('');
  // Полные http/https-ссылки (из парсера, напр. telegram-cdn) рендерим как есть,
  // относительные пути хранилища — через photoUrl() (supabase-префикс)
  const fullUrl = (src: string) => (src.startsWith('http') ? src : photoUrl(src));
  // Цена и валюта (price = null → «уточнить у организатора»); донат,
  // бесплатно и «уточнить» — взаимоисключающие
  const [free, setFree] = useState(event ? event.price === 0 : false);
  const [priceUnknown, setPriceUnknown] = useState(event ? event.price == null && !event.donation : false);
  const [donation, setDonation] = useState<boolean>(event?.donation ?? false);
  const [price, setPrice] = useState(event?.price != null ? String(event.price) : '');
  const [currency, setCurrency] = useState(event?.currency ?? 'usd');
  // Координаты
  const [lat, setLat] = useState<number>(event?.lat ?? config.defaultCenter.lat);
  const [lng, setLng] = useState<number>(event?.lng ?? config.defaultCenter.lng);
  // Маркер трогали (для нового события без отметки на карте отправка блокируется).
  // При повторе/редактировании маркер уже стоит на месте исходного события.
  const [markerTouched, setMarkerTouched] = useState<boolean>(
    !!event && isValidCoords(event.lat, event.lng),
  );
  const [geocoding, setGeocoding] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  // Ошибка конкретного поля исчезает, как только поле меняют
  const clearErr = (k: string) =>
    setErrors((prev) => {
      if (!(k in prev)) return prev;
      const next = { ...prev };
      delete next[k];
      return next;
    });

  const isOrg = user?.role === 'org';
  const isAdmin = user?.role === 'admin';

  // Для новой формы центрируем мини-карту на пользователе (при согласии
  // на геолокацию); при редактировании/повторе — координаты события
  useEffect(() => {
    if (event) return;
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude);
        setLng(pos.coords.longitude);
      },
      () => {},
      { timeout: 5000, maximumAge: 60000 },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Контакты из профиля — предзаполняют поля только НОВОЙ формы.
  // При редактировании/повторе контакты берутся из самого события.
  useEffect(() => {
    if ((isOrg || isAdmin) && !event) {
      getApi()
        .getMyProfile()
        .then((p) => {
          if (p) {
            if (!contactTg) setContactTg(p.contact_telegram ?? '');
            if (!contactWa) setContactWa(p.contact_whatsapp ?? '');
            if (!contactEmailVal) setContactEmailVal(p.contact_email ?? '');
            if (!contactPhoneVal) setContactPhoneVal(p.contact_phone ?? '');
            if (!contactIg) setContactIg(p.instagram ?? '');
          }
        })
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOrg, isAdmin]);

  // Язык события: для новой формы предзаполняем языком браузера/интерфейса,
  // если он есть в списке LANGUAGES
  useEffect(() => {
    if (event) return;
    const code = (navigator.language || '').split('-')[0].toLowerCase();
    if (code && LANGUAGES.some((l) => l.code === code)) {
      setLanguages((prev) => (prev.length ? prev : [code]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Схема валидации (zod) ---
  const schema = useMemo(
    () =>
      z
        .object({
          title: z.string().min(2, t('form.required')).max(100, t('form.titleTooLong')),
          description: z.string().max(5000, t('form.descriptionTooLong')),
          start_date: z.string().min(1, t('form.required')),
          start_time: z.string().min(1, t('form.required')),
          end_date: z.string(),
          end_time: z.string(),
          city: z.string().min(1, t('form.required')),
          category_id: z.string().min(1, t('form.required')),
          // Ссылка: пустая, полный URL или без протокола (t.me/x, example.com/y).
          // Отклоняется только явный мусор (пробелы внутри, нет точки-домена).
          website: z.string().refine(
            (v) =>
              v === '' ||
              /^(https?:\/\/)?[^\s]+\.[^\s]{2,}(\/\S*)?$/.test(v.trim()),
            { message: t('form.badUrl') },
          ),
        })
        .refine((v) => !v.start_date || !v.end_date || v.end_date >= v.start_date, {
          message: t('form.badDate'),
          path: ['end_date'],
        })
        // Длительность не больше 3 дней (end_date - start_date <= 3),
        // даты без времени, разница в календарных днях (1-е по 4-е — ок, по 5-е — нет)
        .refine((v) => {
          if (!v.start_date || !v.end_date) return true;
          const days =
            (Date.parse(v.end_date + 'T00:00:00Z') - Date.parse(v.start_date + 'T00:00:00Z')) /
            86_400_000;
          return days <= 3;
        }, {
          message: t('form.dateTooLong'),
          path: ['end_date'],
        }),
    [t],
  );

  /** Геокодинг по адресу (при вводе адреса) */
  async function onAddressBlur() {
    if (!address.trim()) return;
    setGeocoding(true);
    const coords = await geocodeAddress(address);
    setGeocoding(false);
    if (coords) {
      setLat(coords.lat);
      setLng(coords.lng);
      setMarkerTouched(true);
    }
  }

  /** Тычок по карте: маркер + автозаполнение адреса и города */
  async function onMapClick(newLat: number, newLng: number) {
    setLat(newLat);
    setLng(newLng);
    setMarkerTouched(true);
    clearErr('map');
    setGeocoding(true);
    const place = await reverseGeocode(newLat, newLng);
    setGeocoding(false);
    if (place) {
      setAddress(place.address);
      setCity((c) => c || normalizeCity(place.city));
    }
  }

  /** Общая загрузка фото: файлы из диалога или из буфера обмена.
      Проверки: размер ≤ 10 МБ (после сжатия файл станет маленьким, а отказ
      на фото 6–8 МБ с телефона нелогичен), формат JPG/PNG/WebP, дедуп по
      содержимому ОРИГИНАЛА (сжатие не ломает дедуп). Фото сжимается на
      клиенте (imageCompress) — лимит storage 1 ГБ и трафик 5 ГБ/мес. */
  async function addFiles(files: File[]) {
    if (!files.length) return;
    setPhotoError('');
    const errs = new Set<string>();
    const seen = new Set(photoKeys);
    let added = 0;
    for (const f of files) {
      if (photos.length + added >= 5) break;
      if (f.size > 10 * 1024 * 1024) {
        errs.add(t('form.photoTooBig'));
        continue;
      }
      if (!/^image\/(jpeg|png|webp)$/i.test(f.type)) {
        errs.add(t('form.photoType'));
        continue;
      }
      const key = await fileKey(f);
      if (seen.has(key)) continue; // тот же файл — пропускаем
      seen.add(key);
      setUploading(true);
      try {
        const compressed = await compressImage(f);
        const path = await getApi().uploadPhoto(compressed);
        setPhotos((p) => [...p, path]);
        setPhotoKeys((prev) => {
          const n = new Set(prev);
          n.add(key);
          return n;
        });
        added += 1;
      } catch {
        errs.add(t('form.error'));
      }
    }
    setUploading(false);
    if (errs.size) setPhotoError([...errs].join(' '));
  }

  /** Выбор файлов диалогом */
  async function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length) await addFiles(files);
  }

  /** Вставка изображения из буфера обмена (Ctrl+V / долгое нажатие) */
  function onFormPaste(e: React.ClipboardEvent) {
    const items = Array.from(e.clipboardData?.items ?? []);
    const files = items
      .filter((i) => i.kind === 'file' && i.type.startsWith('image/'))
      .map((i) => i.getAsFile())
      .filter((f): f is File => !!f);
    if (!files.length) return;
    e.preventDefault();
    void addFiles(files);
  }

  /** Добавить свой язык из поля ввода */
  function addCustomLang() {
    const v = customLang.trim();
    if (!v) return;
    setLanguages((prev) => (prev.includes(v) ? prev : [...prev, v]));
    setCustomLang('');
  }

  /** Есть ли введённые данные (для подтверждения закрытия формы) */
  function hasData(): boolean {
    return (
      title.trim() !== '' ||
      description.trim() !== '' ||
      startDate !== '' ||
      startTime !== '' ||
      endDate !== '' ||
      endTime !== '' ||
      city.trim() !== '' ||
      address.trim() !== '' ||
      categoryId !== '' ||
      website.trim() !== '' ||
      photos.length > 0 ||
      languages.length > 0 ||
      price !== '' ||
      free ||
      donation ||
      priceUnknown ||
      contact.trim() !== '' ||
      contactTg.trim() !== '' ||
      contactWa.trim() !== '' ||
      contactEmailVal.trim() !== '' ||
      contactPhoneVal.trim() !== '' ||
      contactIg.trim() !== '' ||
      customLang.trim() !== ''
    );
  }

  /** Закрытие формы: при заполненных полях — подтверждение */
  function requestClose() {
    if (hasData() && !window.confirm(t('form.unsavedConfirm'))) return;
    onClose();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const res = schema.safeParse({
      title,
      description,
      start_date: startDate,
      start_time: startTime,
      end_date: endDate,
      end_time: endTime,
      city: city.trim(),
      category_id: categoryId,
      website,
    });
    if (!res.success) {
      const er: Record<string, string> = {};
      for (const issue of res.error.issues) er[String(issue.path[0])] = issue.message;
      // Общее сообщение над кнопкой: не заполнены обязательные поля
      er.form = t('form.requiredFields');
      setErrors(er);
      return;
    }
    // Валидация схемы прошла — убираем общее сообщение «заполните поля»
    setErrors((prev) => {
      const n = { ...prev };
      delete n.form;
      return n;
    });
    // Новое событие без отметки на карте — координаты по умолчанию (море/0,0)
    if (!editEvent && !markerTouched) {
      setErrors({ map: t('form.markOnMap') });
      return;
    }
    setSubmitting(true);
    try {
      const lang = detectLang(title);
      const priceVal = free ? 0 : parseFloat(price) || null;
      // Город: нормализация — trim + первая буква заглавная
      const cityNorm = normalizeCity(city);

      // Валидация времени: конец не раньше начала — только когда оба заполнены
      if (endDate && (endDate < startDate || (endDate === startDate && endTime && endTime < startTime))) {
        setErrors({ end_date: t('form.timeOrder'), end_time: t('form.timeOrder') });
        setSubmitting(false);
        return;
      }
      // Начало не в прошлом (для нового события или повтора)
      if (!editEvent) {
        const today = todayIso();
        if (startDate && startDate < today) {
          setErrors({ start_date: t('form.timePast') });
          setSubmitting(false);
          return;
        }
        if (startDate === today) {
          // Пустое время считается 00:00 — для сегодняшней даты это уже прошлое
          const startAt = new Date(`${startDate}T${startTime || '00:00'}`);
          if (isNaN(startAt.getTime()) || startAt.getTime() < Date.now() - 60 * 1000) {
            setErrors({ start_time: t('form.timePast') });
            setSubmitting(false);
            return;
          }
        }
      }

      // Валидация контактов: общие правила (как в регистрации и профиле)
      const cErr = contactErrors({
        telegram: contactTg,
        whatsapp: contactWa,
        email: contactEmailVal,
        phone: contactPhoneVal,
        instagram: contactIg,
      });
      if (Object.keys(cErr).length > 0) {
        const er: Record<string, string> = {};
        if (cErr.telegram) er.contact_telegram = t(`form.${cErr.telegram}`);
        if (cErr.whatsapp) er.contact_whatsapp = t(`form.${cErr.whatsapp}`);
        if (cErr.email) er.contact_email = t(`form.${cErr.email}`);
        if (cErr.phone) er.contact_phone = t(`form.${cErr.phone}`);
        if (cErr.instagram) er.contact_instagram = t(`form.${cErr.instagram}`);
        setErrors(er);
        setSubmitting(false);
        return;
      }

      // Валидация повтора: «по дням недели» требует хотя бы один день
      if (repeatMode === 'weekly' && repeatDays.length === 0) {
        setErrors({ repeatDays: t('form.repeatDaysRequired') });
        setSubmitting(false);
        return;
      }

      // Нормализация ссылки: без протокола -> добавляем https://
      const websiteNorm = website.trim()
        ? website.trim().startsWith('http://') || website.trim().startsWith('https://')
          ? website.trim()
          : `https://${website.trim()}`
        : '';

      // Правило повтора (в БД — jsonb events.recurrence)
      const recurrence: Recurrence | null =
        repeatMode === 'once'
          ? null
          : repeatMode === 'daily'
            ? { freq: 'daily' }
            : { freq: 'weekly', days: repeatDays };

      const common = {
        title,
        description,
        source_lang: lang,
        start_date: startDate,
        end_date: endDate || undefined,
        start_time: startTime || undefined,
        end_time: endTime || undefined,
        city: cityNorm,
        country: detectCountry(cityNorm) || undefined,
        address,
        lat,
        lng,
        category_id: categoryId,
        languages: languages.length ? languages : undefined,
        language: languages[0] || language || undefined,
        website: websiteNorm || undefined,
        photos,
        price: priceVal,
        donation,
        currency: priceVal == null ? null : currency,
        recurrence,
      };
      const normC = normalizeContacts({
        telegram: contactTg,
        whatsapp: contactWa,
        email: contactEmailVal,
        phone: contactPhoneVal,
        instagram: contactIg,
      });
      if (editEvent) {
        // Редактирование: админ — без изменения статуса, организатор — на модерацию
        const upd: Record<string, unknown> = {
          ...common,
          contact_telegram: normC.telegram || undefined,
          contact_whatsapp: normC.whatsapp || undefined,
          contact_email: normC.email || undefined,
          contact_phone: normC.phone || undefined,
          contact_instagram: normC.instagram || undefined,
        };
        if (user?.role === 'org') upd.status = 'moderation';
        await getApi().updateEvent(editEvent.id, upd);
        // Перевод на второй язык — только если текст изменился
        if (title !== editEvent.title || description !== editEvent.description) {
          void translateInBackground(editEvent.id, title, description, lang);
        }
      } else if (isOrg) {
        // Организатор: создаём/повторяем событие (на модерацию)
        const ev = await getApi().createOrgEvent({
          ...common,
          contact_telegram: normC.telegram || undefined,
          contact_whatsapp: normC.whatsapp || undefined,
          contact_email: normC.email || undefined,
          contact_phone: normC.phone || undefined,
          contact_instagram: normC.instagram || undefined,
        });
        void translateInBackground(ev.id, title, description, lang);
      } else if (user?.role === 'admin') {
        // Администратор: публикуется сразу, без модерации
        const ev = await getApi().createEvent({
          ...common,
          contact_telegram: normC.telegram || undefined,
          contact_whatsapp: normC.whatsapp || undefined,
          contact_email: normC.email || undefined,
          contact_phone: normC.phone || undefined,
          contact_instagram: normC.instagram || undefined,
          status: 'active',
        });
        void translateInBackground(ev.id, title, description, lang);
      }
      setDone(true);
    } catch {
      setErrors({ form: t('form.error') });
    }
    setSubmitting(false);
  }

  if (done) {
    return createPortal(
      <div className="fixed inset-0 z-[2000] overflow-y-auto bg-black/40 p-4" style={{ zIndex: winZ }} onClick={onClose}>
        <div className="flex min-h-full items-center justify-center">
          <div className="w-full max-w-md rounded-xl bg-white p-6 text-center shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <p className="mb-4 text-gray-800">
              {isEdit ? t('form.saved') : isAdmin ? t('form.published') : t('form.success')}
            </p>
            <button
              onClick={onClose}
              className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
            >
              {t('common.close')}
            </button>
          </div>
        </div>
      </div>,
      document.body,
    );
  }

  // Гости и обычные пользователи не размещают события — только организаторы/админ
  if (!isEdit && !isOrg && !isAdmin) {
    return createPortal(
      <div className="fixed inset-0 z-[2000] overflow-y-auto bg-black/25 p-4" style={{ zIndex: winZ }} onClick={onClose}>
        <div className="flex min-h-full items-center justify-center">
          <div className="glass-strong mx-auto w-full max-w-md rounded-xl p-6 text-center shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <p className="mb-4 text-gray-800">{t('form.loginToPublish')}</p>
            <button
              onClick={onClose}
              className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
            >
              {t('common.close')}
            </button>
          </div>
        </div>
      </div>,
      document.body,
    );
  }

  const input = 'w-full rounded-md border border-gray-300 px-2.5 py-2 text-sm focus:border-gray-900 focus:outline-none';
  const err = (k: string) => (errors[k] ? <p className="mt-0.5 text-xs text-red-600">{errors[k]}</p> : null);

  return createPortal(
    <div className="fixed inset-0 z-[2000] overflow-y-auto bg-black/25 p-4" style={{ zIndex: winZ }} onClick={requestClose}>
      <div className="flex min-h-full items-center justify-center">
        <div
          className="glass-strong mx-auto my-6 w-full max-w-2xl rounded-xl p-6 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">
            {isEdit ? t('form.editTitle') : isRepeat ? t('myEvents.repeatTitle') : t('form.title')}
          </h2>
          <button onClick={requestClose} className="rounded p-1 text-gray-400 hover:bg-gray-100" aria-label="close">
            ✕
          </button>
        </div>
        <p className="mb-4 text-sm text-gray-500">
          {isEdit ? t('form.editHint') : isRepeat ? t('myEvents.repeatHint') : t('form.subtitle')}
        </p>

        <form onSubmit={submit} onPaste={onFormPaste} className="space-y-3">
          <div>
            <label className="mb-1 block text-sm text-gray-600">{t('form.name')} *</label>
            <input
              value={title}
              maxLength={100}
              onChange={(e) => {
                setTitle(e.target.value);
                clearErr('title');
              }}
              placeholder={t('form.namePlaceholder')}
              className={input}
            />
            {err('title')}
            <p className="mt-0.5 text-right text-xs text-gray-400">{title.length}/100</p>
          </div>

          <div>
            <label className="mb-1 block text-sm text-gray-600">{t('form.description')}</label>
            <textarea
              value={description}
              maxLength={5000}
              onChange={(e) => {
                setDescription(e.target.value);
                clearErr('description');
              }}
              placeholder={t('form.descriptionPlaceholder')}
              rows={3}
              className={input}
            />
            {err('description')}
            <p className="mt-0.5 text-right text-xs text-gray-400">{description.length}/5000</p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm text-gray-600">{t('form.startDate')}</label>
              <DateField
                value={startDate}
                min={!editEvent ? todayIso() : undefined}
                required
                onChange={(v) => {
                  setStartDate(v);
                  clearErr('start_date');
                }}
              />
              {err('start_date')}
            </div>
            <div>
              <label className="mb-1 block text-sm text-gray-600">{t('form.startTime')}</label>
              <input
                type="time"
                required
                value={startTime}
                onChange={(e) => {
                  setStartTime(e.target.value);
                  clearErr('start_time');
                }}
                className={input}
              />
              {err('start_time')}
            </div>
            <div>
              <label className="mb-1 block text-sm text-gray-600">
                {t('form.endDate')}{' '}
                <span className="text-xs font-normal text-gray-400">({t('form.optional')})</span>
              </label>
              <DateField
                value={endDate}
                min={startDate || undefined}
                onChange={(v) => {
                  setEndDate(v);
                  clearErr('end_date');
                }}
              />
              {err('end_date')}
            </div>
            <div>
              <label className="mb-1 block text-sm text-gray-600">
                {t('form.endTime')}{' '}
                <span className="text-xs font-normal text-gray-400">({t('form.optional')})</span>
              </label>
              <input
                type="time"
                value={endTime}
                min={endDate && endDate === startDate ? startTime : undefined}
                onChange={(e) => {
                  setEndTime(e.target.value);
                  clearErr('end_time');
                }}
                className={input}
              />
              {err('end_time')}
            </div>
          </div>

          {/* Повторение: разовое / каждый день / по дням недели */}
          <div className="mb-4">
            <label className="mb-1 block text-sm text-gray-600">{t('form.repeat')}</label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setRepeatMode('once');
                  clearErr('repeatDays');
                }}
                className={`rounded-md px-3 py-1.5 text-sm ${
                  repeatMode === 'once'
                    ? 'bg-gray-900 text-white'
                    : 'border border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                {t('form.repeatOnce')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setRepeatMode('daily');
                  clearErr('repeatDays');
                }}
                className={`rounded-md px-3 py-1.5 text-sm ${
                  repeatMode === 'daily'
                    ? 'bg-gray-900 text-white'
                    : 'border border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                {t('form.repeatDaily')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setRepeatMode('weekly');
                  clearErr('repeatDays');
                }}
                className={`rounded-md px-3 py-1.5 text-sm ${
                  repeatMode === 'weekly'
                    ? 'bg-gray-900 text-white'
                    : 'border border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                {t('form.repeatWeekly')}
              </button>
            </div>
            {repeatMode === 'weekly' && (
              <div className="mt-2">
                <div className="flex flex-wrap gap-1.5">
                  {(t('weekdaysShort', { returnObjects: true }) as string[]).map((name, i) => {
                    const day = i + 1;
                    const active = repeatDays.includes(day);
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() =>
                          setRepeatDays((prev) =>
                            active ? prev.filter((d) => d !== day) : [...prev, day].sort((a, b) => a - b),
                          )
                        }
                        className={`rounded-md px-2.5 py-1.5 text-sm ${
                          active
                            ? 'bg-emerald-600 text-white'
                            : 'border border-gray-300 text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        {name}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-1 text-xs text-gray-400">{t('form.repeatStartHint')}</p>
                {err('repeatDays')}
              </div>
            )}
          </div>

          {/* Карта: отметка = точка события */}
          <div>
            <label className="mb-1 block text-sm text-gray-600">{t('form.mapHint')}</label>
            <div className="h-96 overflow-hidden rounded-lg border border-gray-200">
              <MiniMap lat={lat} lng={lng} onMove={onMapClick} />
            </div>
            {err('map')}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm text-gray-600">{t('form.city')} *</label>
              <input
                value={city}
                onChange={(e) => {
                  setCity(e.target.value);
                  clearErr('city');
                }}
                placeholder={t('form.cityPlaceholder')}
                className={input}
              />
              {err('city')}
            </div>
            <div>
              <label className="mb-1 block text-sm text-gray-600">{t('form.address')}</label>
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                onBlur={onAddressBlur}
                placeholder={t('form.addressPlaceholder')}
                className={input}
              />
              {geocoding && <p className="mt-0.5 text-xs text-gray-400">{t('common.loading')}</p>}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm text-gray-600">{t('form.category')} *</label>
            <select
              value={categoryId}
              onChange={(e) => {
                setCategoryId(e.target.value);
                clearErr('category_id');
              }}
              className={input}
            >
              <option value="">{t('form.selectCategory')}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.emoji} {c.name_ru}
                </option>
              ))}
            </select>
            {err('category_id')}
          </div>

          {/* Язык мероприятия: чипы + свой язык; «Не имеет значения» очищает выбор */}
          <div>
            <label className="mb-1 block text-sm text-gray-600">{t('form.language')}</label>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setLanguages([])}
                className={
                  languages.length === 0
                    ? 'rounded-full bg-gray-900 px-2.5 py-1 text-xs font-medium text-white'
                    : 'rounded-full border border-gray-300 px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-50'
                }
              >
                {t('form.languageAny')}
              </button>
              {LANGUAGES.map((l) => {
                const active = languages.includes(l.code);
                return (
                  <button
                    key={l.code}
                    type="button"
                    onClick={() =>
                      setLanguages((prev) => (active ? prev.filter((c) => c !== l.code) : [...prev, l.code]))
                    }
                    className={
                      active
                        ? 'rounded-full bg-gray-900 px-2.5 py-1 text-xs font-medium text-white'
                        : 'rounded-full border border-gray-300 px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-50'
                    }
                  >
                    {lang === 'ru' ? l.name_ru : l.name_en}
                  </button>
                );
              })}
            </div>
            <div className="relative mt-2 max-w-xs">
              <input
                list="event-lang-options"
                value={customLang}
                onChange={(e) => setCustomLang(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addCustomLang();
                  }
                }}
                onBlur={addCustomLang}
                placeholder={t('form.languageCustomPlaceholder')}
                className={input}
              />
              <datalist id="event-lang-options">
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {lang === 'ru' ? l.name_ru : l.name_en}
                  </option>
                ))}
                {languages.map((c) => (
                  <option key={`c-${c}`} value={c} />
                ))}
              </datalist>
            </div>
          </div>

          {/* Цена и валюта */}
          <div>
            <label className="mb-1 block text-sm text-gray-600">{t('form.price')}</label>
            <label className="mb-2 flex items-center gap-1.5 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={free}
                onChange={(e) => {
                  setFree(e.target.checked);
                  if (e.target.checked) {
                    setDonation(false);
                    setPriceUnknown(false);
                  }
                }}
                className="h-4 w-4"
              />
              {t('form.free')}
            </label>
            <label className="mb-2 flex items-center gap-1.5 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={donation}
                onChange={(e) => {
                  setDonation(e.target.checked);
                  if (e.target.checked) {
                    setFree(false);
                    setPriceUnknown(false);
                  }
                }}
                className="h-4 w-4"
              />
              {t('form.donation')}
            </label>
            <label className="mb-2 flex items-center gap-1.5 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={priceUnknown}
                onChange={(e) => {
                  setPriceUnknown(e.target.checked);
                  if (e.target.checked) {
                    setFree(false);
                    setDonation(false);
                  }
                }}
                className="h-4 w-4"
              />
              {t('form.priceUnknown')}
            </label>
            {!free && !donation && !priceUnknown && (
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder={t('form.pricePlaceholder')}
                  className={input}
                />
                <select value={currency} onChange={(e) => setCurrency(e.target.value)} className={input}>
                  {Object.entries(t('form.currencies', { returnObjects: true }) as Record<string, string>).map(
                    ([code, label]) => (
                      <option key={code} value={code}>
                        {label}
                      </option>
                    ),
                  )}
                </select>
              </div>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm text-gray-600">{t('form.website')}</label>
            <input
              value={website}
              onChange={(e) => {
                setWebsite(e.target.value);
                clearErr('website');
              }}
              placeholder={t('form.websitePlaceholder')}
              className={input}
            />
            {err('website')}
          </div>

          {/* Контакты: поля ввода с иконками (организатор и админ), для гостя — одно поле */}
          {isOrg || isAdmin ? (
            <div>
              <label className="mb-1 block text-sm text-gray-600">{t('form.contactsChoice')}</label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <IconInput icon={IconTelegram} value={contactTg} onChange={(v) => { setContactTg(v); clearErr('contact_telegram'); }} placeholder={t('form.contactTelegramField')} />
                <IconInput icon={IconWhatsapp} value={contactWa} onChange={(v) => { setContactWa(v); clearErr('contact_whatsapp'); }} placeholder={t('form.contactWhatsappField')} />
                <IconInput icon={IconEmail} type="email" value={contactEmailVal} onChange={(v) => { setContactEmailVal(v); clearErr('contact_email'); }} placeholder={t('form.contactEmailField')} />
                <IconInput icon={IconPhone} value={contactPhoneVal} onChange={(v) => { setContactPhoneVal(v); clearErr('contact_phone'); }} placeholder={t('form.contactPhoneField')} />
                <IconInput icon={IconInstagram} value={contactIg} onChange={(v) => { setContactIg(v); clearErr('contact_instagram'); }} placeholder={t('form.contactInstagramField')} />
              </div>
              {err('contact_telegram')}
              {err('contact_whatsapp')}
              {err('contact_email')}
              {err('contact_phone')}
              {err('contact_instagram')}
              <p className="mt-1 text-xs text-gray-400">{t('form.contactsFallback')}</p>
            </div>
          ) : (
            <div>
              <label className="mb-1 block text-sm text-gray-600">{t('form.contact')}</label>
              <input value={contact} onChange={(e) => setContact(e.target.value)} placeholder={t('form.contactPlaceholder')} className={input} />
            </div>
          )}

          {/* Фото: загрузка файлами */}
          <div>
            <label className="mb-1 block text-sm text-gray-600">{t('form.photosUpload')}</label>
            <div className="flex flex-wrap gap-2">
              {photos.map((p) => (
                <div key={p} className="relative">
                  {brokenPhotos.has(p) ? (
                    <div className="flex h-16 w-16 items-center justify-center rounded-md bg-gray-100 text-gray-400">
                      <span className="text-lg leading-none">📷</span>
                    </div>
                  ) : (
                    <img
                      src={fullUrl(p)}
                      alt=""
                      className="h-16 w-16 rounded-md object-cover"
                      onError={() =>
                        setBrokenPhotos((prev) => {
                          if (prev.has(p)) return prev;
                          const next = new Set(prev);
                          next.add(p);
                          return next;
                        })
                      }
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => setPhotos((arr) => arr.filter((x) => x !== p))}
                    className="absolute -right-1.5 -top-1.5 rounded-full bg-gray-900 p-0.5 text-xs text-white"
                  >
                    ✕
                  </button>
                </div>
              ))}
              {photos.length < 5 && (
                <label className="flex h-16 w-16 cursor-pointer items-center justify-center rounded-md border border-dashed border-gray-300 text-2xl text-gray-400 hover:bg-gray-50">
                  +
                  <input type="file" accept="image/*" multiple className="hidden" onChange={onFiles} />
                </label>
              )}
            </div>
            {uploading && <p className="mt-1 text-xs text-gray-400">{t('common.loading')}</p>}
            <p className="mt-1 text-xs text-gray-400">
              {t('form.pasteHint')} • {t('form.photosLimit')}
            </p>
            {photoError && <p className="mt-1 text-xs text-red-600">{photoError}</p>}
          </div>

          {errors.form && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{errors.form}</p>}

          <button
            type="submit"
            disabled={submitting || uploading}
            className="w-full rounded-md bg-gray-900 px-3 py-2.5 text-sm font-semibold text-white hover:bg-gray-700 disabled:opacity-50"
          >
            {submitting ? '...' : isEdit ? (isResubmit ? t('form.submit') : t('form.save')) : isAdmin ? t('form.publish') : t('form.submit')}
          </button>
        </form>
        </div>
      </div>
    </div>,
    document.body,
  );
}
