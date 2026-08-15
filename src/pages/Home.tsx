// Главная (публичная) страница: карта на ВЕСЬ экран (фон сайта),
// поверх неё — плавающие панели: шапка, фильтры, список событий.
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

// Размер порции списка событий («Показать ещё»)
const PAGE_SIZE = 30;

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
  // Панель фильтров на мобильных (на десктопе фильтры всегда видны)
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  // Панель списка событий на мобильных: по умолчанию свёрнута,
  // разворачивается кнопкой «События» или выбором события
  const [mobileListOpen, setMobileListOpen] = useState(false);
  // Сколько событий показывать в списке (порциями, чтобы панель не тормозила)
  const [visibleLimit, setVisibleLimit] = useState(PAGE_SIZE);

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

  // Смена фильтров возвращает список к первой порции
  useEffect(() => {
    setVisibleLimit(PAGE_SIZE);
  }, [filters]);

  // Переход по быстрой кнопке направления
  function goTo(lat: number, lng: number, z: number) {
    setCenter({ lat, lng });
    setZoom(z);
  }

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col">
        <Header
          onOpenForm={() => setFormOpen(true)}
          onOpenAdmin={() => (window.location.hash = '#/admin')}
        />
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
          onSelect={(ev) => {
            setSelected(ev);
            // На телефоне клик по маркеру открывает панель с карточкой события
            setMobileListOpen(true);
          }}
          center={center}
          zoom={zoom}
        />
      </div>

      {/* Шапка поверх карты */}
      <div className="absolute inset-x-0 top-0 z-[1200] border-b border-gray-200 bg-white/95 shadow-sm backdrop-blur">
        <Header
          onOpenForm={() => setFormOpen(true)}
          onOpenAdmin={() => (window.location.hash = '#/admin')}
        />
      </div>

      {/* Кнопка открытия фильтров на мобильных */}
      <button
        onClick={() => setMobileFiltersOpen(true)}
        className="absolute left-3 top-16 z-[1150] rounded-md bg-white px-3 py-2 text-sm font-medium text-gray-800 shadow hover:bg-gray-50 lg:hidden"
      >
        {t('filters.title')}
      </button>

      {/* Оверлей фильтров на мобильных */}
      {mobileFiltersOpen && (
        <div className="absolute inset-x-3 top-24 z-[1150] max-h-[60vh] overflow-y-auto rounded-xl bg-white p-3 shadow-xl lg:hidden">
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
          {/* Кнопка «Показать»: применяет фильтры (они применяются сразу)
              и закрывает панель, чтобы были видны результаты */}
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
        <div className="rounded-lg bg-white/95 p-2 shadow">
          <QuickLocations onGoTo={goTo} />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto rounded-lg bg-white/95 shadow">
          <FiltersPanel categories={categories} filters={filters} onChange={setFilters} />
        </div>
      </div>

      {/* Правая панель: выбранное событие + список.
          На мобильных — сворачивается/разворачивается,
          на десктопе — всегда видна справа */}
      <div
        className={`absolute inset-x-0 bottom-0 z-[1100] flex-col gap-3 overflow-y-auto bg-white/95 p-3 shadow-[0_-6px_16px_rgba(0,0,0,0.12)] lg:inset-x-auto lg:top-16 lg:bottom-3 lg:right-3 lg:w-[380px] lg:flex lg:bg-white/80 lg:p-2 lg:shadow-lg lg:backdrop-blur ${
          mobileListOpen ? 'top-[55%] flex' : 'hidden'
        }`}
      >
        {/* Кнопка «Свернуть» — только на мобильных */}
        <button
          onClick={() => setMobileListOpen(false)}
          className="flex w-full items-center justify-center gap-1 rounded-md border border-gray-200 py-1.5 text-sm text-gray-500 hover:bg-gray-50 lg:hidden"
        >
          <span>▾</span> {t('list.collapse')}
        </button>
        {selected && (
          <EventCard event={selected} categories={categories} onClose={() => setSelected(null)} />
        )}
        <EventsList
          events={visible.slice(0, visibleLimit)}
          categories={categories}
          selectedId={selected?.id ?? null}
          onSelect={setSelected}
        />
        {/* Кнопка «Показать ещё» — список показывается порциями,
            чтобы панель оставалась лёгкой при сотнях событий */}
        {visible.length > visibleLimit && (
          <button
            onClick={() => setVisibleLimit((l) => l + PAGE_SIZE)}
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
          >
            {t('list.showMore')} ({visible.length - visibleLimit})
          </button>
        )}
      </div>

      {/* Кнопка разворачивания панели событий на мобильных (когда панель свёрнута) */}
      {!mobileListOpen && (
        <button
          onClick={() => setMobileListOpen(true)}
          className="absolute bottom-4 left-1/2 z-[1150] -translate-x-1/2 rounded-full bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white shadow-lg hover:bg-gray-700 lg:hidden"
        >
          {t('list.title')} ({visible.length})
        </button>
      )}

      {formOpen && (
        <EventForm categories={categories} onClose={() => setFormOpen(false)} />
      )}
    </div>
  );
}
