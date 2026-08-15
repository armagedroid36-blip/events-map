// Публичная форма «Разместить событие» — главный канал привлечения клиентов.
// Организатор заполняет данные на ЛЮБОМ языке; событие уходит на модерацию.
// Адрес автоматически превращается в координаты (Nominatim),
// маркер на мини-карте можно поправить вручную.
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { z } from 'zod';
import type { Category } from '../lib/types';
import { getApi } from '../lib/api';
import { geocodeAddress } from '../lib/geocode';
import { detectLang } from '../lib/translate';
import { config } from '../config';

interface Props {
  categories: Category[];
  onClose: () => void;
}

/** Иконка маркера на мини-карте формы */
const formIcon = L.divIcon({
  html: `<div class="event-marker" style="background:#111827">📍</div>`,
  className: 'event-marker-wrap',
  iconSize: [34, 34],
  iconAnchor: [17, 34],
});

/** Клик по мини-карте передвигает маркер */
function ClickToMove({ onMove }: { onMove: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onMove(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export default function EventForm({ categories, onClose }: Props) {
  const { t } = useTranslation();

  // --- Состояние формы ---
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [website, setWebsite] = useState('');
  const [contact, setContact] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  // Координаты: по умолчанию центр Юго-Восточной Азии
  const [lat, setLat] = useState<number>(config.defaultCenter.lat);
  const [lng, setLng] = useState<number>(config.defaultCenter.lng);
  const [geocoding, setGeocoding] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  // --- Схема валидации (zod), сообщения на языке интерфейса ---
  const schema = useMemo(
    () =>
      z
        .object({
          title: z.string().min(2, t('form.required')),
          start_date: z.string().min(1, t('form.required')),
          city: z.string().min(1, t('form.required')),
          category_id: z.string().min(1, t('form.required')),
          website: z.union([z.literal(''), z.string().url(t('form.badUrl'))]),
          photos: z.array(
            z.union([z.literal(''), z.string().url(t('form.badPhotoUrl'))]),
          ),
        })
        .refine(
          (v) => !v.start_date || !endDate || endDate >= v.start_date,
          { message: t('form.badDate'), path: ['end_date'] },
        ),
    [t, endDate],
  );

  /** Перевод адреса в координаты через OpenStreetMap Nominatim */
  async function handleGeocode() {
    if (!address.trim()) return;
    setGeocoding(true);
    const coords = await geocodeAddress(address);
    setGeocoding(false);
    if (coords) {
      setLat(coords.lat);
      setLng(coords.lng);
      setErrors((e) => ({ ...e, address: '' }));
    } else {
      setErrors((e) => ({ ...e, address: t('form.geocodeFail') }));
    }
  }

  /** Отправка формы: валидация -> сохранение -> экран успеха */
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = schema.safeParse({
      title,
      start_date: startDate,
      city,
      category_id: categoryId,
      website,
      photos,
    });
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const issue of parsed.error.issues) errs[issue.path[0] as string] = issue.message;
      setErrors(errs);
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      await getApi().submitApplication({
        title,
        description,
        source_lang: detectLang(title),
        start_date: startDate,
        end_date: endDate || undefined,
        city,
        address: address || undefined,
        lat,
        lng,
        category_id: categoryId,
        website: website || undefined,
        contact,
        photos: photos.filter((p) => p.trim()),
      });
      setDone(true);
    } catch {
      setErrors({ _form: t('form.error') });
    } finally {
      setSubmitting(false);
    }
  }

  // Экран успеха после отправки
  if (done) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <div className="w-full max-w-md rounded-xl bg-white p-6 text-center shadow-xl">
          <p className="mb-2 text-3xl">✅</p>
          <p className="text-sm text-gray-700">{t('form.success')}</p>
          <button
            onClick={onClose}
            className="mt-4 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
          >
            {t('common.close')}
          </button>
        </div>
      </div>
    );
  }

  const inputCls =
    'w-full rounded-md border border-gray-300 px-2.5 py-2 text-sm focus:border-gray-900 focus:outline-none';
  const errCls = 'mt-1 text-xs text-red-600';

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40">
      <div className="mx-auto my-6 w-full max-w-2xl rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{t('form.title')}</h2>
            <p className="mt-0.5 text-xs text-gray-500">{t('form.subtitle')}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label={t('common.close')}
          >
            ✕
          </button>
        </div>

        {errors._form && (
          <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{errors._form}</p>
        )}

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {/* Название — на любом языке */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              {t('form.name')} *
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('form.namePlaceholder')}
              className={inputCls}
            />
            {errors.title && <p className={errCls}>{errors.title}</p>}
          </div>

          {/* Описание */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              {t('form.description')}
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('form.descriptionPlaceholder')}
              rows={4}
              className={inputCls}
            />
          </div>

          {/* Даты */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                {t('form.startDate')} *
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className={inputCls}
              />
              {errors.start_date && <p className={errCls}>{errors.start_date}</p>}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                {t('form.endDate')}
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className={inputCls}
              />
              {errors.end_date && <p className={errCls}>{errors.end_date}</p>}
            </div>
          </div>

          {/* Город и адрес + геокодинг */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                {t('form.city')} *
              </label>
              <input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder={t('form.cityPlaceholder')}
                className={inputCls}
              />
              {errors.city && <p className={errCls}>{errors.city}</p>}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                {t('form.address')}
              </label>
              <div className="flex gap-2">
                <input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder={t('form.addressPlaceholder')}
                  className={inputCls}
                />
                <button
                  type="button"
                  onClick={handleGeocode}
                  disabled={geocoding}
                  className="shrink-0 rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  {geocoding ? '…' : '↗'}
                </button>
              </div>
              {errors.address && <p className={errCls}>{errors.address}</p>}
            </div>
          </div>
          <p className="text-xs text-gray-500">{t('form.addressHint')}</p>

          {/* Мини-карта для проверки/ручной корректировки маркера */}
          <div className="h-52 overflow-hidden rounded-lg border border-gray-200">
            <MapContainer
              center={[lat, lng]}
              zoom={10}
              className="h-full w-full"
              style={{ minHeight: 200 }}
            >
              <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" />
              <ClickToMove
                onMove={(la, ln) => {
                  setLat(la);
                  setLng(ln);
                }}
              />
              <Marker
                position={[lat, lng]}
                icon={formIcon}
                draggable
                eventHandlers={{
                  dragend: (e) => {
                    const p = (e.target as L.Marker).getLatLng();
                    setLat(p.lat);
                    setLng(p.lng);
                  },
                }}
              />
            </MapContainer>
          </div>

          {/* Категория */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              {t('form.category')} *
            </label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className={inputCls}
            >
              <option value="">{t('form.selectCategory')}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.emoji} {c.name_ru} / {c.name_en}
                </option>
              ))}
            </select>
            {errors.category_id && <p className={errCls}>{errors.category_id}</p>}
          </div>

          {/* Ссылки */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                {t('form.website')}
              </label>
              <input
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder={t('form.websitePlaceholder')}
                className={inputCls}
              />
              {errors.website && <p className={errCls}>{errors.website}</p>}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                {t('form.contact')}
              </label>
              <input
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder={t('form.contactPlaceholder')}
                className={inputCls}
              />
            </div>
          </div>

          {/* Фотографии: до 5 внешних ссылок */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              {t('form.photos')}
            </label>
            <div className="space-y-2">
              {photos.map((p, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    value={p}
                    onChange={(e) =>
                      setPhotos(photos.map((x, j) => (j === i ? e.target.value : x)))
                    }
                    placeholder={t('form.photoPlaceholder')}
                    className={inputCls}
                  />
                  <button
                    type="button"
                    onClick={() => setPhotos(photos.filter((_, j) => j !== i))}
                    className="shrink-0 rounded-md border border-gray-300 px-2 text-gray-500 hover:bg-gray-50"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            {errors.photos && <p className={errCls}>{errors.photos}</p>}
            {photos.length < 5 && (
              <button
                type="button"
                onClick={() => setPhotos([...photos, ''])}
                className="mt-2 rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
              >
                {t('form.addPhoto')}
              </button>
            )}
          </div>

          {/* Отправка */}
          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 rounded-md bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
            >
              {submitting ? t('common.loading') : t('form.submit')}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-gray-300 px-4 py-2.5 text-sm text-gray-600 hover:bg-gray-50"
            >
              {t('common.cancel')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
