// Форма «Добавить мероприятие».
// - Точное время начала/окончания
// - Тычок по карте -> адрес и город заполняются автоматически
// - Организатор выбирает контакты для связи из своего профиля
// - Фото загружаются файлами (до 5, до 5 МБ)
// - После сохранения событие уходит на модерацию
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { nextZ } from '../lib/zindex';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { z } from 'zod';
import type { Category, EventItem } from '../lib/types';
import { getApi, photoUrl } from '../lib/api';
import { geocodeAddress, reverseGeocode } from '../lib/geocode';
import { detectLang } from '../lib/translate';
import { LANGUAGES } from '../lib/languages';
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

/** Иконка маркера на мини-карте формы */
const formIcon = L.divIcon({
  html: `<div class="event-marker" style="background:#111827">📍</div>`,
  className: 'event-marker-wrap',
  iconSize: [34, 34],
  iconAnchor: [17, 34],
});

/** Клик по мини-карте передвигает маркер и подставляет адрес */
function ClickToMove({ onMove }: { onMove: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onMove(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
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

export default function EventForm({ categories, onClose, event: eventProp, editEvent }: Props) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.startsWith('ru') ? 'ru' : 'en';
  const { user } = useAuth();
  const winZ = useRef(nextZ()).current;
  // Редактирование (админ) или повтор — данные в форме одни и те же
  const event = editEvent ?? eventProp;
  const isRepeat = !!event;
  const isEdit = !!editEvent;

  // --- Состояние формы (при повторе — данные из события) ---
  const [title, setTitle] = useState(event?.title ?? '');
  const [description, setDescription] = useState(event?.description ?? '');
  const [startDate, setStartDate] = useState(event?.start_date ?? '');
  const [endDate, setEndDate] = useState(event?.end_date ?? '');
  const [startTime, setStartTime] = useState(event?.start_time ?? '');
  const [endTime, setEndTime] = useState(event?.end_time ?? '');
  const [city, setCity] = useState(event?.city ?? '');
  const [address, setAddress] = useState(event?.address ?? '');
  const [categoryId, setCategoryId] = useState(event?.category_id ?? '');
  const [language, setLanguage] = useState(event?.language ?? '');
  const [website, setWebsite] = useState(event?.website ?? '');
  // Контакты: поля ввода (для организатора предзаполняются из профиля)
  const [contact, setContact] = useState(event?.contact ?? '');
  const [contactTg, setContactTg] = useState(event?.contact_telegram ?? '');
  const [contactWa, setContactWa] = useState(event?.contact_whatsapp ?? '');
  const [contactEmailVal, setContactEmailVal] = useState(event?.contact_email ?? '');
  const [contactPhoneVal, setContactPhoneVal] = useState(event?.contact_phone ?? '');
  // Фото: пути загруженных файлов
  const [photos, setPhotos] = useState<string[]>(event?.photos ?? []);
  const [uploading, setUploading] = useState(false);
  // Цена и валюта (null = бесплатно)
  const [free, setFree] = useState(event ? event.price == null : false);
  const [price, setPrice] = useState(event?.price != null ? String(event.price) : '');
  const [currency, setCurrency] = useState(event?.currency ?? 'usd');
  // Координаты
  const [lat, setLat] = useState<number>(event?.lat ?? config.defaultCenter.lat);
  const [lng, setLng] = useState<number>(event?.lng ?? config.defaultCenter.lng);
  const [geocoding, setGeocoding] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const isOrg = user?.role === 'org';
  const isAdmin = user?.role === 'admin';

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
          }
        })
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOrg, isAdmin]);

  // --- Схема валидации (zod) ---
  const schema = useMemo(
    () =>
      z
        .object({
          title: z.string().min(2, t('form.required')),
          start_date: z.string().min(1, t('form.required')),
          start_time: z.string().min(1, t('form.required')),
          end_date: z.string().min(1, t('form.required')),
          end_time: z.string().min(1, t('form.required')),
          city: z.string().min(1, t('form.required')),
          category_id: z.string().min(1, t('form.required')),
          website: z.union([z.literal(''), z.string().url(t('form.badUrl'))]),
        })
        .refine((v) => !v.start_date || !v.end_date || v.end_date >= v.start_date, {
          message: t('form.badDate'),
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
    }
  }

  /** Тычок по карте: маркер + автозаполнение адреса и города */
  async function onMapClick(newLat: number, newLng: number) {
    setLat(newLat);
    setLng(newLng);
    setGeocoding(true);
    const place = await reverseGeocode(newLat, newLng);
    setGeocoding(false);
    if (place) {
      setAddress(place.address);
      setCity((c) => c || place.city);
    }
  }

  /** Загрузка фото файлами */
  async function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    const canAdd = 5 - photos.length;
    if (canAdd <= 0) return;
    setUploading(true);
    try {
      for (const f of files.slice(0, canAdd)) {
        if (f.size > 5 * 1024 * 1024) continue; // до 5 МБ
        const path = await getApi().uploadPhoto(f);
        setPhotos((p) => [...p, path]);
      }
    } catch {
      // ошибка загрузки — просто пропускаем файл
    }
    setUploading(false);
    e.target.value = '';
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const res = schema.safeParse({
      title,
      start_date: startDate,
      start_time: startTime,
      end_date: endDate,
      end_time: endTime,
      city,
      category_id: categoryId,
      website,
    });
    if (!res.success) {
      const er: Record<string, string> = {};
      for (const issue of res.error.issues) er[String(issue.path[0])] = issue.message;
      setErrors(er);
      return;
    }
    setSubmitting(true);
    try {
      const lang = detectLang(title);
      const priceVal = free ? null : parseFloat(price) || null;
      const common = {
        title,
        description,
        source_lang: lang,
        start_date: startDate,
        end_date: endDate || undefined,
        start_time: startTime || undefined,
        end_time: endTime || undefined,
        city,
        address,
        lat,
        lng,
        category_id: categoryId,
        language: language || undefined,
        website: website || undefined,
        photos,
        price: priceVal,
        currency: priceVal == null ? null : currency,
      };
      if (editEvent) {
        // Админ редактирует событие (на модерации или опубликованное)
        await getApi().updateEvent(editEvent.id, {
          ...common,
          contact_telegram: contactTg.trim() || undefined,
          contact_whatsapp: contactWa.trim() || undefined,
          contact_email: contactEmailVal.trim() || undefined,
          contact_phone: contactPhoneVal.trim() || undefined,
        });
      } else if (isOrg) {
        // Организатор: создаём/повторяем событие (на модерацию)
        await getApi().createOrgEvent({
          ...common,
          contact_telegram: contactTg.trim() || undefined,
          contact_whatsapp: contactWa.trim() || undefined,
          contact_email: contactEmailVal.trim() || undefined,
          contact_phone: contactPhoneVal.trim() || undefined,
        });
      } else if (user?.role === 'admin') {
        // Администратор: публикуется сразу, без модерации
        await getApi().createEvent({
          ...common,
          contact_telegram: contactTg.trim() || undefined,
          contact_whatsapp: contactWa.trim() || undefined,
          contact_email: contactEmailVal.trim() || undefined,
          contact_phone: contactPhoneVal.trim() || undefined,
          status: 'active',
        });
      } else {
        // Гость: заявка с контактом
        await getApi().submitApplication({ ...common, contact });
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

  const input = 'w-full rounded-md border border-gray-300 px-2.5 py-2 text-sm focus:border-gray-900 focus:outline-none';
  const err = (k: string) => (errors[k] ? <p className="mt-0.5 text-xs text-red-600">{errors[k]}</p> : null);

  return createPortal(
    <div className="fixed inset-0 z-[2000] overflow-y-auto bg-black/25 p-4" style={{ zIndex: winZ }} onClick={onClose}>
      <div className="flex min-h-full items-center justify-center">
        <div
          className="glass-strong mx-auto my-6 w-full max-w-2xl rounded-xl p-6 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">
            {isEdit ? t('form.editTitle') : isRepeat ? t('myEvents.repeatTitle') : t('form.title')}
          </h2>
          <button onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-gray-100" aria-label="close">
            ✕
          </button>
        </div>
        <p className="mb-4 text-sm text-gray-500">
          {isEdit ? t('form.editHint') : isRepeat ? t('myEvents.repeatHint') : t('form.subtitle')}
        </p>

        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="mb-1 block text-sm text-gray-600">{t('form.name')} *</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('form.namePlaceholder')} className={input} />
            {err('title')}
          </div>

          <div>
            <label className="mb-1 block text-sm text-gray-600">{t('form.description')}</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('form.descriptionPlaceholder')}
              rows={3}
              className={input}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm text-gray-600">{t('form.startDate')}</label>
              <input type="date" required value={startDate} onChange={(e) => setStartDate(e.target.value)} className={input} />
              {err('start_date')}
            </div>
            <div>
              <label className="mb-1 block text-sm text-gray-600">{t('form.startTime')}</label>
              <input type="time" required value={startTime} onChange={(e) => setStartTime(e.target.value)} className={input} />
              {err('start_time')}
            </div>
            <div>
              <label className="mb-1 block text-sm text-gray-600">{t('form.endDate')}</label>
              <input type="date" required value={endDate} onChange={(e) => setEndDate(e.target.value)} className={input} />
              {err('end_date')}
            </div>
            <div>
              <label className="mb-1 block text-sm text-gray-600">{t('form.endTime')}</label>
              <input type="time" required value={endTime} onChange={(e) => setEndTime(e.target.value)} className={input} />
              {err('end_time')}
            </div>
          </div>

          {/* Карта: отметка = точка события */}
          <div>
            <label className="mb-1 block text-sm text-gray-600">{t('form.mapHint')}</label>
            <div className="h-96 overflow-hidden rounded-lg border border-gray-200">
              <MapContainer
                center={[lat, lng]}
                zoom={6}
                className="h-full w-full"
                style={{ height: '100%', width: '100%' }}
              >
                <TileLayer
                  attribution="&copy; OpenStreetMap &copy; CARTO"
                  url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
                />
                <Marker position={[lat, lng]} icon={formIcon} />
                <ClickToMove onMove={onMapClick} />
              </MapContainer>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm text-gray-600">{t('form.city')} *</label>
              <input value={city} onChange={(e) => setCity(e.target.value)} placeholder={t('form.cityPlaceholder')} className={input} />
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
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={input}>
              <option value="">{t('form.selectCategory')}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.emoji} {c.name_ru}
                </option>
              ))}
            </select>
            {err('category_id')}
          </div>

          {/* Язык мероприятия */}
          <div>
            <label className="mb-1 block text-sm text-gray-600">{t('form.language')}</label>
            <select value={language} onChange={(e) => setLanguage(e.target.value)} className={input}>
              <option value="">{t('form.selectLanguage')}</option>
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {lang === 'ru' ? l.name_ru : l.name_en}
                </option>
              ))}
            </select>
          </div>

          {/* Цена и валюта */}
          <div>
            <label className="mb-1 block text-sm text-gray-600">{t('form.price')}</label>
            <label className="mb-2 flex items-center gap-1.5 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={free}
                onChange={(e) => setFree(e.target.checked)}
                className="h-4 w-4"
              />
              {t('form.free')}
            </label>
            {!free && (
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
            <input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder={t('form.websitePlaceholder')} className={input} />
            {err('website')}
          </div>

          {/* Контакты: поля ввода с иконками (организатор и админ), для гостя — одно поле */}
          {isOrg || isAdmin ? (
            <div>
              <label className="mb-1 block text-sm text-gray-600">{t('form.contactsChoice')}</label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <IconInput icon={IconTelegram} value={contactTg} onChange={setContactTg} placeholder={t('form.contactTelegramField')} />
                <IconInput icon={IconWhatsapp} value={contactWa} onChange={setContactWa} placeholder={t('form.contactWhatsappField')} />
                <IconInput icon={IconEmail} type="email" value={contactEmailVal} onChange={setContactEmailVal} placeholder={t('form.contactEmailField')} />
                <IconInput icon={IconPhone} value={contactPhoneVal} onChange={setContactPhoneVal} placeholder={t('form.contactPhoneField')} />
              </div>
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
                  <img src={photoUrl(p)} alt="" className="h-16 w-16 rounded-md object-cover" />
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
            <p className="mt-1 text-xs text-gray-400">{t('form.photosLimit')}</p>
          </div>

          {errors.form && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{errors.form}</p>}

          <button
            type="submit"
            disabled={submitting || uploading}
            className="w-full rounded-md bg-gray-900 px-3 py-2.5 text-sm font-semibold text-white hover:bg-gray-700 disabled:opacity-50"
          >
            {submitting ? '...' : isEdit ? t('form.save') : isAdmin ? t('form.publish') : t('form.submit')}
          </button>
        </form>
        </div>
      </div>
    </div>,
    document.body,
  );
}
