// Форма «Добавить мероприятие».
// - Точное время начала/окончания
// - Тычок по карте -> адрес и город заполняются автоматически
// - Организатор выбирает контакты для связи из своего профиля
// - Фото загружаются файлами (до 5, до 5 МБ)
// - После сохранения событие уходит на модерацию
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { z } from 'zod';
import type { Category, EventItem } from '../lib/types';
import { getApi, photoUrl } from '../lib/api';
import { geocodeAddress, reverseGeocode } from '../lib/geocode';
import { detectLang } from '../lib/translate';
import { config } from '../config';
import { useAuth } from '../lib/auth';

interface Props {
  categories: Category[];
  onClose: () => void;
  /** Событие для повторения/редактирования (данные подставляются в форму) */
  event?: EventItem;
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

export default function EventForm({ categories, onClose, event }: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isRepeat = !!event;

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
  // Координаты
  const [lat, setLat] = useState<number>(event?.lat ?? config.defaultCenter.lat);
  const [lng, setLng] = useState<number>(event?.lng ?? config.defaultCenter.lng);
  const [geocoding, setGeocoding] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const isOrg = user?.role === 'org';

  // Контакты организатора из профиля — предзаполняют поля формы
  useEffect(() => {
    if (isOrg) {
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
  }, [isOrg]);

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
        website: website || undefined,
        photos,
      };
      if (isOrg) {
        // Организатор: создаём/повторяем событие (на модерацию)
        await getApi().createOrgEvent({
          ...common,
          contact_telegram: contactTg.trim() || undefined,
          contact_whatsapp: contactWa.trim() || undefined,
          contact_email: contactEmailVal.trim() || undefined,
          contact_phone: contactPhoneVal.trim() || undefined,
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
      <div className="fixed inset-0 z-[2000] overflow-y-auto bg-black/40 p-4" onClick={onClose}>
        <div className="flex min-h-full items-center justify-center">
          <div className="w-full max-w-md rounded-xl bg-white p-6 text-center shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <p className="mb-4 text-gray-800">{t('form.success')}</p>
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
    <div className="fixed inset-0 z-[2000] overflow-y-auto bg-black/40 p-4" onClick={onClose}>
      <div className="flex min-h-full items-center justify-center">
        <div
          className="glass mx-auto my-6 w-full max-w-2xl rounded-xl p-6 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">
            {isRepeat ? t('myEvents.repeatTitle') : t('form.title')}
          </h2>
          <button onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-gray-100" aria-label="close">
            ✕
          </button>
        </div>
        <p className="mb-4 text-sm text-gray-500">
          {isRepeat ? t('myEvents.repeatHint') : t('form.subtitle')}
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
            <div className="h-80 overflow-hidden rounded-lg border border-gray-200">
              <MapContainer
                center={[lat, lng]}
                zoom={6}
                className="h-full w-full"
                style={{ height: '100%', width: '100%' }}
              >
                <TileLayer attribution="" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
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

          <div>
            <label className="mb-1 block text-sm text-gray-600">{t('form.website')}</label>
            <input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder={t('form.websitePlaceholder')} className={input} />
            {err('website')}
          </div>

          {/* Контакты: поля ввода (организатор), для гостя — одно поле */}
          {isOrg ? (
            <div>
              <label className="mb-1 block text-sm text-gray-600">{t('form.contactsChoice')}</label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <input
                  value={contactTg}
                  onChange={(e) => setContactTg(e.target.value)}
                  placeholder={t('form.contactTelegramField')}
                  className={input}
                />
                <input
                  value={contactWa}
                  onChange={(e) => setContactWa(e.target.value)}
                  placeholder={t('form.contactWhatsappField')}
                  className={input}
                />
                <input
                  type="email"
                  value={contactEmailVal}
                  onChange={(e) => setContactEmailVal(e.target.value)}
                  placeholder={t('form.contactEmailField')}
                  className={input}
                />
                <input
                  value={contactPhoneVal}
                  onChange={(e) => setContactPhoneVal(e.target.value)}
                  placeholder={t('form.contactPhoneField')}
                  className={input}
                />
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
            {submitting ? '...' : t('form.submit')}
          </button>
        </form>
        </div>
      </div>
    </div>,
    document.body,
  );
}
