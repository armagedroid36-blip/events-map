// Главная (публичная) страница: карта на ВЕСЬ экран (фон сайта),
// поверх неё — плавающие панели: шапка, фильтры, карточка события,
// кнопка «События на карте» с списком событий видимой области.
import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Header from '../components/Header';
import type { MapBounds } from '../components/MapView';
const MapView = lazy(() => import('../components/MapView'));
import FiltersPanel from '../components/Filters';
import EventsList from '../components/EventsList';
import EventCalendar from '../components/EventCalendar';
import EventCard from '../components/EventCard';
import QuickLocations from '../components/QuickLocations';
import MobileMapIntro from '../components/MobileMapIntro';
const EventForm = lazy(() => import('../components/EventForm'));
import AuthModal from '../components/AuthModal';
import { getApi } from '../lib/api';
import { enablePush, pushSupported, subscriptionData } from '../lib/push';
import { ruToEn } from '../lib/cities';
import { eventCountry } from '../lib/countries';
import { DEFAULT_FILTERS, eventMatchesFilters } from '../lib/eventFilters';
import { navigate, slugify } from '../lib/navigate';
import { seriesSiblings } from '../lib/series';
import { similarEvents } from '../lib/similar';
import { addDaysIso, nextOccurrenceDate } from '../lib/recurrence';
import { formatDate, todayIso } from '../lib/dates';
import { cityCrumbLabel, cityCrumbLabelLocative, cityPageHref, cityPath } from '../lib/address';
import type { CityPath } from '../lib/address';
import { MAP_INTRO_KEY, MOBILE_INTRO_QUERY, HOME_PANEL_QUERY, dropIntroSeoBlocks, setHomePanelHidden } from '../lib/mobileIntro';
import {
  MIN_CATEGORY_EVENTS,
  categoriesBlockTitle,
  categoryCells,
  categoryCityName,
  categoryFaq,
  categoryH1,
  categoryIntro,
  categoryPageExists,
  categoryPageHref,
  categoryPagePublished,
  categoryWhere,
  cellFacts,
  cellItems,
  isRestoredCell,
} from '../lib/categoryPages';
import {
  applyCategoryMeta,
  applyCityMeta,
  applyEventMeta,
  applyGenericMeta,
  applyHomeMeta,
  isEnPath,
} from '../lib/seo';
import { config } from '../config';
import { useAuth } from '../lib/auth';
import NotFound from '../components/NotFound';
import type { Category, EventItem, Filters } from '../lib/types';

/** Число активных событий ячейки с EN-версией (то же условие, что у
 *  существования EN-страницы ячейки в пре-рендере: >= MIN_CATEGORY_EVENTS,
 *  см. cellHasEnPage) — по нему отбираются ссылки на EN-странице города. */
function categoryEnCountIn(
  list: EventItem[],
  cityPathValue: CityPath,
  categoryId: string,
): number {
  return list.filter(
    (ev) =>
      ev &&
      cityPath(ev.city) === cityPathValue &&
      ev.category_id === categoryId &&
      (Boolean(ev.title_en) || ev.source_lang === 'en'),
  ).length;
}

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

// localStorage-ключ «мобильный интро-экран показан» и медиазапрос мобильного
// интро живут в lib/mobileIntro.ts — от того же расчёта зависит судьба
// статических SEO-блоков (они остаются в DOM, пока интро активно).

// Интро-экран допустим только на страницах с картой (главная и города,
// RU и EN: '/en' и '/en/<city>' — как '/' и '/<city>').
function introEligiblePath(path: string): boolean {
  if (path === '/') return true;
  return config.quickLocations.some((q) => path === `/${slugify(q.labelEn)}`);
}

// Максимум ближайших событий города в городском SEO-блоке — ТО ЖЕ число, что
// MAX_CITY_EVENTS в scripts/seo-prerender.mjs (статическая версия блока).
const MAX_CITY_EVENTS = 8;

/** Относительный href страницы события своего языка (схема URL как canonical
 *  статики: /event/<id>/<slug>/ на RU, /en/event/<id>/<slug>/ на EN —
 *  со СЛЭШЕМ на конце, без него GitHub Pages отдаёт 301 на каноникал).
 *  Слаг — RU по title, EN по title_en||title (как EventCard.eventPath). */
function cityEventHref(ev: EventItem, lang: 'ru' | 'en'): string {
  return lang === 'en'
    ? `/en/event/${encodeURIComponent(ev.id)}/${slugify(ev.title_en || ev.title)}/`
    : `/event/${encodeURIComponent(ev.id)}/${slugify(ev.title)}/`;
}

/** Вид главной: лента (список), календарь, только карта */
type MainView = 'feed' | 'calendar' | 'map';

interface MainViewState {
  view: MainView;
  mode: 'week' | 'month';
  date: string;
}

/** Вид и дата из URL: ?view=feed|calendar|map&mode=week|month&d=YYYY-MM-DD.
 *  Ссылка с этими параметрами шарится и открывается в нужном виде (ТЗ). */
function readMainView(): MainViewState {
  const q = new URLSearchParams(window.location.search);
  const v = q.get('view');
  const view: MainView = v === 'calendar' || v === 'feed' ? v : 'map';
  const mode = q.get('mode') === 'month' ? 'month' : 'week';
  const d = q.get('d') ?? '';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : todayIso();
  return { view, mode, date };
}

/** Записать вид в URL, не трогая путь и хэш (иначе ломается маршрут SPA) */
function writeMainView(v: MainViewState): void {
  const url = new URL(window.location.href);
  if (v.view === 'map') url.searchParams.delete('view');
  else url.searchParams.set('view', v.view);
  if (v.view === 'calendar') {
    if (v.mode === 'month') url.searchParams.set('mode', 'month');
    else url.searchParams.delete('mode');
    url.searchParams.set('d', v.date);
  } else {
    url.searchParams.delete('mode');
    url.searchParams.delete('d');
  }
  const next = `${url.pathname}${url.search}${url.hash}`;
  const cur = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (next !== cur) window.history.replaceState(null, '', next);
}

export default function Home({
  city,
  eventId,
  categoryId,
}: {
  city?: string;
  eventId?: string;
  categoryId?: string;
}) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const ru = i18n.language.startsWith('ru');

  // --- Данные ---
  const [events, setEvents] = useState<EventItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  // Прямая ссылка /event/<id>/... на событие, которого нет (удалено/скрыто):
  // вместо карты показываем блок «не найдено»
  const [eventNotFound, setEventNotFound] = useState(false);
  // Страница ПРОШЕДШЕГО (архивного) события: событие достаётся по id через
  // get_public_event (в активном наборе его нет) — /event/<id>/<slug>/ должен
  // открывать карточку, а не заглушку «событие не найдено».
  const [pastEvent, setPastEvent] = useState<EventItem | null>(null);

  // --- Состояние интерфейса ---
  // filters — активные фильтры. Применяются МГНОВЕННО при любом изменении
  // (как в Яндекс.Афише): черновика и кнопки «Найти» больше нет.
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  // Последний город, по которому ушёл запрос геокодинга (для гонок запросов)
  const geocodeCityRef = useRef('');
  const [selected, setSelected] = useState<EventItem | null>(null);
  const [center, setCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [zoom, setZoom] = useState<number | undefined>(undefined);
  const [formOpen, setFormOpen] = useState(false);
  // Окно входа: гость кликнул сердечко «в избранное»
  const [authOpen, setAuthOpen] = useState(false);
  // Свёрнута ли левая панель фильтров (десктоп)
  const [filtersCollapsed, setFiltersCollapsed] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  // Кнопка «События на карте» — список событий видимой области
  // Вид главной и календарное состояние (в URL: ?view=&mode=&d=)
  const [mainView, setMainView] = useState<MainViewState>(readMainView);
  // Панель открыта во всех видах, кроме «карты» (поведение прежнего listOpen)
  const listOpen = mainView.view !== 'map';
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

  // Напоминания «за день»: id событий, по которым включено напоминание
  // (null — гость, колокольчик не показываем)
  const [reminderIds, setReminderIds] = useState<string[] | null>(null);

  useEffect(() => {
    if (!user) {
      setReminderIds(null);
      return;
    }
    getApi()
      .getMyReminders()
      .then((rows) => setReminderIds(rows.map((r) => r.event_id)))
      .catch(() => setReminderIds([]));
  }, [user]);

  /**
   * Переключение напоминания «за день». Без входа — окно входа (как избранное).
   * Включение: сначала push-подписка (иначе напоминание некуда доставить),
   * затем запись напоминания на дату «вхождение минус день» — для регулярных
   * серий это ближайшее вхождение по правилу повтора (nextOccurrenceDate).
   */
  async function toggleReminder(ev: EventItem): Promise<void> {
    if (!user) return;
    const on = reminderIds?.includes(ev.id) ?? false;
    const api = getApi();
    try {
      if (on) {
        await api.removeEventReminder(ev.id);
        setReminderIds((prev) => (prev ?? []).filter((id) => id !== ev.id));
        return;
      }
      if (pushSupported()) {
        if (typeof Notification !== 'undefined' && Notification.permission !== 'granted') {
          const perm = await Notification.requestPermission();
          if (perm !== 'granted') return; // без разрешения напоминание не доставить
        }
        const sub = await enablePush();
        if (sub) {
          const d = subscriptionData(sub);
          await api.pushSubscribe(d.endpoint, d.p256dh, d.auth);
        }
      }
      const occurrence = nextOccurrenceDate(ev, todayIso());
      await api.setEventReminder(ev.id, addDaysIso(occurrence, -1));
      setReminderIds((prev) => [...(prev ?? []), ev.id]);
    } catch {
      // Напоминания не должны ломать карточку: молча ничего не меняем
    }
  }

  // Мобильный интро-экран (вместо живой карты на <768px до клика по кнопке).
  // dismissed — пользователь открыл карту (localStorage), gone — анимация
  // затухания завершена, экран можно размонтировать.
  const [introDismissed, setIntroDismissed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(MAP_INTRO_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [introGone, setIntroGone] = useState<boolean>(introDismissed);
  const [isMobile, setIsMobile] = useState<boolean>(() =>
    window.matchMedia(MOBILE_INTRO_QUERY).matches,
  );
  useEffect(() => {
    const m = window.matchMedia(MOBILE_INTRO_QUERY);
    const onViewport = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    m.addEventListener('change', onViewport);
    return () => m.removeEventListener('change', onViewport);
  }, []);

  // Десктопная ширина (lg, 1024px): только с неё показываем видимую панель
  // блока главной — на меньших ширинах её место занимают карта и панели Home
  // (см. lib/mobileIntro.ts, HOME_PANEL_QUERY). Ширину читаем из matchMedia
  // ПРЯМО в момент пересчёта (в состоянии она может отстать: в headless-CDP
  // событие change медиазапроса не приходит), пересчёт — по resize окна.
  const [panelTick, setPanelTick] = useState(0);
  useEffect(() => {
    const onResize = () => setPanelTick((n) => n + 1);
    const m = window.matchMedia(HOME_PANEL_QUERY);
    window.addEventListener('resize', onResize);
    m.addEventListener('change', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      m.removeEventListener('change', onResize);
    };
  }, []);

  // Открыть живую карту: плавно скрыть интро и запомнить выбор
  function dismissIntro() {
    setIntroDismissed(true);
    try {
      localStorage.setItem(MAP_INTRO_KEY, '1');
    } catch {
      // localStorage недоступен (приватный режим) — просто скрываем до конца визита
    }
    window.setTimeout(() => setIntroGone(true), 550);
  }

  // Аккордеон: открытие панели на главной закрывает меню шестерёнки;
  // открытие меню шестерёнки закрывает панели главной
  useEffect(() => {
    const h = () => {
      setMobileFiltersOpen(false);
      setMainView((prev) => ({ ...prev, view: 'map' }));
    };
    window.addEventListener('close-home-panels', h);
    return () => window.removeEventListener('close-home-panels', h);
  }, []);

  function openFilters() {
    setMobileFiltersOpen(true);
    setMainView((prev) => ({ ...prev, view: 'map' }));
    window.dispatchEvent(new CustomEvent('close-gear-menu'));
  }
  // Вид и дата — в URL: ссылку можно переслать, при открытии страница
  // встаёт в нужный вид (?view=calendar&d=2026-09-21)
  useEffect(() => {
    writeMainView(mainView);
  }, [mainView]);

  /** Клик по сегменту переключателя: повторный клик по активному закрывает панель */
  function switchMainView(v: MainView): void {
    setMainView((prev) => ({ ...prev, view: prev.view === v ? 'map' : v }));
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

  // Закрытие карточки: на чистом URL события (/event/<id>/... или
  // /en/event/<id>/...) возвращаемся на главную ТЕКУЩЕГО языка (/en при
  // EN-версии); в остальных случаях URL карточку не кодирует — просто
  // убираем её (и чистим старую hash-ссылку #/?e=, если вдруг осталась)
  function closeCard() {
    setSelected(null);
    // <head>: возврат к мете текущего маршрута (категория, город или главная)
    applyCurrentMeta();
    if (window.location.pathname.startsWith('/event/')) {
      navigate(window.location.pathname.startsWith('/en/') ? '/en' : '/');
      return;
    }
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

  // --- Посадочные страницы «город × категория» (/bali/party/, Фаза 4) ---
  // Язык публичной страницы = из URL (как в пре-рендере), не из i18n.
  const seoLang: 'ru' | 'en' = isEnPath(window.location.pathname) ? 'en' : 'ru';
  /** Путь города текущего маршрута (bali|da-nang|nha-trang) */
  const pageCityPath: CityPath | null = city ? (cityPath(city) as CityPath | null) : null;
  /** Счётчики ячеек «город × категория» по активному набору */
  const cells = useMemo(() => categoryCells(events), [events]);
  /** Категория маршрута (null — маршрут не категорийный или категории нет) */
  const category = useMemo(
    () => (categoryId ? (categories.find((c) => c.id === categoryId) ?? null) : null),
    [categories, categoryId],
  );
  /** События ячейки, отсортированные по ближайшему вхождению */
  const categoryCellItems = useMemo(
    () =>
      pageCityPath && categoryId
        ? cellItems(events, pageCityPath, categoryId, (ev) => nextOccurrenceDate(ev, todayIso()))
        : [],
    [events, pageCityPath, categoryId],
  );
  /** Факты ячейки — из них собираются тексты и description (lib/categoryPages).
   *  Считаются и для ПУСТОГО набора активных событий: восстановленная ячейка
   *  (RESTORED_CELLS) без активных событий всё равно рисует h1/интро/FAQ — их
   *  тексты для count === 0 не зависят от данных и совпадают со статикой. */
  const categoryFacts = useMemo(
    () => (pageCityPath && categoryId ? cellFacts(categoryCellItems, seoLang) : null),
    [categoryCellItems, pageCityPath, categoryId, seoLang],
  );
  /** Сколько в ячейке активных событий с EN-версией: EN-страница существует
   *  ровно при >= MIN_CATEGORY_EVENTS (то же условие в пре-рендере —
   *  cellHasEnPage), поэтому же выводится hreflang-пара. */
  const categoryEnCount = useMemo(
    () =>
      categoryCellItems.filter(({ ev }) => Boolean(ev.title_en) || ev.source_lang === 'en').length,
    [categoryCellItems],
  );
  /** Гейт публикации страницы пары «город × категория».
   *  RU: прошла порог MIN_CATEGORY_EVENTS ИЛИ ячейка восстановлена
   *  (RESTORED_CELLS — URL из списка 404 GSC: страница отдаётся всегда);
   *  EN: только при >= MIN_CATEGORY_EVENTS EN-событий (у восстановленных
   *  ячеек EN-версии нет — их URL из GSC русские). */
  const categoryPageOk =
    !categoryId ||
    (pageCityPath !== null &&
      category !== null &&
      (seoLang === 'en'
        ? categoryEnCount >= MIN_CATEGORY_EVENTS
        : categoryPageExists(cells, pageCityPath, categoryId) ||
          isRestoredCell(pageCityPath, categoryId)));
  // Пары без набора событий страницы не имеют — существующая 404-заглушка
  const categoryNotFound = Boolean(categoryId) && !loading && !categoryPageOk;
  /** Видимый блок ячейки (h1 + интро + FAQ) — как статический seo-category-block */
  const categorySeo = useMemo(() => {
    if (!pageCityPath || !category || !categoryFacts) return null;
    return {
      h1: categoryH1(category, pageCityPath, seoLang),
      intro: categoryIntro(category, pageCityPath, seoLang, categoryFacts),
      faq: categoryFaq(category, pageCityPath, seoLang, categoryFacts),
    };
  }, [pageCityPath, category, categoryFacts, seoLang]);

  /** Восстановленная посадочная БЕЗ достатка активных событий: наполнение —
   *  блок «Прошедшие события этой категории в <городе>». Только RU: у
   *  восстановленных ячеек EN-версии нет (URL из GSC русские). */
  const restoredOnly = Boolean(
    pageCityPath &&
      categoryId &&
      seoLang === 'ru' &&
      isRestoredCell(pageCityPath, categoryId) &&
      categoryCellItems.length < MIN_CATEGORY_EVENTS,
  );
  /** Прошедшие события ячейки (RPC list_past_cell_events: фильтр по городу и
   *  категории + лимит делает БД — весь архив на страницу не грузим). */
  const [categoryArchive, setCategoryArchive] = useState<EventItem[]>([]);
  useEffect(() => {
    if (!restoredOnly || !pageCityPath || !categoryId) {
      setCategoryArchive([]);
      return;
    }
    let alive = true;
    getApi()
      .listPastCellEvents(pageCityPath, categoryId)
      .then((rows) => {
        if (alive) setCategoryArchive(rows);
      })
      .catch(() => {
        // Сеть/прав нет — блока прошедших не будет (страница остаётся с h1,
        // интро и FAQ: тексты при count === 0 от данных не зависят)
        if (alive) setCategoryArchive([]);
      });
    return () => {
      alive = false;
    };
  }, [restoredOnly, pageCityPath, categoryId]);
  /** Прошедшие события ячейки с датой последнего дня (порядок — из БД: свежие
   *  сверху, как в статическом блоке #seo-category-archive) */
  const categoryArchiveItems = useMemo(
    () =>
      categoryArchive.map((ev) => ({
        ev,
        date: String(ev.end_date || ev.start_date || '').slice(0, 10),
      })),
    [categoryArchive],
  );
  /** Категории города, у которых страница РЕАЛЬНО есть (перелинковка hub/spoke:
   *  город → категории): прошла порог MIN_CATEGORY_EVENTS или ячейка
   *  восстановлена (RESTORED_CELLS — страница есть всегда). На EN-странице
   *  города — только ячейки с EN-версией страницы (иначе ссылка вела бы в 404):
   *  то же условие, что у EN-страницы ячейки в пре-рендере. */
  const cityCategoryLinks = useMemo(
    () =>
      pageCityPath
        ? categories
            .filter((c) => {
              const published =
                categoryPageExists(cells, pageCityPath, c.id) || isRestoredCell(pageCityPath, c.id);
              if (!published) return false;
              if (seoLang !== 'en') return true;
              return categoryEnCountIn(events, pageCityPath, c.id) >= MIN_CATEGORY_EVENTS;
            })
            .map((c) => ({
              id: c.id,
              href: categoryPageHref(pageCityPath, c.id, seoLang),
              label: `${c.emoji} ${seoLang === 'en' ? c.name_en : c.name_ru}`.trim(),
            }))
        : [],
    [categories, cells, events, pageCityPath, seoLang],
  );
  /** Ближайшие события города для городского SEO-блока (#city-seo-block):
   *  до MAX_CITY_EVENTS, только БУДУЩИЕ вхождения (nextOccurrenceDate >= today),
   *  по возрастанию даты — тот же отбор, что у статического блока города
   *  (scripts/seo-prerender.mjs: citySeoHtml / citySeoHtmlEn). На EN-странице
   *  остаются только события с EN-версией — иначе ссылка вела бы в 404.
   *  Данные — уже загруженный список (api.listEvents, кэш), запросов нет. */
  const cityUpcoming = useMemo(() => {
    if (!pageCityPath) return [];
    const today = todayIso();
    const en = seoLang === 'en';
    return events
      .filter(
        (ev) =>
          ev &&
          typeof ev.id === 'string' &&
          Boolean(ev.title) &&
          cityPath(ev.city) === pageCityPath &&
          (!en || Boolean(ev.title_en) || ev.source_lang === 'en'),
      )
      .map((ev) => ({ ev, occ: nextOccurrenceDate(ev, today) }))
      .filter((x) => Boolean(x.occ) && x.occ >= today)
      .sort((a, b) => a.occ.localeCompare(b.occ) || a.ev.id.localeCompare(b.ev.id))
      .slice(0, MAX_CITY_EVENTS)
      .map((x) => x.ev);
  }, [events, pageCityPath, seoLang]);
  /** Цена для списка ближайших событий — правила статики (citySeoHtml):
   *  price > 0 → «50 USD», donation → донат, price === 0 → бесплатно */
  function listPriceText(ev: EventItem): string {
    const price = ev.price != null ? Number(ev.price) : null;
    if (price != null && price > 0) {
      const code = (typeof ev.currency === 'string' && ev.currency ? ev.currency : 'usd').toUpperCase();
      return `${price} ${code}`;
    }
    if (ev.donation) return t('form.donation');
    if (price === 0) return t('card.free');
    return '';
  }
  /** Ссылка на категорию события (страница события) — только если страница
   *  пары (город, категория) существует (тот же гейт, что в статике) */
  const selectedCategoryLink = useMemo(() => {
    if (!selected) return null;
    // Ссылка живёт рядом со строкой «Ещё события в <город>: афиша» — она есть
    // только на странице события (/event/ и /en/event/), как titleAsH1
    const onEventPage =
      window.location.pathname.startsWith('/event/') ||
      window.location.pathname.startsWith('/en/event/');
    if (!onEventPage) return null;
    const cp = cityPath(selected.city) as CityPath | null;
    const cat = categories.find((c) => c.id === selected.category_id);
    if (!cp || !cat || !categoryPagePublished(cells, cp, cat.id)) return null;
    // На EN-странице события — только если у ячейки есть EN-страница
    if (seoLang === 'en' && categoryEnCountIn(events, cp, cat.id) < MIN_CATEGORY_EVENTS) {
      return null;
    }
    return {
      href: categoryPageHref(cp, cat.id, seoLang),
      label: `${cat.emoji} ${seoLang === 'en' ? cat.name_en : cat.name_ru}`.trim(),
    };
  }, [selected, categories, cells, events, seoLang]);

  /** Мета текущего маршрута: категория (Фаза 4) → город → главная.
   *  Категорийный маршрут без набора событий (гейт MIN_CATEGORY_EVENTS не
   *  пройден) — страница отдаёт 404-заглушку, мета базовая (canonical/og
   *  снимаются), как у неизвестных путей. */
  function applyCurrentMeta(): void {
    if (categoryId) {
      if (pageCityPath && category && categoryFacts && categoryPageOk) {
        // hreflang-пара выводится только у парных страниц: EN-страница ячейки
        // существует при >= MIN_CATEGORY_EVENTS EN-событий (как в пре-рендере)
        applyCategoryMeta(
          pageCityPath,
          category,
          categoryFacts,
          categoryEnCount >= MIN_CATEGORY_EVENTS,
        );
      } else if (!loading) {
        applyGenericMeta();
      }
      return;
    }
    if (city) {
      const ql = config.quickLocations.find((q) => q.labelEn === city);
      if (ql) applyCityMeta(slugify(ql.labelEn));
    } else if (!eventId) {
      applyHomeMeta();
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
      // Прямая ссылка /event/<id>/<slug> (или старая #/?e=<id>, App передаёт
      // eventId): открыть карточку события независимо от фильтров и заменить
      // URL на чистый /event/<id>/<slugify(title)> (или EN-версию
      // /en/event/<id>/<slugify(title_en||title)>/, если открыт EN-путь и у
      // события есть перевод; событие без EN-перевода по /en/event/... —
      // показываем как есть, canonical на RU URL ставит applyEventMeta)
      if (eventId) {
        const ev = evs.find((x) => x.id === eventId);
        if (ev) {
          selectEvent(ev);
          // Deep link: летим к координатам события, чтобы маркер был виден
          // рядом с карточкой (событие может быть в другом городе/стране).
          // Без координат — карточка открывается как раньше, карту не двигаем.
          if (ev.lat != null && ev.lng != null) {
            setCenter({ lat: ev.lat, lng: ev.lng });
            setZoom(15);
          }
          // URL уже чистый? Всё равно replaceState — убирает старый hash из
          // ссылки #/?e= и приводит slug к актуальному названию события.
          const enPath = window.location.pathname.startsWith('/en');
          const hasEn = Boolean(ev.title_en) || ev.source_lang === 'en';
          if (enPath && hasEn) {
            window.history.replaceState(
              null,
              '',
              `/en/event/${encodeURIComponent(ev.id)}/${slugify(ev.title_en || ev.title)}`,
            );
          } else if (!enPath) {
            window.history.replaceState(
              null,
              '',
              `/event/${encodeURIComponent(ev.id)}/${slugify(ev.title)}`,
            );
          }
          // enPath && !hasEn: URL не трогаем (EN-версии события нет —
          // canonical на RU URL ставит applyEventMeta)
        } else {
          // События нет в активном наборе: возможно, это страница ПРОШЕДШЕГО
          // события (архивное событие на карте не показывается, но его страница
          // существует — пре-рендер её собирает, GSC её индексирует). Пробуем
          // достать событие по id: RPC get_public_event отдаёт и архивные.
          let archived: EventItem | null = null;
          try {
            archived = await getApi().getPublicEvent(eventId);
          } catch {
            archived = null;
          }
          if (!alive) return;
          if (archived && archived.status === 'archived') {
            setPastEvent(archived);
            // Мета — как у статической страницы: canonical на сам URL события
            applyEventMeta(archived);
          } else {
            // События нет вовсе (удалено/скрыто) — вместо карты заглушка.
            // Глубокий URL мёртв — мета базовая, canonical/og снимаем (404)
            applyGenericMeta();
            setEventNotFound(true);
          }
        }
      }
    })();
    return () => {
      alive = false;
    };
    // Эффект первичной загрузки: событие ищется только при первом показе
    // страницы (App пересоздаёт Home по key при смене маршрута)
  }, [eventId]);

  // Мета <head> при монтировании: категория (/bali/party/, Фаза 4), город
  // (/bali) или главная. Маршрут события мету ставит сам после загрузки данных
  // (selectEvent или «не найдено»)
  useEffect(() => {
    applyCurrentMeta();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city, eventId, categoryId, category, categoryFacts, categoryPageOk, categoryEnCount, loading]);

  // При размонтировании (смена маршрута) снимаем мету события/города — head
  // доедет до верного состояния эффектами нового маршрута (новый Home/App)
  useEffect(() => {
    return () => {
      applyGenericMeta();
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

  // --- Мобильный интро-экран: видимость и превью ---
  // Путь нормализуем (deep-link /bali/ со слэшем = тот же маршрут, что /bali);
  // EN-версии (/en, /en/bali) — те же «карты», что RU (/ и /bali)
  const introRawPath = window.location.pathname;
  const introNorm =
    introRawPath.length > 1 ? introRawPath.replace(/\/+$/, '') : introRawPath;
  const introPath = introNorm.startsWith('/en')
    ? introNorm.replace(/^\/en/, '') || '/'
    : introNorm;
  const introPathEligible =
    !eventId &&
    !introPath.startsWith('/event/') &&
    introEligiblePath(introPath) &&
    !formOpen;
  const introShown = isMobile && !introGone && introPathEligible;
  const introActive = introShown && !introDismissed;
  // Пока интро активно, в DOM живут перенесённые main.tsx статические
  // SEO-блоки главной/города (h1 + городской текст + внутренние ссылки — их
  // видит краулер; см. lib/mobileIntro.ts). Как только интро закрыто (клик
  // «Открыть карту») или окно стало десктопным, SPA рисует свои блоки, а
  // перенесённые удаляем — иначе на странице было бы два h1.
  useEffect(() => {
    if (!introActive) dropIntroSeoBlocks();
  }, [introActive]);
  // Видимая панель блока главной (десктоп, beta 0.57): в DOM живёт статический
  // #seo-home-block, перенесённый main.tsx в #seo-home-panel. Показываем её
  // ровно тем же условием, что у городского блока (#city-seo-block ниже),
  // плюс требование десктопной ширины: на мобильном/планшете панель не нужна.
  useEffect(() => {
    setHomePanelHidden(
      !window.matchMedia(HOME_PANEL_QUERY).matches ||
        introActive ||
        !!selected ||
        listOpen ||
        mobileFiltersOpen ||
        formOpen ||
        authOpen,
    );
  }, [
    panelTick,
    introActive,
    selected,
    listOpen,
    mobileFiltersOpen,
    formOpen,
    authOpen,
  ]);
  // Статичное превью карты под текущую страницу: своё на город, общее — на главную
  const introPreview = city
    ? `/images/map-preview-${slugify(city)}.webp`
    : '/images/map-preview-main.webp';

  // Геолокация: центр на посетителе; при отказе — Юго-Восточная Азия.
  // На чистых маршрутах (/bali, /event/<id>) не трогаем: там центр и zoom
  // задаёт маршрут (город или координаты события). Пока активен интро-экран,
  // разрешение не запрашиваем — геопереход случится после открытия карты.
  useEffect(() => {
    if (!navigator.geolocation || city || eventId || introActive) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCenter({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setZoom(10);
      },
      () => {},
      { timeout: 5000 },
    );
  }, [city, eventId, introActive]);

  // Чистый URL города (/bali, /da-nang, /nha-trang) или пары «город ×
  // категория» (/bali/party/, Фаза 4): фильтр города + категории + центр/zoom.
  // Категория ставится как фильтр ДО проверки гейта — если страницы пары нет,
  // Home отдаёт 404-заглушку (проверка categoryNotFound ниже).
  useEffect(() => {
    if (!city) return;
    const ql = config.quickLocations.find((q) => q.labelEn === city);
    if (!ql) return;
    setFilters((f) => ({ ...f, city: ql.labelEn, ...(categoryId ? { categoryId } : {}) }));
    setCenter({ lat: ql.lat, lng: ql.lng });
    setZoom(ql.zoom);
  }, [city, categoryId]);

  // Смена фильтров на «странице-посадке» (город или город × категория)
  // обновляет URL — как требуют посадочные Фазы 4: сняли категорию → вернулись
  // на афишу города, сменили город → URL другого города. replaceState, а не
  // navigate: Home не перемонтируется (номер страницы для поисковиков уже
  // статический), состояние фильтров и карты сохраняется.
  // Первый прогон после загрузки пропускаем (флажок): к этому моменту фильтры
  // маршрута ещё не применены (эффект выше только поставил их в очередь), и
  // синхронизация по пустым фильтрам увела бы URL посадки на '/'.
  const syncArmed = useRef(false);
  useEffect(() => {
    if (loading || selected || formOpen) return;
    if (!syncArmed.current) {
      syncArmed.current = true;
      return;
    }
    const path = window.location.pathname;
    const pub = isEnPath(path) ? path.replace(/^\/en/, '') || '/' : path;
    // Только сами посадки: /<city>/ и /<city>/<category>/ (без /event/)
    if (!/^\/[a-z0-9-]+(\/[a-z0-9-]+)?\/?$/.test(pub)) return;
    if (!config.quickLocations.some((q) => pub === `/${slugify(q.labelEn)}` ||
      pub.startsWith(`/${slugify(q.labelEn)}/`))) {
      return;
    }
    const cp = cityPath(filters.city ?? '') as CityPath | null;
    let next = seoLang === 'en' ? '/en' : '/';
    if (cp) {
      const catId = filters.categoryId && categoryPageExists(cells, cp, filters.categoryId)
        ? filters.categoryId
        : null;
      next = catId ? categoryPageHref(cp, catId as string, seoLang) : `/${seoLang === 'en' ? 'en/' : ''}${cp}/`;
    }
    if (window.location.pathname !== next) {
      window.history.replaceState(null, '', next);
    }
  }, [filters.city, filters.categoryId, cells, loading, selected, formOpen, seoLang]);

  // Применение фильтров: категория, период, город, ключевые слова
  const visible = useMemo(() => events.filter((ev) => eventMatchesFilters(ev, filters)), [
    events,
    filters,
  ]);

  // Другие даты серии для открытой карточки (то же название + то же место,
  // другая дата): считаем по уже загруженному списку, без запросов —
  // api.listEvents кэширует (lib/series, логика как в seo-prerender.mjs)
  const selectedSeries = useMemo(
    () => (selected ? seriesSiblings(selected, events) : []),
    [selected, events],
  );

  // Похожие события для открытой карточки (тот же город + та же категория):
  // считаем по уже загруженному списку, без запросов (lib/similar — зеркало
  // логики scripts/seo-prerender.mjs, гейт MIN_SIMILAR внутри). Блок
  // выводится только на странице события (EventCard, titleAsH1).
  const selectedSimilar = useMemo(
    () => (selected ? similarEvents(selected, events, seoLang) : []),
    [selected, events, seoLang],
  );

  // События на видимом участке карты (bounds) + фильтры.
  // Без лимита: список и счётчик кнопки показывают ВСЕ события области.
  const onMapEvents = useMemo(() => {
    if (!bounds) return visible;
    const [sw, ne] = bounds;
    return visible.filter((ev) => {
      const lat = ev.lat;
      const lng = ev.lng;
      // Без координат (адрес есть, геокода нет) — не фильтровать по карте,
      // иначе событие исчезает из списка при перемещении карты
      if (lat == null || lng == null) return true;
      return lat >= sw[0] && lat <= ne[0] && lng >= sw[1] && lng <= ne[1];
    });
  }, [visible, bounds]);

  // Переход по быстрой кнопке направления
  function goTo(lat: number, lng: number, z: number) {
    setCenter({ lat, lng });
    setZoom(z);
  }

  // Геопереход к выбранному городу — только по подтверждённому выбору
  // (клик по варианту автокомплита или Enter в поле города), НЕ на каждый
  // символ ввода: свободный текст фильтрует список/карту, но не дёргает её.
  // Защита от гонок: geocodeCityRef помнит город последнего запроса.
  function handleCityCommit(city: string) {
    const c = city.trim();
    if (!c) return;
    geocodeCityRef.current = c;
    import('../lib/geocode')
      .then((m) => m.geocodeAddress(ruToEn(c)))
      .then((coords) => {
        if (coords && geocodeCityRef.current === c) {
          setCenter(coords);
          setZoom(11);
        }
      })
      .catch(() => {});
  }

  // Сброс фильтров (кнопка «Сбросить» в панели): инвалидируем геокодинг,
  // чтобы запоздавший ответ не увёз карту к городу после сброса.
  function resetFilters() {
    setFilters(DEFAULT_FILTERS);
    geocodeCityRef.current = '';
  }

  // Выбор события: карточка + запись в историю просмотров + счётчик просмотров.
  // Заголовок вкладки — «<название> · <город>» (SEO), при закрытии/уходе
  // возвращается исходный
  async function selectEvent(ev: EventItem) {
    setSelected(ev);
    // <head>: title «<название> · <город>», description, canonical и og —
    // как у статического пре-рендера (src/lib/seo.ts)
    applyEventMeta(ev);
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
    // Пока грузятся данные, на мобильных сразу показываем интро-экран
    // (первый кадр не ждёт Supabase — это и есть быстрый LCP). Живая карта
    // не монтируется до клика по кнопке.
    if (introShown) {
      return (
        <div className="map-screen relative w-full overflow-hidden bg-white">
          <div className="absolute inset-0 bg-white" />
          <div
            ref={headerRef}
            className="glass absolute inset-x-3 top-2 z-[1200] rounded-2xl shadow-lg"
            style={{ background: 'rgba(255, 255, 255, 0.32)' }}
          >
            <Header onOpenForm={() => setFormOpen(true)} />
          </div>
          {introShown && (
            <MobileMapIntro
              previewUrl={introPreview}
              leaving={introDismissed}
              onOpen={dismissIntro}
            />
          )}
        </div>
      );
    }
    return (
      <div className="flex min-h-screen flex-col">
        <Header onOpenForm={() => setFormOpen(true)} />
        <div className="flex flex-1 items-center justify-center text-sm text-gray-500">
          {t('common.loading')}
        </div>
      </div>
    );
  }

  // Посадочная страница «город × категория» без набора событий (пара не прошла
  // гейт MIN_CATEGORY_EVENTS) — существующая 404-заглушка, как у неизвестных
  // путей: страницы у такой пары нет и в статике (вне sitemap).
  if (categoryNotFound) {
    return <NotFound />;
  }

  // Страница ПРОШЕДШЕГО события (архивного): карточка с плашкой «Событие
  // прошло», фактами, блоком похожих ближайших событий и ссылкой на афишу
  // города. Живая карта не монтируется: событие архивное, на карте его нет —
  // показывать map ради пустого экрана незачем.
  if (pastEvent) {
    const pastCityHref = cityPageHref(pastEvent.city, seoLang) ?? (seoLang === 'en' ? '/en/' : '/');
    return (
      <div className="flex min-h-screen flex-col">
        <Header onOpenForm={() => setFormOpen(true)} />
        <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
          <EventCard
            event={pastEvent}
            categories={categories}
            onClose={() => navigate(seoLang === 'en' ? '/en/' : '/')}
            titleAsH1
            pastMode
            similarEvents={similarEvents(pastEvent, events, seoLang)}
          />
          <div className="mt-4">
            <a
              href={pastCityHref}
              className="inline-block rounded-md bg-[#72D2CF] px-4 py-2 text-sm font-semibold text-black shadow hover:bg-[#61B2B0]"
            >
              {t('card.pastCta')}
              {pastEvent.city ? `: ${pastEvent.city}` : ''}
            </a>
          </div>
        </div>
      </div>
    );
  }

  // Прямая ссылка на событие, которого нет (удалено/скрыто/завершено):
  // вместо карты — блок со ссылкой на главную
  if (eventNotFound) {
    return (
      <div className="flex min-h-screen flex-col">
        <Header onOpenForm={() => setFormOpen(true)} />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <p className="text-sm font-medium text-gray-700">
            {ru ? 'Событие не найдено или уже завершено' : 'Event not found or already over'}
          </p>
          <button
            onClick={() => navigate(window.location.pathname.startsWith('/en') ? '/en' : '/')}
            className="rounded-md bg-[#72D2CF] px-4 py-2 text-sm font-semibold text-black shadow hover:bg-[#61B2B0]"
          >
            {ru ? 'На главную' : 'Back to map'}
          </button>
        </div>
      </div>
    );
  }

  // Городской SEO-блок (h1 + интро + FAQ) — видимый текст страницы города
  // в SPA. Тексты ДУБЛИРУЮТ CITY_SEO/CITY_SEO_EN в scripts/seo-prerender.mjs
  // (держать синхронно: RU — ru.ts citySeo.* / CITY_SEO, EN — en.ts
  // citySeo.* / CITY_SEO_EN).
  const citySeo = (() => {
    if (!city) return null;
    const slug = slugify(city);
    const block = t(`citySeo.${slug}`, {
      returnObjects: true,
    }) as unknown;
    if (!block || typeof block === 'string') return null;
    const { h1, intro, faq } = block as {
      h1: string;
      intro: string;
      faq: { q: string; a: string }[];
    };
    if (!h1 || !intro || !Array.isArray(faq)) return null;
    return { h1, intro, faq };
  })();

  return (
    <div className="map-screen relative w-full overflow-hidden bg-white">
      {/* КАРТА НА ВЕСЬ ЭКРАН — фон сайта.
          Пока активен мобильный интро-экран, MapView (maplibre) НЕ монтируем:
          чанк карты и тайлы не запрашиваются до клика по кнопке (мобильный
          CWV). На десктопе (>=768px) интро не показывается — карта грузится
          как раньше. */}
      <div className="absolute inset-0">
        {introActive ? (
          <div className="absolute inset-0 bg-white" />
        ) : (
          <Suspense fallback={<div className="absolute inset-0 bg-white" />}>
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
                setMainView((prev) => ({ ...prev, view: 'map' }));
              }}
            />
          </Suspense>
        )}
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

      {/* Мобильный интро-экран: статичный скриншот карты + баннер с кнопкой.
          Пока он на экране — живая карта не смонтирована (см. выше). */}
      {introShown && (
        <MobileMapIntro
          previewUrl={introPreview}
          leaving={introDismissed}
          onOpen={dismissIntro}
        />
      )}

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
                filters={filters}
                onChange={setFilters}
                cities={allCities}
                countries={allCountries}
                count={visible.length}
                onShowResults={() => setMobileFiltersOpen(false)}
                onCityCommit={handleCityCommit}
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
              filters={filters}
              onChange={setFilters}
              cities={allCities}
              countries={allCountries}
              count={visible.length}
              onCityCommit={handleCityCommit}
              onReset={resetFilters}
            />
          </div>
        </div>
      )}

      {/* Городской SEO-блок (h1 + интро + FAQ + ссылки на категории) — видимый
          текст страницы /bali, /da-nang, /nha-trang. Единственный h1 городской
          страницы: бренд в шапке на city-путях не h1 (Header.tsx). Скрывается,
          когда открыты список событий / карточка / модалки — там свой контент.
          FAQ в <details>: вопросы видны, ответы раскрываются по клику.
          На маршруте «город × категория» городского блока нет — вместо него
          блок категории ниже (один h1 на страницу). */}
      {citySeo && pageCityPath && !categoryId && !introActive && !selected && !listOpen && !mobileFiltersOpen && !formOpen && !authOpen && (
        <div
          id="city-seo-block"
          className="glass absolute inset-x-2 bottom-36 z-[1140] mx-auto max-h-[42vh] w-auto max-w-xl overflow-y-auto rounded-xl p-3 shadow-xl thin-scroll lg:inset-x-auto lg:right-4 lg:mx-0 lg:w-[400px] lg:max-w-[calc(100vw-2rem)] lg:bottom-24"
        >
          <nav aria-label={seoLang === 'en' ? 'Breadcrumbs' : 'Хлебные крошки'}>
            <p className="mb-1 text-xs text-gray-500">
              <a href={seoLang === 'en' ? '/en/' : '/'} className="text-[#0F766E] hover:underline">
                {seoLang === 'en' ? 'Home' : 'Главная'}
              </a>
              <span aria-hidden="true"> › </span>
              <span>{seoLang === 'en' ? cityCrumbLabel(city, 'en') : cityCrumbLabel(city, 'ru')}</span>
              <span aria-hidden="true"> › </span>
              <span>{seoLang === 'en' ? "What's on" : 'Афиша'}</span>
            </p>
          </nav>
          <h1 className="text-lg font-extrabold tracking-tight text-gray-900">{citySeo.h1}</h1>
          <p className="mt-1 text-sm leading-relaxed text-gray-700">{citySeo.intro}</p>
          {/* Перелинковка направлений (хаб↔хаб), как в статическом блоке
              (scripts/seo-prerender.mjs: citySeoHtml/citySeoHtmlEn): с города
              ЮВА — на афишу Кипра, с Кипра — на три города. */}
          <p className="mt-1 text-sm leading-relaxed text-gray-700">
            {seoLang === 'en' ? 'Other destinations on MyPins: ' : 'Другие направления MyPins: '}
            {(pageCityPath === 'cyprus'
              ? ([['bali', seoLang === 'en' ? 'in Bali' : 'на Бали'], ['da-nang', seoLang === 'en' ? 'in Da Nang' : 'в Дананге'], ['nha-trang', seoLang === 'en' ? 'in Nha Trang' : 'в Нячанге']] as const)
              : ([['cyprus', seoLang === 'en' ? 'in Cyprus' : 'на Кипре']] as const)
            ).map(([path, label], i, arr) => (
              <span key={path}>
                <a href={`/${seoLang === 'en' ? 'en/' : ''}${path}/`} className="text-[#0F766E] hover:underline">
                  {label}
                </a>
                {i < arr.length - 1 ? ', ' : '.'}
              </span>
            ))}
          </p>
          {/* Ближайшие события города: до MAX_CITY_EVENTS, только будущие
              вхождения, по возрастанию даты — ссылки на страницы событий
              своего языка (как в статическом блоке города,
              scripts/seo-prerender.mjs: citySeoHtml / citySeoHtmlEn).
              Событий нет — секции нет. */}
          {cityUpcoming.length > 0 && (
            <div className="mt-2">
              <h2 className="text-sm font-medium text-gray-600">
                {t('citySeo.upcomingTitle', {
                  city:
                    seoLang === 'en' ? cityCrumbLabel(city, 'en') : cityCrumbLabelLocative(city),
                })}
              </h2>
              <ul className="mt-1 space-y-0.5">
                {cityUpcoming.map((ev) => {
                  const occ = nextOccurrenceDate(ev, todayIso());
                  const name =
                    seoLang === 'en'
                      ? ev.title_en || ev.title
                      : ev.title_ru || ev.title || ev.title_en;
                  const price = listPriceText(ev);
                  return (
                    <li key={ev.id} className="text-sm leading-relaxed text-gray-700">
                      <time dateTime={occ} className="text-gray-500">
                        {formatDate(occ, seoLang)}
                      </time>
                      {' — '}
                      <a href={cityEventHref(ev, seoLang)} className="text-[#0F766E] hover:underline">
                        {name}
                      </a>
                      {price ? (
                        <>
                          {' — '}
                          <span className="text-gray-500">{price}</span>
                        </>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          <h2 className="mt-2 text-xs font-bold uppercase tracking-wider text-gray-500">
            {t('citySeo.faqTitle')}
          </h2>
          {citySeo.faq.map((f) => (
            <details key={f.q} className="mt-1.5">
              <summary className="cursor-pointer text-sm font-semibold text-gray-800 hover:text-gray-900">
                {f.q}
              </summary>
              <p className="mt-1 text-sm leading-relaxed text-gray-600">{f.a}</p>
            </details>
          ))}
          {/* Перелинковка hub/spoke: категории этого города, прошедшие гейт
              (страницы существуют — битых ссылок нет). Ссылки как в статике
              (citySeoHtml: блок «Категории в городе»). */}
          {cityCategoryLinks.length > 0 && (
            <p className="mt-2 text-xs leading-relaxed text-gray-600">
              <span className="font-semibold text-gray-700">
                {categoriesBlockTitle(pageCityPath, seoLang)}:
              </span>{' '}
              {cityCategoryLinks.map((l, i) => (
                <span key={l.id}>
                  {i > 0 && <span className="text-gray-300"> · </span>}
                  <a href={l.href} className="text-[#0F766E] hover:underline">
                    {l.label}
                  </a>
                </span>
              ))}
            </p>
          )}
        </div>
      )}

      {/* SEO-блок посадочной страницы «город × категория» (/bali/party/,
          /en/bali/party/, Фаза 4): видимая крошка «Главная › город ›
          категория» (та же иерархия, что BreadcrumbList в JSON-LD статики),
          h1, интро и FAQ — тексты из единого источника lib/categoryPages
          (те же строки пишет статический блок id=seo-category-block).
          Один h1 на страницу: городской блок на этом маршруте скрыт. */}
      {categorySeo && pageCityPath && category && !introActive && !selected && !listOpen && !mobileFiltersOpen && !formOpen && !authOpen && (
        <div
          id="seo-category-block"
          className="glass absolute inset-x-2 bottom-36 z-[1140] mx-auto max-h-[42vh] w-auto max-w-xl overflow-y-auto rounded-xl p-3 shadow-xl thin-scroll lg:inset-x-auto lg:right-4 lg:mx-0 lg:w-[400px] lg:max-w-[calc(100vw-2rem)] lg:bottom-24"
        >
          <nav aria-label={seoLang === 'en' ? 'Breadcrumbs' : 'Хлебные крошки'}>
            <p className="mb-1 text-xs text-gray-500">
              <a href={seoLang === 'en' ? '/en/' : '/'} className="text-[#0F766E] hover:underline">
                {seoLang === 'en' ? 'Home' : 'Главная'}
              </a>
              <span aria-hidden="true"> › </span>
              <a
                href={`/${seoLang === 'en' ? 'en/' : ''}${pageCityPath}/`}
                className="text-[#0F766E] hover:underline"
              >
                {categoryCityName(pageCityPath, seoLang)}
              </a>
              <span aria-hidden="true"> › </span>
              <span>{seoLang === 'en' ? category.name_en : category.name_ru}</span>
            </p>
          </nav>
          <h1 className="text-lg font-extrabold tracking-tight text-gray-900">{categorySeo.h1}</h1>
          <p className="mt-1 text-sm leading-relaxed text-gray-700">{categorySeo.intro}</p>
          <h2 className="mt-2 text-xs font-bold uppercase tracking-wider text-gray-500">
            {t('citySeo.faqTitle')}
          </h2>
          {categorySeo.faq.map((f) => (
            <details key={f.q} className="mt-1.5">
              <summary className="cursor-pointer text-sm font-semibold text-gray-800 hover:text-gray-900">
                {f.q}
              </summary>
              <p className="mt-1 text-sm leading-relaxed text-gray-600">{f.a}</p>
            </details>
          ))}
          {/* Восстановленная ячейка без достатка активных событий: блок
              «Прошедшие события этой категории в <городе>» — то же наполнение,
              что у статического #seo-category-archive (свежие сверху, до
              RESTORED_ARCHIVE_LIMIT, ссылки на карточки RU-событий и на афишу
              города/карту). Данные — RPC list_past_cell_events. */}
          {categoryArchiveItems.length > 0 && (
            <div id="seo-category-archive" className="mt-2 border-t border-white/50 pt-2">
              <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500">
                {`Прошедшие события: ${category.name_ru} ${categoryWhere(pageCityPath, 'ru')}`}
              </h2>
              <ul className="mt-1 space-y-0.5 text-xs leading-relaxed text-gray-700">
                {categoryArchiveItems.map(({ ev, date }) => (
                  <li key={ev.id}>
                    {date && <time dateTime={date}>{formatDate(date)}</time>}
                    {date ? ' — ' : ''}
                    <a
                      href={`/event/${ev.id}/${slugify(ev.title)}/`}
                      className="text-[#0F766E] hover:underline"
                    >
                      {ev.title_ru || ev.title || ev.title_en || ''}
                    </a>
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-xs leading-relaxed text-gray-600">
                <a href={`/${pageCityPath}/`} className="text-[#0F766E] hover:underline">
                  {`Афиша ${categoryCityName(pageCityPath, 'ru')}`}
                </a>
                <span className="text-gray-300"> · </span>
                <a href="/" className="text-[#0F766E] hover:underline">
                  Карта событий MyPins
                </a>
              </p>
            </div>
          )}
          {/* Другие категории этого города живут на афише города (ссылка в
              крошке выше) — на странице категории их не дублируем: один h1,
              фокус на своей категории. */}
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
              onToggleFavorite={user ? toggleFavorite : () => setAuthOpen(true)}
              // Страница события /event/<id>/<slug> (и EN /en/event/...):
              // единственный h1 — название открытой карточки (бренд и
              // городской SEO-блок на этом маршруте не выводятся,
              // см. Header.isBrandH1)
              titleAsH1={
                window.location.pathname.startsWith('/event/') ||
                window.location.pathname.startsWith('/en/event/')
              }
              // Ссылка на посадочную категории этого события — только если
              // страница пары (город, категория) существует (тот же гейт,
              // что в статике: <MIN_CATEGORY_EVENTS событий — страницы нет)
              categoryLink={selectedCategoryLink}
              seriesEvents={selectedSeries}
              similarEvents={selectedSimilar}
              reminderIds={reminderIds}
              onToggleReminder={user ? toggleReminder : undefined}
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

      {/* Обратная связь поиска: плашка, если по активным фильтрам ничего
          не найдено (лоадера «searching» больше нет — фильтры мгновенные) */}
      {!isDefaultFilters(filters) && visible.length === 0 && (
        <div className="pointer-events-none absolute inset-x-0 top-1/2 z-[1165] flex -translate-y-1/2 justify-center px-4">
          <div className="glass max-w-sm rounded-xl px-4 py-3 text-center shadow">
            <p className="text-sm font-medium text-gray-900">{t('filters.empty')}</p>
            <p className="mt-1 text-xs text-gray-500">{t('filters.emptyHint')}</p>
          </div>
        </div>
      )}

      {/* Переключатель вида: Лента | Календарь | Карта.
          Вид и дата живут в URL (?view=…&mode=…&d=…), поэтому ссылку можно
          переслать, а при открытии страница встаёт в нужный вид. */}
      {!selected && (
        <div className="glass-btn bottom-safe absolute left-1/2 z-[1160] flex -translate-x-1/2 items-center gap-0.5 rounded-full p-1 shadow-lg">
          {(['feed', 'calendar', 'map'] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => switchMainView(v)}
              aria-pressed={mainView.view === v}
              className={`rounded-full px-3 py-1.5 text-sm font-semibold transition-colors ${
                mainView.view === v ? 'bg-gray-900 text-white' : 'text-gray-700 hover:bg-white/60'
              }`}
            >
              {t(`view.${v}`)}
            </button>
          ))}
        </div>
      )}

      {/* Панель под переключателем: лента событий или календарь.
          Лента — события текущего участка карты (как раньше), календарь —
          все отфильтрованные события (без привязки к границам карты). */}
      {listOpen && (
        <div
          id="events-list-panel"
          className={`glass absolute inset-x-0 bottom-28 z-[1130] mx-auto w-full overflow-y-auto rounded-xl p-3 shadow-xl thin-scroll ${
            mainView.view === 'calendar' ? 'max-h-[72vh] max-w-3xl' : 'max-h-[50vh] max-w-xl'
          }`}
        >
          {mainView.view === 'calendar' ? (
            <EventCalendar
              // События видимой области карты (как у ленты): календарь показывает
              // то, что сейчас на экране, а не всю базу (просьба Дмитрия 21.09)
              events={onMapEvents}
              categories={categories}
              mode={mainView.mode}
              date={mainView.date}
              selectedId={selected?.id ?? null}
              lang={seoLang}
              onSelect={selectEvent}
              onModeChange={(mode) => setMainView((prev) => ({ ...prev, mode }))}
              onDateChange={(d) => setMainView((prev) => ({ ...prev, date: d }))}
            />
          ) : (
            <>
              {onMapEvents.length === 0 && (
                <p className="py-4 text-center text-sm text-gray-500">{t('list.empty')}</p>
              )}
              <EventsList
                events={onMapEvents}
                categories={categories}
                selectedId={selected?.id ?? null}
                onSelect={selectEvent}
                favoriteIds={favoriteIds}
                onToggleFavorite={user ? toggleFavorite : () => setAuthOpen(true)}
              />
            </>
          )}
        </div>
      )}

      {formOpen && (
        <Suspense
          fallback={
            <div className="fixed inset-0 z-[2000] overflow-y-auto bg-black/25 p-4">
              <div className="flex min-h-full items-center justify-center">
                <div className="w-full max-w-2xl rounded-xl bg-white p-6 text-center shadow-2xl">
                  <p className="text-sm text-gray-500">{t('common.loading')}</p>
                </div>
              </div>
            </div>
          }
        >
          <EventForm
            categories={categories}
            onClose={() => {
              setFormOpen(false);
              loadData();
            }}
          />
        </Suspense>
      )}

      {/* Окно входа: гость кликнул сердечко «в избранное» (с пояснением) */}
      {authOpen && (
        <AuthModal onClose={() => setAuthOpen(false)} hint={t('auth.favoriteHint')} />
      )}
    </div>
  );
}
