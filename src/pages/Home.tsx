// Главная (публичная) страница: карта на ВЕСЬ экран (фон сайта),
// поверх неё — плавающие панели: шапка, фильтры, карточка события,
// кнопка «События на карте» с списком событий видимой области.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Header from '../components/Header';
import MapView, { type MapBounds } from '../components/MapView';
import FiltersPanel from '../components/Filters';
import EventsList from '../components/EventsList';
import EventCard from '../components/EventCard';
import QuickLocations from '../components/QuickLocations';
import EventForm from '../components/EventForm';
import { getApi } from '../lib/api';
import { ruToEn } from '../lib/cities';
import { geocodeAddress } from '../lib/geocode';
import { eventCountry } from '../lib/countries';
import { DEFAULT_FILTERS, eventMatchesFilters } from '../lib/eventFilters';
import { useAuth } from '../lib/auth';
import type { Category, EventItem, Filters } from '../lib/types';

const LIST_LIMIT = 50;

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
  // Реальная нижняя граница шапки + зазор: панели, кнопки и меню шестерёнки
  // выравниваются по ней (CSS-переменная --header-bottom), чтобы ни одна
  // панель не заныривала под шапку и не перекрывала её на любом устройстве
  const headerRef = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const update = () => {
      const bottom = Math.round(el.getBoundingClientRect().bottom) + 12;
      document.documentElement.style.setProperty('--header-bottom', `${bottom}px`);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    // Страховка: шрифты и layout могут доехать позже первого замера
    window.addEventListener('load', update);
    window.addEventListener('resize', update);
    const t1 = window.setTimeout(update, 300);
    const t2 = window.setTimeout(update, 1200);
    return () => {
      ro.disconnect();
      window.removeEventListener('load', update);
      window.removeEventListener('resize', update);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      document.documentElement.style.removeProperty('--header-bottom');
    };
  }, [loading]);
  // Избранное: id сохранённых событий (null — гость, сердечки скрыты)
  const [favoriteIds, setFavoriteIds] = useState<string[] | null>(null);

  useEffect(() => {
    if (!user) {
      setFavoriteIds(null);
      return;
    }
    getApi()
      .getFavoritesIds()
      .then((ids) => setFavoriteIds(ids))
      .catch(() => setFavoriteIds([]));
  }, [user]);

  // Переключение избранного: оптимистичное обновление + запрос в БД.
  // При ошибке состояние откатывается.
  function toggleFavorite(id: string) {
    const isFav = favoriteIds?.includes(id) ?? false;
    setFavoriteIds((prev) =>
      isFav ? (prev ?? []).filter((x) => x !== id) : prev ? [...prev, id] : [id],
    );
    const req = isFav ? getApi().removeFavorite(id) : getApi().addFavorite(id);
    req.catch(() => {
      setFavoriteIds((prev) =>
        isFav ? (prev ? [...prev, id] : [id]) : (prev ?? []).filter((x) => x !== id),
      );
    });
  }

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

  // Закрытие карточки: убираем параметр e= из адресной строки,
  // чтобы глубокая ссылка не висела в hash
  function closeCard() {
    setSelected(null);
    if (window.location.hash.includes('e=')) window.location.hash = '#/';
  }

  // Удаление события (только админ): из БД и из списка на карте
  async function handleDeleteEvent(id: string) {
    try {
      await getApi().deleteEvent(id);
      closeCard();
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
      // Глубокая ссылка #/?e=<id>: открыть карточку события независимо
      // от фильтров; события нет (скрыто/удалено) — молча игнорируем
      const m = window.location.hash.match(/[?&]e=([^&]+)/);
      if (m) {
        const ev = evs.find((x) => x.id === decodeURIComponent(m[1]));
        if (ev) {
          selectEvent(ev);
          // Deep link: летим к координатам события, чтобы маркер был виден
          // рядом с карточкой (событие может быть в другом городе/стране).
          // Без координат — карточка открывается как раньше, карту не двигаем.
          if (ev.lat != null && ev.lng != null) {
            setCenter({ lat: ev.lat, lng: ev.lng });
            setZoom(15);
          }
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // «Создать событие» с другой страницы (Header без формы): возвращаемся
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
  const visible = useMemo(() => events.filter((ev) => eventMatchesFilters(ev, filters)), [
    events,
    filters,
  ]);

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
          favoriteIds={favoriteIds}
          onMapClick={() => {
            closeCard();
            setListOpen(false);
          }}
        />
      </div>

      {/* Шапка поверх карты — плавающая, с закруглёнными краями.
          Прозрачность — как у кнопок (glass-btn), чтобы не закрывать карту */}
      <div
        ref={headerRef}
        className="glass absolute inset-x-3 top-2 z-[1200] rounded-2xl shadow-lg"
        style={{ background: 'rgba(255, 255, 255, 0.32)' }}
      >
        <Header onOpenForm={() => setFormOpen(true)} />
      </div>

      {/* Кнопка открытия фильтров на мобильных */}
      <button
        onClick={openFilters}
        className="glass-btn absolute left-3 top-(--header-bottom) z-[1150] rounded-md px-3 py-2 text-sm font-medium shadow hover:bg-white/75 lg:hidden"
      >
        {t('filters.title')}
      </button>

      {/* Плавающая кнопка «Создать событие» для организатора:
          на всех ширинах под шапкой справа (на десктопе пункт шапки убран) */}
      {user?.role === 'org' && !mobileFiltersOpen && (
        <button
          onClick={() => setFormOpen(true)}
          className="absolute right-3 top-(--header-bottom) z-[1155] rounded-md bg-[#72D2CF] px-3.5 py-2 text-sm font-semibold text-black shadow-lg hover:bg-[#61B2B0]"
        >
          + {t('menu.addEvent')}
        </button>
      )}

      {/* Модалка фильтров на мобильных — вид как у «Создать событие»:
          затемнение, центрированная карточка, скролл на внешнем контейнере.
          Закрывается только крестиком и кнопкой «Найти» — клик по фону НЕ закрывает */}
      {mobileFiltersOpen && (
        <div className="fixed inset-0 z-[1300] overflow-y-auto bg-black/25 p-4 lg:hidden">
          <div className="flex min-h-full items-center justify-center">
            <div className="glass-strong mx-auto my-6 w-full max-w-2xl rounded-xl p-6 shadow-2xl">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">{t('filters.title')}</h2>
                <button
                  onClick={() => setMobileFiltersOpen(false)}
                  className="rounded p-1 text-gray-400 hover:bg-gray-100"
                  aria-label={t('common.close')}
                >
                  ✕
                </button>
              </div>
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
          </div>
        </div>
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
        <div className="absolute bottom-3 left-3 top-(--header-bottom) z-[1100] hidden w-72 flex-col gap-2 lg:flex">
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
          className="absolute inset-x-0 bottom-0 z-[1170] lg:inset-x-auto lg:top-(--header-bottom) lg:bottom-3 lg:right-3 lg:w-[380px]"
          style={cardTop ? { top: cardTop } : undefined}
        >
          <div className="glass h-full overflow-y-auto p-3 shadow-[0_-6px_16px_rgba(0,0,0,0.12)] lg:rounded-2xl lg:p-4">
            <EventCard
              event={selected}
              categories={categories}
              onClose={closeCard}
              isAdmin={user?.role === 'admin'}
              isOwner={user?.id === selected.owner_id}
              onDelete={handleDeleteEvent}
              favoriteIds={favoriteIds}
              onToggleFavorite={user ? toggleFavorite : undefined}
            />
          </div>
          <button
            onClick={closeCard}
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
            favoriteIds={favoriteIds}
            onToggleFavorite={user ? toggleFavorite : undefined}
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
