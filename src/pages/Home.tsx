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
import { todayIso, tomorrowIso } from '../lib/dates';
import { cityMatches, ruToEn } from '../lib/cities';
import { geocodeAddress } from '../lib/geocode';
import { detectCountry } from '../lib/countries';
import { useAuth } from '../lib/auth';
import type { Category, EventItem, Filters } from '../lib/types';

const LIST_LIMIT = 50;

// Примерные курсы к USD (без внешних API): цена события приводится к USD
// для сравнения с диапазоном фильтра. Неизвестная валюта = как USD.
const CURRENCY_TO_USD: Record<string, number> = {
  usd: 1,
  idr: 15500,
  vnd: 24500,
  thb: 34,
  sgd: 1.34,
  myr: 4.2,
  php: 56,
  eur: 0.92,
  rub: 88,
};

function toUsd(price: number, currency?: string | null): number {
  const rate = CURRENCY_TO_USD[(currency ?? 'usd').toLowerCase()] ?? 1;
  return price / rate;
}

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
    date: undefined,
    price: 'any',
    priceMin: undefined,
    priceMax: undefined,
    currency: null,
    language: null,
    country: null,
    city: undefined,
    query: undefined,
  });
  const [selected, setSelected] = useState<EventItem | null>(null);
  const [center, setCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [zoom, setZoom] = useState<number | undefined>(undefined);
  const [formOpen, setFormOpen] = useState(false);
  // Свёрнута ли левая панель фильтров (десктоп)
  const [filtersCollapsed, setFiltersCollapsed] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  // Кнопка «События на карте» — список событий видимой области
  const [listOpen, setListOpen] = useState(false);

  // Аккордеон: открытие панели на главной закрывает меню шестерёнки;
  // открытие меню шестерёнки закрывает панели главной
  useEffect(() => {
    const h = () => {
      setMobileFiltersOpen(false);
      setListOpen(false);
    };
    window.addEventListener('close-home-panels', h);
    return () => window.removeEventListener('close-home-panels', h);
  }, []);

  function openFilters() {
    setMobileFiltersOpen(true);
    setListOpen(false);
    window.dispatchEvent(new CustomEvent('close-gear-menu'));
  }
  function openList() {
    setListOpen(true);
    setMobileFiltersOpen(false);
    window.dispatchEvent(new CustomEvent('close-gear-menu'));
  }
  // Видимая область карты (юго-запад, северо-восток)
  const [bounds, setBounds] = useState<MapBounds | null>(null);

  // Загрузка данных из слоя данных
  async function loadData() {
    const api = getApi();
    const [evs, cats] = await Promise.all([api.listEvents(), api.getCategories()]);
    setEvents(evs);
    setCategories(cats);
    setLoading(false);
  }

  // Первичная загрузка данных
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
    const city = filters.city ?? '';
    return events.filter((ev) => {
      if (filters.categoryId && ev.category_id !== filters.categoryId) return false;
      // Дата: событие проходит в выбранный день (сегодня / завтра / конкретная дата)
      if (filters.date) {
        const d =
          filters.date === 'today'
            ? todayIso()
            : filters.date === 'tomorrow'
              ? tomorrowIso()
              : filters.date;
        const end = ev.end_date ?? ev.start_date;
        if (ev.start_date > d || end < d) return false;
      }
      // Цена: бесплатные (price = null или 0), платные (price > 0) или донат + диапазон
      if (filters.price === 'free' && ev.price != null && ev.price > 0) return false;
      if (filters.price === 'paid' && (ev.price == null || ev.price <= 0)) return false;
      if (filters.price === 'donation' && !ev.donation) return false;
      // Диапазон цены считается в USD: конвертируем цену события по курсу валюты
      if ((filters.price === 'any' || filters.price === 'paid') && ev.price != null && ev.price > 0) {
        const usd = toUsd(ev.price, ev.currency);
        if (filters.priceMin != null && usd < filters.priceMin) return false;
        if (filters.priceMax != null && usd > filters.priceMax) return false;
      }
      // Валюта, язык и страна
      if (filters.currency && ev.currency !== filters.currency) return false;
      if (filters.language && ev.language !== filters.language) return false;
      if (filters.country && (ev.country || detectCountry(ev.city)) !== filters.country) return false;
      // Город: работает и по-русски, и по-английски («Убуд» = «Ubud»)
      if (city && !cityMatches(ev.city, city)) return false;
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

  // Ввели город в фильтре — карта перемещается к нему (с небольшой задержкой,
  // чтобы не дёргать карту при каждом нажатии клавиши)
  useEffect(() => {
    const city = filters.city?.trim();
    if (!city) return;
    const timer = setTimeout(async () => {
      const coords = await geocodeAddress(ruToEn(city));
      if (coords && filters.city?.trim() === city) {
        setCenter(coords);
        setZoom(11);
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [filters.city]);

  // Выбор события: карточка + запись в историю просмотров + счётчик просмотров
  async function selectEvent(ev: EventItem) {
    setSelected(ev);
    if (user) {
      getApi().addHistory(ev.id).catch(() => {});
    }
    getApi().incrementCounter('card_views').catch(() => {});
  }

  // Города и страны из базы — для автодополнения и фильтра
  const allCities = useMemo(
    () => [...new Set(events.map((e) => e.city).filter(Boolean))].sort(),
    [events],
  );
  const allCountries = useMemo(
    () =>
      [...new Set(events.map((e) => e.country || detectCountry(e.city)).filter(Boolean))].sort(),
    [events],
  );

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
          onMapClick={() => {
            setSelected(null);
            setMobileFiltersOpen(false);
            setFiltersCollapsed(true);
            setListOpen(false);
          }}
        />
      </div>

      {/* Шапка поверх карты — плавающая, с закруглёнными краями */}
      <div className="glass absolute inset-x-3 top-2 z-[1200] rounded-2xl shadow-lg">
        <Header onOpenForm={() => setFormOpen(true)} />
      </div>

      {/* Кнопка открытия фильтров на мобильных */}
      <button
        onClick={openFilters}
        className="glass-btn absolute left-3 top-20 z-[1150] rounded-md px-3 py-2 text-sm font-medium shadow hover:bg-white/75 lg:hidden"
      >
        {t('filters.title')}
      </button>

      {/* Оверлей фильтров на мобильных */}
      {mobileFiltersOpen && (
        <>
          <div className="fixed inset-0 z-[1145] bg-black/20 lg:hidden" onClick={() => setMobileFiltersOpen(false)} />
          <div className="glass absolute inset-x-3 top-24 z-[1150] max-h-[60vh] overflow-y-auto rounded-xl p-3 shadow-xl lg:hidden thin-scroll">
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
            {user?.role === 'admin' && <QuickLocations onGoTo={goTo} />}
          </div>
          <FiltersPanel categories={categories} filters={filters} onChange={setFilters} cities={allCities} countries={allCountries} />
          <button
            onClick={() => setMobileFiltersOpen(false)}
            className="mt-3 w-full rounded-md bg-gray-900 px-3 py-2 text-sm font-semibold text-white hover:bg-gray-700"
          >
            {t('filters.apply')}
          </button>
        </div>
        </>
      )}

      {/* Левая панель (десктоп): быстрые кнопки + фильтры, со сворачиванием */}
      {filtersCollapsed ? (
        <button
          onClick={() => setFiltersCollapsed(false)}
          title={t('filters.title')}
          className="glass absolute left-3 top-20 z-[1100] hidden h-10 items-center justify-center gap-1.5 rounded-lg px-3 text-sm text-gray-600 shadow transition hover:bg-white/70 lg:flex"
        >
          <span>☰</span>
          <span>{t('filters.title')}</span>
        </button>
      ) : (
        <div className="absolute bottom-3 left-3 top-20 z-[1100] hidden w-72 flex-col gap-2 lg:flex">
          {user?.role === 'admin' && (
            <div className="relative glass rounded-lg p-2 shadow">
              <QuickLocations onGoTo={goTo} />
            </div>
          )}
          <div className="relative glass min-h-0 flex-1 overflow-y-auto rounded-lg shadow thin-scroll">
            <button
              onClick={() => setFiltersCollapsed(true)}
              className="absolute right-1 top-1 z-10 rounded px-1 text-sm text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              aria-label={t('common.close')}
            >
              ✕
            </button>
            <FiltersPanel categories={categories} filters={filters} onChange={setFilters} cities={allCities} countries={allCountries} />
          </div>
        </div>
      )}

      {/* Карточка выбранного события (без списка):
          на мобильных — снизу, на десктопе — справа.
          Крестик-кружок — над карточкой, вне скролл-области */}
      {selected && (
        <div className="absolute inset-x-0 bottom-0 top-[45%] z-[1140] lg:inset-x-auto lg:top-20 lg:bottom-3 lg:right-3 lg:w-[380px]">
          <div className="glass h-full overflow-y-auto p-3 shadow-[0_-6px_16px_rgba(0,0,0,0.12)] lg:rounded-2xl lg:p-4">
            <EventCard
              event={selected}
              categories={categories}
              onClose={() => setSelected(null)}
            />
          </div>
          <button
            onClick={() => setSelected(null)}
            className="absolute -top-3 right-2 flex h-9 w-9 items-center justify-center rounded-full bg-white text-gray-700 shadow-lg hover:bg-gray-100 lg:-right-3 lg:right-auto"
            aria-label={t('common.close')}
          >
            ✕
          </button>
        </div>
      )}

      {/* Кнопка «События списком» — список событий видимой области.
          Скрыта, когда открыта карточка события */}
      {!selected && (
        <button
          onClick={() => {
            if (listOpen) setListOpen(false);
            else openList();
          }}
          className="glass-btn bottom-safe absolute left-1/2 z-[1160] -translate-x-1/2 rounded-full px-5 py-2.5 text-sm font-semibold shadow-lg"
        >
          {listOpen
            ? `▾ ${t('list.collapse')}`
            : `${t('list.title')} (${onMapEvents.length})`}
        </button>
      )}

      {/* Список под кнопкой — события текущего участка карты */}
      {listOpen && (
        <div className="glass absolute inset-x-0 bottom-28 z-[1130] mx-auto max-h-[50vh] w-full max-w-xl overflow-y-auto rounded-t-xl p-3 shadow-xl thin-scroll">
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
        <EventForm
          categories={categories}
          onClose={() => {
            setFormOpen(false);
            loadData();
          }}
        />
      )}
    </div>
  );
}
