// Главная (публичная) страница: карта на ВЕСЬ экран (фон сайта),
// поверх неё — плавающие панели: шапка, фильтры, карточка события,
// кнопка «События на карте» с списком событий видимой области.
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Header from '../components/Header';
import MapView, { type MapBounds } from '../components/MapView';
import FiltersPanel from '../components/Filters';
import EventsList from '../components/EventsList';
import EventCard from '../components/EventCard';
import QuickLocations from '../components/QuickLocations';
import EventForm from '../components/EventForm';
import { getApi } from '../lib/api';
import { isUpcoming } from '../lib/dates';
import { useAuth } from '../lib/auth';
import type { Category, EventItem, Filters } from '../lib/types';

const LIST_LIMIT = 50;

export default function Home() {
  const { t } = useTranslation();
  const { user } = useAuth();

  // --- Данные ---
  const [events, setEvents] = useState<EventItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  // --- Состояние интерфейса ---
  const [filters, setFilters] = useState<Filters>({
    categoryId: null,
    period: 'upcoming',
    city: undefined,
    query: undefined,
  });
  const [selected, setSelected] = useState<EventItem | null>(null);
  const [center, setCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [zoom, setZoom] = useState<number | undefined>(undefined);
  const [formOpen, setFormOpen] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  // Кнопка «События на карте» — список событий видимой области
  const [listOpen, setListOpen] = useState(false);
  // Видимая область карты (юго-запад, северо-восток)
  const [bounds, setBounds] = useState<MapBounds | null>(null);

  // Загрузка данных из слоя данных
  useEffect(() => {
    let alive = true;
    (async () => {
      const api = getApi();
      const [evs, cats] = await Promise.all([api.listEvents(), api.getCategories()]);
      if (!alive) return;
      setEvents(evs);
      setCategories(cats);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Геолокация: центр на посетителе; при отказе — Юго-Восточная Азия
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCenter({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setZoom(10);
      },
      () => {},
      { timeout: 5000 },
    );
  }, []);

  // Применение фильтров: категория, период, город, ключевые слова
  const visible = useMemo(() => {
    const q = (filters.query ?? '').toLowerCase();
    const city = (filters.city ?? '').toLowerCase();
    return events.filter((ev) => {
      if (filters.categoryId && ev.category_id !== filters.categoryId) return false;
      if (filters.period === 'upcoming' && !isUpcoming(ev)) return false;
      if (city && !ev.city.toLowerCase().includes(city)) return false;
      if (q) {
        const hay = `${ev.title} ${ev.description} ${ev.city}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [events, filters]);

  // События на видимом участке карты (bounds) + фильтры
  const onMapEvents = useMemo(() => {
    if (!bounds) return visible.slice(0, LIST_LIMIT);
    const [sw, ne] = bounds;
    return visible
      .filter(
        (ev) =>
          ev.lat >= sw[0] && ev.lat <= ne[0] && ev.lng >= sw[1] && ev.lng <= ne[1],
      )
      .slice(0, LIST_LIMIT);
  }, [visible, bounds]);

  // Переход по быстрой кнопке направления
  function goTo(lat: number, lng: number, z: number) {
    setCenter({ lat, lng });
    setZoom(z);
  }

  // Выбор события: карточка + запись в историю просмотров
  async function selectEvent(ev: EventItem) {
    setSelected(ev);
    if (user) {
      getApi().addHistory(ev.id).catch(() => {});
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col">
        <Header onOpenForm={() => setFormOpen(true)} />
        <div className="flex flex-1 items-center justify-center text-sm text-gray-500">
          {t('common.loading')}
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-screen w-full overflow-hidden bg-white">
      {/* КАРТА НА ВЕСЬ ЭКРАН — фон сайта */}
      <div className="absolute inset-0">
        <MapView
          events={visible}
          categories={categories}
          onSelect={selectEvent}
          center={center}
          zoom={zoom}
          onBoundsChange={setBounds}
        />
      </div>

      {/* Шапка поверх карты */}
      <div className="glass absolute inset-x-0 top-0 z-[1200] border-b border-white/40 shadow-sm">
        <Header onOpenForm={() => setFormOpen(true)} />
      </div>

      {/* Кнопка открытия фильтров на мобильных */}
      <button
        onClick={() => setMobileFiltersOpen(true)}
        className="glass-btn absolute left-3 top-16 z-[1150] rounded-md px-3 py-2 text-sm font-medium shadow hover:bg-white/75 lg:hidden"
      >
        {t('filters.title')}
      </button>

      {/* Оверлей фильтров на мобильных */}
      {mobileFiltersOpen && (
        <div className="glass absolute inset-x-3 top-24 z-[1150] max-h-[60vh] overflow-y-auto rounded-xl p-3 shadow-xl lg:hidden">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-900">{t('filters.title')}</span>
            <button
              onClick={() => setMobileFiltersOpen(false)}
              className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              aria-label={t('common.close')}
            >
              ✕
            </button>
          </div>
          <div className="mb-3">
            <QuickLocations onGoTo={goTo} />
          </div>
          <FiltersPanel categories={categories} filters={filters} onChange={setFilters} />
          <button
            onClick={() => setMobileFiltersOpen(false)}
            className="mt-3 w-full rounded-md bg-gray-900 px-3 py-2 text-sm font-semibold text-white hover:bg-gray-700"
          >
            {t('filters.apply')}
          </button>
        </div>
      )}

      {/* Левая панель (десктоп): быстрые кнопки + фильтры */}
      <div className="absolute bottom-3 left-3 top-16 z-[1100] hidden w-72 flex-col gap-2 lg:flex">
        <div className="glass rounded-lg p-2 shadow">
          <QuickLocations onGoTo={goTo} />
        </div>
        <div className="glass min-h-0 flex-1 overflow-y-auto rounded-lg shadow">
          <FiltersPanel categories={categories} filters={filters} onChange={setFilters} />
        </div>
      </div>

      {/* Карточка выбранного события (без списка):
          на мобильных — снизу, на десктопе — справа */}
      {selected && (
        <div className="glass absolute inset-x-0 bottom-0 top-[45%] z-[1140] overflow-y-auto p-3 shadow-[0_-6px_16px_rgba(0,0,0,0.12)] lg:inset-x-auto lg:top-16 lg:bottom-3 lg:right-3 lg:w-[380px]">
          <EventCard
            event={selected}
            categories={categories}
            onClose={() => setSelected(null)}
          />
        </div>
      )}

      {/* Кнопка «События списком» — список событий видимой области.
          Скрыта, когда открыта карточка события */}
      {!selected && (
        <button
          onClick={() => setListOpen((v) => !v)}
          className="glass-btn bottom-safe absolute left-1/2 z-[1160] -translate-x-1/2 rounded-full px-5 py-2.5 text-sm font-semibold shadow-lg"
        >
          {listOpen
            ? `▾ ${t('list.collapse')}`
            : `${t('list.title')} (${onMapEvents.length})`}
        </button>
      )}

      {/* Список под кнопкой — события текущего участка карты */}
      {listOpen && (
        <div className="glass absolute inset-x-0 bottom-28 z-[1130] mx-auto max-h-[50vh] w-full max-w-xl overflow-y-auto rounded-t-xl p-3 shadow-xl">
          <p className="mb-2 text-xs text-gray-500">{t('list.results', { count: onMapEvents.length })}</p>
          {onMapEvents.length === 0 && (
            <p className="py-4 text-center text-sm text-gray-500">{t('list.empty')}</p>
          )}
          <EventsList
            events={onMapEvents}
            categories={categories}
            selectedId={selected?.id ?? null}
            onSelect={selectEvent}
          />
        </div>
      )}

      {formOpen && (
        <EventForm categories={categories} onClose={() => setFormOpen(false)} />
      )}
    </div>
  );
}
