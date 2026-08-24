// Главная (публичная) страница: карта на ВЕСЬ экран (фон сайта),
// поверх неё — плавающие панели: шапка, фильтры, карточка события,
// кнопка «События на карте» с списком событий видимой области.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Header from '../components/Header';
import MapView, { type MapBounds } from '../components/MapView';
import FiltersPanel from '../components/Filters';
import EventsList from '../components/EventsList';
import EventCard from '../components/EventCard';
import QuickLocations from '../components/QuickLocations';
import EventForm from '../components/EventForm';
import { getApi } from '../lib/api';
import { isUpcoming, todayIso, tomorrowIso } from '../lib/dates';
import { cityMatches, ruToEn } from '../lib/cities';
import { geocodeAddress } from '../lib/geocode';
import { eventCountry } from '../lib/countries';
import { useAuth } from '../lib/auth';
import type { Category, EventItem, Filters } from '../lib/types';

const LIST_LIMIT = 50;

/** Фильтры по умолчанию (без ограничений) */
const DEFAULT_FILTERS: Filters = {
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
};

/** Фильтры ещё не заданы (ничего не ограничивает) */
function isDefaultFilters(f: Filters): boolean {
  return (
    f.categoryId == null &&
    !f.date &&
    f.price === 'any' &&
    f.priceMin == null &&
    f.priceMax == null &&
    f.currency == null &&
    f.language == null &&
    f.country == null &&
    !f.city &&
    !f.query
  );
}

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
  // filters — применённые фильтры (по ним считается список и карта);
  // draft — черновик в панели, применяется только по кнопке «Найти»
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [draft, setDraft] = useState<Filters>(DEFAULT_FILTERS);
  // Показывать лоадер после нажатия «Найти»
  const [searching, setSearching] = useState(false);
  // Последний город, по которому ушёл запрос геокодинга (для гонок запросов)
  const geocodeCityRef = useRef('');
  const [selected, setSelected] = useState<EventItem | null>(null);
  const [center, setCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [zoom, setZoom] = useState<number | undefined>(undefined);
  const [formOpen, setFormOpen] = useState(false);
  // Свёрнута ли левая панель фильтров (десктоп)
  const [filtersCollapsed, setFiltersCollapsed] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  // Кнопка «События на карте» — список событий видимой области
  const [listOpen, setListOpen] = useState(false);
  // Верх карточки события на мобильном (поднимается до верха списка)
  const [cardTop, setCardTop] = useState<string | undefined>(undefined);

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

  // Удаление события (только админ): из БД и из списка на карте
  async function handleDeleteEvent(id: string) {
    try {
      await getApi().deleteEvent(id);
      setSelected(null);
      setEvents((prev) => prev.filter((e) => e.id !== id));
    } catch (err) {
      console.error('Не удалось удалить событие:', err);
      alert('Не удалось удалить событие');
    }
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

  // «Создать мероприятие» с другой страницы (Header без формы): возвращаемся
  // на главную с флагом в sessionStorage — открываем форму сразу
  useEffect(() => {
    if (sessionStorage.getItem('events-map-open-form') === '1') {
      sessionStorage.removeItem('events-map-open-form');
      setFormOpen(true);
    }
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
      // По умолчанию — только предстоящие (прошедшие скрыты);
      // выбранная дата в фильтре — поверх, показывает события этого дня
      if (!filters.date && !isUpcoming(ev)) return false;
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
      if (filters.country) {
        const ec = eventCountry(ev);
        // «Другие» — события, чью страну не удалось определить
        if (filters.country === 'other' ? ec !== '' : ec !== filters.country) return false;
      }
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
      .filter((ev) => {
        const lat = ev.lat;
        const lng = ev.lng;
        // Без координат (адрес есть, геокода нет) — не фильтровать по карте,
        // иначе событие исчезает из списка при перемещении карты
        if (lat == null || lng == null) return true;
        return lat >= sw[0] && lat <= ne[0] && lng >= sw[1] && lng <= ne[1];
      })
      .slice(0, LIST_LIMIT);
  }, [visible, bounds]);

  // Переход по быстрой кнопке направления
  function goTo(lat: number, lng: number, z: number) {
    setCenter({ lat, lng });
    setZoom(z);
  }

  // Применение фильтров по кнопке «Найти»: черновик становится рабочим
  // набором, карта едет к выбранному городу, показывается лоадер.
  function applyFilters() {
    const next = draft;
    setFilters(next);
    setMobileFiltersOpen(false);
    setSearching(true);
    window.setTimeout(() => setSearching(false), 500);
    const city = next.city?.trim();
    if (!city) return;
    geocodeCityRef.current = city;
    geocodeAddress(ruToEn(city))
      .then((coords) => {
        if (coords && geocodeCityRef.current === city) {
          setCenter(coords);
          setZoom(11);
        }
      })
      .catch(() => {});
  }

  // Сброс: очищает и черновик в панели, и применённые фильтры
  function resetFilters() {
    setDraft(DEFAULT_FILTERS);
    setFilters(DEFAULT_FILTERS);
    geocodeCityRef.current = '';
  }

  // Выбор события: карточка + запись в историю просмотров + счётчик просмотров
  async function selectEvent(ev: EventItem) {
    setSelected(ev);
    // На мобильном карточка поднимается до верха открытого списка
    // (список не сворачиваем — после закрытия карточки он снова виден)
    if (window.innerWidth < 1024) {
      const listEl = document.getElementById('events-list-panel');
      setCardTop(listEl ? `${Math.round(listEl.getBoundingClientRect().top)}px` : '45%');
    } else {
      setCardTop(undefined);
    }
    if (user) {
      getApi().addHistory(ev.id).catch(() => {});
    }
    getApi().incrementCounter('card_views').catch(() => {});
  }

  // Города и страны из базы — для автодополнения и фильтра.
  // Страна события: из поля country, иначе из справочника по городу;
  // не определилась — «Другие»
  const allCities = useMemo(
    () => [...new Set(events.map((e) => e.city).filter(Boolean))].sort(),
    [events],
  );
  const allCountries = useMemo(
    () =>
      [...new Set(events.map((e) => eventCountry(e) || 'other'))].sort(),
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
            setListOpen(false);
          }}
        />
      </div>

      {/* Шапка поверх карты — плавающая, с закруглёнными краями.
          Плотный фон, чтобы шапка читалась на фоне карты (десктоп) */}
      <div
        className="glass absolute inset-x-3 top-2 z-[1200] rounded-2xl shadow-lg"
        style={{ background: 'rgba(255, 255, 255, 0.92)' }}
      >
        <Header onOpenForm={() => setFormOpen(true)} />
      </div>

      {/* Кнопка открытия фильтров на мобильных */}
      <button
        onClick={openFilters}
        className="glass-btn absolute left-3 top-28 z-[1150] rounded-md px-3 py-2 text-sm font-medium shadow hover:bg-white/75 lg:hidden"
      >
        {t('filters.title')}
      </button>

      {/* Кнопка «Создать мероприятие» для организатора (мобильные):
          на десктопе она в шапке, на мобильных шапка прячет её в меню */}
      {user?.role === 'org' && !mobileFiltersOpen && (
        <button
          onClick={() => setFormOpen(true)}
          className="absolute right-3 top-28 z-[1155] rounded-md bg-emerald-600 px-3.5 py-2 text-sm font-semibold text-white shadow-lg hover:bg-emerald-700 lg:hidden"
        >
          + {t('menu.addEvent')}
        </button>
      )}

      {/* Оверлей фильтров на мобильных: панель закрывается только явным
          действием (кнопка «Фильтры», крестик, «Найти») — клик по фону нет */}
      {mobileFiltersOpen && (
        <>
          <div className="fixed inset-0 z-[1145] bg-black/20 lg:hidden" />
          <div className="glass absolute inset-x-3 top-28 z-[1150] max-h-[60vh] overflow-y-auto rounded-xl p-3 shadow-xl lg:hidden thin-scroll">
          <button
            onClick={() => setMobileFiltersOpen(false)}
            className="absolute right-2 top-2 z-10 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label={t('common.close')}
          >
            ✕
          </button>
          <div className="mb-3">
            {user?.role === 'admin' && <QuickLocations onGoTo={goTo} />}
          </div>
          <FiltersPanel
            categories={categories}
            filters={draft}
            onChange={setDraft}
            cities={allCities}
            countries={allCountries}
            onApply={applyFilters}
            onReset={resetFilters}
          />
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
            <FiltersPanel
              categories={categories}
              filters={draft}
              onChange={setDraft}
              cities={allCities}
              countries={allCountries}
              onApply={applyFilters}
              onReset={resetFilters}
            />
          </div>
        </div>
      )}

      {/* Карточка выбранного события (без списка):
          на мобильных — снизу, на десктопе — справа.
          Крестик-кружок — над карточкой, вне скролл-области */}
      {selected && (
        <div
          className="absolute inset-x-0 bottom-0 z-[1170] lg:inset-x-auto lg:top-20 lg:bottom-3 lg:right-3 lg:w-[380px]"
          style={cardTop ? { top: cardTop } : undefined}
        >
          <div className="glass h-full overflow-y-auto p-3 shadow-[0_-6px_16px_rgba(0,0,0,0.12)] lg:rounded-2xl lg:p-4">
            <EventCard
              event={selected}
              categories={categories}
              onClose={() => setSelected(null)}
              isAdmin={user?.role === 'admin'}
              onDelete={handleDeleteEvent}
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

      {/* Обратная связь поиска: лоадер при применении фильтров и плашка,
          если по параметрам ничего не найдено */}
      {searching && (
        <div className="pointer-events-none absolute inset-x-0 top-1/2 z-[1165] flex -translate-y-1/2 justify-center">
          <div className="glass flex items-center gap-2 rounded-full px-4 py-2 text-sm text-gray-700 shadow">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900" />
            {t('common.loading')}
          </div>
        </div>
      )}
      {!searching && !isDefaultFilters(filters) && visible.length === 0 && (
        <div className="pointer-events-none absolute inset-x-0 top-1/2 z-[1165] flex -translate-y-1/2 justify-center px-4">
          <div className="glass max-w-sm rounded-xl px-4 py-3 text-center shadow">
            <p className="text-sm font-medium text-gray-900">{t('filters.empty')}</p>
            <p className="mt-1 text-xs text-gray-500">{t('filters.emptyHint')}</p>
          </div>
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
        <div
          id="events-list-panel"
          className="glass absolute inset-x-0 bottom-28 z-[1130] mx-auto max-h-[50vh] w-full max-w-xl overflow-y-auto rounded-xl p-3 shadow-xl thin-scroll"
        >
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
