// Вкладка «События»: список с поиском и пагинацией,
// добавление, редактирование, удаление с подтверждением.
// При сохранении название/описание автоматически переводятся на второй язык.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as maplibregl from 'maplibre-gl';
import { getApi } from '../../lib/api';
import { geocodeAddress } from '../../lib/geocode';
import { translateText, detectLang } from '../../lib/translate';
import { formatDate } from '../../lib/dates';
import { config } from '../../config';
import { mapStyle } from '../../lib/mapStyle';
import type { Category, EventItem } from '../../lib/types';

const PAGE_SIZE = 20;

/** Мини-карта админки: клик/перетаскивание ставят координаты события */
function EditMap({
  lat,
  lng,
  onChange,
}: {
  lat: number;
  lng: number;
  onChange: (lat: number, lng: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const lastKey = useRef('');

  // Инициализация — один раз
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const map = new maplibregl.Map({
      container: el,
      style: mapStyle,
      center: [lng, lat],
      zoom: 9,
      attributionControl: false,
    });
    map.addControl(
      new maplibregl.AttributionControl({ compact: true, customAttribution: config.mapAttribution }),
      'bottom-right',
    );
    // Чёрный круг 📍 (как был editIcon на Leaflet)
    const markerEl = document.createElement('div');
    markerEl.className = 'event-marker';
    markerEl.style.background = '#111827';
    markerEl.style.borderRadius = '9999px';
    markerEl.style.display = 'flex';
    markerEl.style.alignItems = 'center';
    markerEl.style.justifyContent = 'center';
    markerEl.style.width = '34px';
    markerEl.style.height = '34px';
    markerEl.style.cursor = 'move';
    markerEl.textContent = '📍';
    const marker = new maplibregl.Marker({ element: markerEl, anchor: 'bottom', draggable: true })
      .setLngLat([lng, lat])
      .addTo(map);
    // Перетаскивание
    marker.on('dragend', () => {
      const p = marker.getLngLat();
      onChangeRef.current(p.lat, p.lng);
    });
    // Клик по карте ставит маркер и координаты
    map.on('click', (e: maplibregl.MapMouseEvent) => onChangeRef.current(e.lngLat.lat, e.lngLat.lng));
    mapRef.current = map;
    markerRef.current = marker;
    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Внешнее изменение координат (геокодинг адреса) — маркер за точкой
  useEffect(() => {
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!map || !marker) return;
    const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
    if (key === lastKey.current) return;
    lastKey.current = key;
    marker.setLngLat([lng, lat]);
  }, [lat, lng]);

  return <div ref={containerRef} className="h-full w-full" />;
}

interface Props {
  version: number;
  onChanged: () => void;
}

/** Пустая заготовка нового события */
function emptyEvent(): Partial<EventItem> {
  return {
    title: '',
    description: '',
    source_lang: 'ru',
    start_date: '',
    city: '',
    address: '',
    lat: 10.2,
    lng: 108.5,
    category_id: '',
    website: '',
    contact: '',
    photos: [],
    status: 'active',
  };
}

export default function EventsTab({ version, onChanged }: Props) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.startsWith('ru') ? 'ru' : 'en';
  const [events, setEvents] = useState<EventItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<Partial<EventItem> | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState('');

  // Загрузка при открытии вкладки и после каждого изменения
  useEffect(() => {
    let alive = true;
    (async () => {
      const api = getApi();
      const [evs, cats] = await Promise.all([api.listAllEvents(), api.getCategories()]);
      if (!alive) return;
      setEvents(evs);
      setCategories(cats);
    })();
    return () => {
      alive = false;
    };
  }, [version]);

  // Поиск по названию и городу
  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return q
      ? events.filter((e) => `${e.title} ${e.city}`.toLowerCase().includes(q))
      : events;
  }, [events, query]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pages - 1);
  const pageItems = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  async function handleDelete(id: string) {
    await getApi().deleteEvent(id);
    setConfirmDeleteId(null);
    onChanged();
  }

  // --- Редактор события ---
  if (editing) {
    return (
      <EventEditor
        initial={editing}
        categories={categories}
        onCancel={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          setSavedMsg(t('admin.form.saved'));
          onChanged();
        }}
      />
    );
  }

  const statusLabel = (s: string) => t(`admin.events.status.${s}` as never);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold text-gray-900">{t('admin.events.title')}</h2>
        <div className="ml-auto flex gap-2">
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
            placeholder={t('admin.events.search')}
            className="w-64 rounded-md border border-gray-300 px-2.5 py-1.5 text-sm"
          />
          <button
            onClick={() => setEditing(emptyEvent())}
            className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-700"
          >
            + {t('admin.events.add')}
          </button>
        </div>
      </div>

      {savedMsg && <p className="mb-3 text-sm text-green-700">{savedMsg}</p>}

      {!filtered.length && (
        <p className="rounded-lg border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-500">
          {t('admin.events.empty')}
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-xs text-gray-500">
              <th className="px-3 py-2">#</th>
              <th className="px-3 py-2">{t('admin.events.search')?.split('…')[0] || 'Название'}</th>
              <th className="px-3 py-2">{t('filters.city')}</th>
              <th className="px-3 py-2">{t('filters.period')}</th>
              <th className="px-3 py-2">Статус</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {pageItems.map((ev) => {
              const cat = categories.find((c) => c.id === ev.category_id);
              return (
                <tr key={ev.id} className="border-b border-gray-100 last:border-0">
                  <td className="px-3 py-2 text-gray-400">{cat?.emoji ?? '📍'}</td>
                  <td className="max-w-[260px] truncate px-3 py-2 font-medium text-gray-900">
                    {ev.title}
                    {(ev.contact_telegram || ev.contact_whatsapp || ev.contact_email || ev.contact_phone || ev.contact_instagram || ev.contact) && (
                      <span className="block truncate text-xs font-normal text-gray-400">
                        {[ev.contact_telegram && `TG: ${ev.contact_telegram}`, ev.contact_whatsapp && `WA: ${ev.contact_whatsapp}`, ev.contact_email && ev.contact_email, ev.contact_phone && ev.contact_phone, ev.contact_instagram && `IG: ${ev.contact_instagram}`, ev.contact && `Site: ${ev.contact}`]
                          .filter(Boolean)
                          .join(' • ')}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-gray-600">{ev.city}</td>
                  <td className="px-3 py-2 text-gray-600">{formatDate(ev.start_date, lang)}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        ev.status === 'active'
                          ? 'bg-green-100 text-green-800'
                          : ev.status === 'past'
                            ? 'bg-gray-100 text-gray-600'
                            : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {statusLabel(ev.status)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <button
                      onClick={() => setEditing(ev)}
                      className="rounded px-2 py-1 text-xs text-gray-600 hover:bg-gray-100"
                    >
                      {t('admin.events.edit')}
                    </button>
                    {confirmDeleteId === ev.id ? (
                      <button
                        onClick={() => handleDelete(ev.id)}
                        className="rounded bg-red-700 px-2 py-1 text-xs font-medium text-white hover:bg-red-600"
                      >
                        {t('admin.events.deleteConfirm', { title: ev.title }).slice(0, 20)}…
                      </button>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteId(ev.id)}
                        className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                      >
                        {t('admin.events.delete')}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Пагинация */}
      {pages > 1 && (
        <div className="mt-3 flex items-center justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={safePage === 0}
            className="rounded-md border border-gray-300 px-3 py-1 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40"
          >
            ←
          </button>
          <span className="text-sm text-gray-500">
            {safePage + 1} / {pages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(pages - 1, p + 1))}
            disabled={safePage >= pages - 1}
            className="rounded-md border border-gray-300 px-3 py-1 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40"
          >
            →
          </button>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Редактор события (добавление и редактирование)
// ============================================================

interface EditorProps {
  initial: Partial<EventItem>;
  categories: Category[];
  onCancel: () => void;
  onSaved: () => void;
}

function EventEditor({ initial, categories, onCancel, onSaved }: EditorProps) {
  const { t } = useTranslation();
  const [form, setForm] = useState<Partial<EventItem>>({ ...initial, photos: initial.photos ?? [] });
  const [geocoding, setGeocoding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [photoInputs, setPhotoInputs] = useState<string[]>(form.photos ?? []);
  const isNew = !initial.id;

  const set = (k: keyof EventItem, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  /** Геокодинг адреса -> координаты */
  async function handleGeocode() {
    const addr = `${form.address ?? ''}, ${form.city ?? ''}`;
    if (!addr.trim()) return;
    setGeocoding(true);
    const coords = await geocodeAddress(addr);
    setGeocoding(false);
    if (coords) {
      set('lat', coords.lat);
      set('lng', coords.lng);
    }
  }

  /** Сохранение: валидация, перевод на второй язык, запись в базу */
  async function handleSave() {
    if (!form.title?.trim() || !form.start_date || !form.city) {
      setError(t('form.required'));
      return;
    }
    // Запрет длительности больше 3 дней (UI-защита, в БД ограничения нет)
    if (
      form.start_date &&
      form.end_date &&
      (Date.parse(form.end_date + 'T00:00:00Z') - Date.parse(form.start_date + 'T00:00:00Z')) /
        86_400_000 >
        3
    ) {
      setError(t('form.dateTooLong'));
      return;
    }
    setSaving(true);
    setError('');
    try {
      const sourceLang = detectLang(form.title ?? '');
      const target: 'ru' | 'en' = sourceLang === 'ru' ? 'en' : 'ru';
      // Перевод выполняется один раз при сохранении; при сбое — null (покажем оригинал)
      const titleTr = await translateText(form.title ?? '', target);
      const descTr = await translateText(form.description ?? '', target);
      const payload: Partial<EventItem> = {
        ...form,
        source_lang: sourceLang,
        photos: photoInputs.filter((p) => p.trim()),
        // Переведённые поля кладём в нужную колонку
        ...(target === 'ru'
          ? { title_ru: titleTr ?? undefined, description_ru: descTr ?? undefined }
          : { title_en: titleTr ?? undefined, description_en: descTr ?? undefined }),
      };
      if (isNew) await getApi().createEvent(payload);
      else await getApi().updateEvent(initial.id!, payload);
      onSaved();
    } catch {
      setError(t('form.error'));
    } finally {
      setSaving(false);
    }
  }

  const inputCls =
    'w-full rounded-md border border-gray-300 px-2.5 py-2 text-sm focus:border-gray-900 focus:outline-none';

  return (
    <div>
      <h2 className="mb-4 text-base font-semibold text-gray-900">
        {isNew ? t('admin.form.newTitle') : t('admin.form.title')}
      </h2>

      {error && <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm font-medium text-gray-700">
            {t('form.name')} *
          </label>
          <input value={form.title ?? ''} onChange={(e) => set('title', e.target.value)} className={inputCls} />
        </div>

        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm font-medium text-gray-700">{t('form.description')}</label>
          <textarea
            value={form.description ?? ''}
            onChange={(e) => set('description', e.target.value)}
            rows={3}
            className={inputCls}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">{t('form.startDate')} *</label>
          <input
            type="date"
            value={form.start_date ?? ''}
            onChange={(e) => set('start_date', e.target.value)}
            className={inputCls}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">{t('form.endDate')}</label>
          <input
            type="date"
            value={form.end_date ?? ''}
            onChange={(e) => set('end_date', e.target.value || undefined)}
            className={inputCls}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">{t('form.city')} *</label>
          <input value={form.city ?? ''} onChange={(e) => set('city', e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">{t('form.address')}</label>
          <div className="flex gap-2">
            <input
              value={form.address ?? ''}
              onChange={(e) => set('address', e.target.value)}
              className={inputCls}
            />
            <button
              type="button"
              onClick={handleGeocode}
              disabled={geocoding}
              className="shrink-0 rounded-md border border-gray-300 px-3 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {geocoding ? '…' : '↗'}
            </button>
          </div>
        </div>

        {/* Мини-карта с маркером */}
        <div className="h-48 overflow-hidden rounded-lg border border-gray-200 sm:col-span-2">
          <EditMap
            lat={form.lat ?? 10.2}
            lng={form.lng ?? 108.5}
            onChange={(la, ln) => {
              set('lat', la);
              set('lng', ln);
            }}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">{t('form.category')}</label>
          <select
            value={form.category_id ?? ''}
            onChange={(e) => set('category_id', e.target.value)}
            className={inputCls}
          >
            <option value="">—</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.emoji} {c.name_ru} / {c.name_en}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Статус</label>
          <select
            value={form.status ?? 'active'}
            onChange={(e) => set('status', e.target.value)}
            className={inputCls}
          >
            <option value="active">{t('admin.events.status.active')}</option>
            <option value="past">{t('admin.events.status.past')}</option>
            <option value="moderation">{t('admin.events.status.moderation')}</option>
            <option value="rejected">{t('admin.events.status.rejected')}</option>
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">{t('form.website')}</label>
          <input value={form.website ?? ''} onChange={(e) => set('website', e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">{t('form.contact')}</label>
          <input value={form.contact ?? ''} onChange={(e) => set('contact', e.target.value)} className={inputCls} />
        </div>

        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm font-medium text-gray-700">{t('form.photos')}</label>
          <div className="space-y-2">
            {photoInputs.map((p, i) => (
              <div key={i} className="flex gap-2">
                <input
                  value={p}
                  onChange={(e) => setPhotoInputs(photoInputs.map((x, j) => (j === i ? e.target.value : x)))}
                  placeholder={t('form.photoPlaceholder')}
                  className={inputCls}
                />
                <button
                  type="button"
                  onClick={() => setPhotoInputs(photoInputs.filter((_, j) => j !== i))}
                  className="shrink-0 rounded-md border border-gray-300 px-2 text-gray-500 hover:bg-gray-50"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
          {photoInputs.length < 5 && (
            <button
              type="button"
              onClick={() => setPhotoInputs([...photoInputs, ''])}
              className="mt-2 rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
            >
              {t('form.addPhoto')}
            </button>
          )}
        </div>
      </div>

      <div className="mt-5 flex gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-md bg-gray-900 px-5 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
        >
          {saving ? t('common.loading') : t('admin.form.save')}
        </button>
        <button
          onClick={onCancel}
          className="rounded-md border border-gray-300 px-5 py-2 text-sm text-gray-600 hover:bg-gray-50"
        >
          {t('admin.form.cancel')}
        </button>
      </div>
    </div>
  );
}
