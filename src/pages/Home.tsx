// Главная (публичная) страница: карта + фильтры + список событий.
// При загрузке запрашивается геолокация: разрешили — карта открывается
// на пользователе, иначе — на Юго-Восточной Азии.
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Header from '../components/Header';
import MapView from '../components/MapView';
import FiltersPanel from '../components/Filters';
import EventsList from '../components/EventsList';
import EventCard from '../components/EventCard';
import QuickLocations from '../components/QuickLocations';
import EventForm from '../components/EventForm';
import { getApi } from '../lib/api';
import { isUpcoming } from '../lib/dates';
import type { Category, EventItem, Filters } from '../lib/types';

export default function Home() {
  const { t } = useTranslation();

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

  // Загрузка данных из слоя данных (демо или Supabase — не важно)
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

  // Геолокация: центр на посетителе; при отказе — Юго-Восточная Азия (по умолчанию)
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCenter({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setZoom(10);
      },
      () => {
        /* отказ/ошибка — остаёмся на ЮВА */
      },
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

  // Переход по быстрой кнопке направления
  function goTo(lat: number, lng: number, z: number) {
    setCenter({ lat, lng });
    setZoom(z);
  }

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col">
        <Header onOpenForm={() => setFormOpen(true)} onOpenAdmin={() => (window.location.hash = '#/admin')} />
        <div className="flex flex-1 items-center justify-center text-sm text-gray-500">
          {t('common.loading')}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header onOpenForm={() => setFormOpen(true)} onOpenAdmin={() => (window.location.hash = '#/admin')} />

      <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-4">
        {/* Заголовок сайта */}
        <div className="mb-4">
          <h2 className="text-xl font-bold text-gray-900">{t('app.title')}</h2>
          <p className="text-sm text-gray-500">{t('app.tagline')}</p>
        </div>

        {/* Адаптивная сетка: фильтры | карта | список+карточка */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_minmax(0,1fr)_400px]">
          {/* Фильтры — слева на десктопе, сверху на мобильных */}
          <div className="order-1 lg:order-none">
            <FiltersPanel categories={categories} filters={filters} onChange={setFilters} />
          </div>

          {/* Карта — по центру */}
          <div className="order-2 flex flex-col gap-3">
            <QuickLocations onGoTo={goTo} />
            <div className="h-[55vh] min-h-[380px] overflow-hidden rounded-lg border border-gray-200 lg:h-[calc(100vh-230px)]">
              <MapView
                events={visible}
                categories={categories}
                onSelect={setSelected}
                center={center}
                zoom={zoom}
              />
            </div>
          </div>

          {/* Список + выбранное событие — справа */}
          <div className="order-3 flex flex-col gap-3 lg:h-[calc(100vh-230px)] lg:overflow-y-auto">
            {selected && (
              <EventCard event={selected} categories={categories} onClose={() => setSelected(null)} />
            )}
            <EventsList
              events={visible}
              categories={categories}
              selectedId={selected?.id ?? null}
              onSelect={setSelected}
            />
          </div>
        </div>
      </main>

      {formOpen && <EventForm categories={categories} onClose={() => setFormOpen(false)} />}
    </div>
  );
}
