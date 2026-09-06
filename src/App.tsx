// Точка входа приложения.
// Публичная часть — «чистые» URL через History API (клиентская маршрутизация):
//   /                     — карта (главная),
//   /bali, /da-nang, /nha-trang — карта города с фильтром,
//   /event/<id>/<slug>    — карточка события,
//   /org/<id>             — публичный профиль организатора,
//   /blog, /blog/<slug>   — блог и статья,
//   /for-organizers       — B2B-страница «Для организаторов»,
//   /about                — страница «О проекте».
// Личные разделы остаются на hash: #/admin, #/my-events, #/profile,
// #/favorites, #/history, #/privacy, #/contacts, #/unsubscribe и recovery
// (#access_token). На пути '/' работает прежняя hash-логика; старые публичные
// hash-ссылки (#/?e=<id>, #/org/<id>) редиректят на чистые URL.
// Ограничение GitHub Pages: на неизвестные пути отдаётся 404.html (копия
// index.html) с кодом 404 — для SPA это нормально, хостинг не чинить.
import { lazy, Suspense, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { getApi } from './lib/api';
import { trackVisit } from './lib/trackVisit';
import { config } from './config';
import { navigate, slugify } from './lib/navigate';
import { applyGenericMeta } from './lib/seo';

// Страницы грузятся по требованию (code-split): тяжёлые зависимости
// (карта, админка) уходят в отдельные чанки, основной чанк меньше.
const Home = lazy(() => import('./pages/Home'));
const Admin = lazy(() => import('./pages/Admin'));
const MyEvents = lazy(() => import('./pages/MyEvents'));
const HistoryPage = lazy(() => import('./pages/History'));
const Privacy = lazy(() => import('./pages/Privacy'));
const Contacts = lazy(() => import('./pages/Contacts'));
const Profile = lazy(() => import('./pages/Profile'));
const Favorites = lazy(() => import('./pages/Favorites'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const OrgProfilePage = lazy(() => import('./pages/OrgProfilePage'));
const UnsubscribePage = lazy(() => import('./pages/UnsubscribePage'));
const BlogIndex = lazy(() => import('./pages/Blog').then((m) => ({ default: m.BlogIndex })));
const ArticlePage = lazy(() => import('./pages/Blog').then((m) => ({ default: m.ArticlePage })));
const ForOrganizers = lazy(() => import('./pages/ForOrganizers'));
const About = lazy(() => import('./pages/About'));

// Пути городов из быстрых кнопок: labelEn 'Bali'/'Da Nang'/'Nha Trang'
// → '/bali', '/da-nang', '/nha-trang'
const CITY_ROUTES = new Map<string, string>(
  config.quickLocations.map((q) => [`/${slugify(q.labelEn)}`, q.labelEn]),
);

/** Нормализация pathname: без хвостового слэша; /index.html и пустота → '/' */
function normPath(p: string): string {
  if (p === '/index.html') return '/';
  const s = p.replace(/\/+$/, '');
  return s === '' ? '/' : s;
}

/** Заглушка 404: неизвестный путь — простая страница, карта не показывается */
function NotFound() {
  const { i18n } = useTranslation();
  const ru = i18n.language.startsWith('ru');
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-white px-4 text-center">
      <div className="text-lg font-semibold text-gray-900">
        {ru ? '404 — страница не найдена' : '404 — page not found'}
      </div>
      <button
        onClick={() => navigate('/')}
        className="rounded-md bg-[#72D2CF] px-4 py-2 text-sm font-semibold text-black shadow hover:bg-[#61B2B0]"
      >
        {ru ? 'На главную' : 'Back to map'}
      </button>
    </div>
  );
}

export default function App() {
  const { t } = useTranslation();
  // path — чистый маршрут (pathname), route — hash (личные разделы на '/')
  const [path, setPath] = useState(() => normPath(window.location.pathname));
  const [route, setRoute] = useState(() => window.location.hash);
  // Ссылка восстановления пароля: Supabase кладёт в hash
  // #access_token=...&type=recovery&... — рендерим страницу сброса
  const [recovery, setRecovery] = useState(() => window.location.hash.includes('type=recovery'));

  // Счётчик посещений: одна загрузка страницы = одно посещение
  // (+ трекинг по странам через Edge Function)
  useEffect(() => {
    getApi()
      .incrementCounter('visits')
      .catch(() => {});
    trackVisit();
  }, []);

  useEffect(() => {
    // navigate() шлёт popstate; кнопки браузера «назад/вперёд» — тоже.
    // hash-переходы личных разделов приходят как hashchange.
    const onPop = () => {
      setPath(normPath(window.location.pathname));
      setRoute(window.location.hash);
    };
    const onHash = () => setRoute(window.location.hash);
    window.addEventListener('popstate', onPop);
    window.addEventListener('hashchange', onHash);
    return () => {
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('hashchange', onHash);
    };
  }, []);

  useEffect(() => {
    // Живые мета-теги head (src/lib/seo.ts). Home (карта/город/событие) ставит
    // их сам — у него данные события и города; здесь — страницы вне списка
    // (404, /org/<id>, личные hash-разделы): базовые title/description и БЕЗ
    // canonical/og — чужой canonical с прошлой страницы не оставляем
    // (в статическом index.html canonical/og нет вовсе).
    if (recovery) {
      applyGenericMeta();
      return;
    }
    if (path !== '/') {
      const isHomeRoute =
        path.startsWith('/event/') ||
        CITY_ROUTES.has(path) ||
        path === '/blog' ||
        path.startsWith('/blog/') ||
        path === '/for-organizers' ||
        path === '/about';
      // /blog, статьи, «Для организаторов» и «О проекте» мету ставят сами
      // (как Home)
      if (!isHomeRoute) applyGenericMeta();
      return;
    }
    const isPrivateRoute =
      route.startsWith('#/admin') ||
      route.startsWith('#/my-events') ||
      route.startsWith('#/history') ||
      route.startsWith('#/privacy') ||
      route.startsWith('#/contacts') ||
      route.startsWith('#/profile') ||
      route.startsWith('#/favorites') ||
      route.startsWith('#/org/') ||
      route.startsWith('#/unsubscribe');
    if (isPrivateRoute) applyGenericMeta();
    // Остальное на '/' — Home (карта/карточка события): мету ставит сам
  }, [path, route, recovery]);

  // Внутренние ссылки в SPA: hash-ссылки (#/...) на чистом пути (например
  // /bali) не сработали бы — hash-логика App живёт только на '/'. Перехватываем
  // клик и уходим на '/' с этим hash. На '/' — обычное поведение браузера.
  // Плюс чистые внутренние ссылки (href="/bali", "/blog/..." — тексты статей
  // блога, карточки /blog): открываем navigate() без перезагрузки страницы.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (
        e.defaultPrevented ||
        e.button !== 0 ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey
      ) {
        return;
      }
      const a = (e.target as Element | null)?.closest?.('a');
      if (!a || a.target === '_blank') return;
      const href = a.getAttribute('href');
      if (!href) return;
      if (href.startsWith('/') && !href.startsWith('//') && !href.startsWith('/#')) {
        // Внутренний чистый путь (город, статья блога, событие) — SPA-переход
        e.preventDefault();
        navigate(href);
        return;
      }
      if (!href.startsWith('#/')) return;
      if (window.location.pathname === '/') return; // на '/' hash работает как раньше
      e.preventDefault();
      navigate(href === '#/' ? '/' : `/${href}`);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  let page: ReactNode;
  if (recovery) {
    page = <ResetPassword onFinish={() => setRecovery(false)} />;
  } else if (path !== '/') {
    // --- Чистые URL: публичные страницы ---
    const evM = path.match(/^\/event\/([^/]+)(?:\/[^/]+)?$/);
    if (evM) {
      page = <Home key={`event:${evM[1]}`} eventId={decodeURIComponent(evM[1])} />;
    } else {
      const orgM = path.match(/^\/org\/([^/]+)$/);
      if (orgM) {
        page = <OrgProfilePage key={`org:${orgM[1]}`} orgId={decodeURIComponent(orgM[1])} />;
      } else if (path === '/blog') {
        page = <BlogIndex key="blog" />;
      } else {
        const artM = path.match(/^\/blog\/([^/]+)$/);
        if (artM) {
          // Неизвестный slug: ArticlePage сам рисует заглушку 404
          page = <ArticlePage key={`article:${artM[1]}`} slug={decodeURIComponent(artM[1])} />;
        } else if (path === '/for-organizers') {
          // «Для организаторов» — отдельная B2B-страница (контент в
          // forOrganizers.json), до проверки CITY_ROUTES
          page = <ForOrganizers key="for-organizers" />;
        } else if (path === '/about') {
          // «О проекте» — E-E-A-T-страница (контент в about.json),
          // до проверки CITY_ROUTES
          page = <About key="about" />;
        } else {
          const cityLabel = CITY_ROUTES.get(path);
          page = cityLabel ? (
            <Home key={`city:${cityLabel}`} city={cityLabel} />
          ) : (
            <NotFound key="404" />
          );
        }
      }
    }
  } else if (route.startsWith('#/admin')) {
    page = <Admin />;
  } else if (route.startsWith('#/my-events')) {
    page = <MyEvents />;
  } else if (route.startsWith('#/history')) {
    page = <HistoryPage />;
  } else if (route.startsWith('#/privacy')) {
    page = <Privacy />;
  } else if (route.startsWith('#/contacts')) {
    page = <Contacts />;
  } else if (route.startsWith('#/profile')) {
    page = <Profile />;
  } else if (route.startsWith('#/favorites')) {
    page = <Favorites />;
  } else if (route.startsWith('#/org/')) {
    // Старая ссылка #/org/<id> — сразу чистый URL /org/<id>
    const orgId = decodeURIComponent(route.slice('#/org/'.length).replace(/\/+$/, ''));
    window.history.replaceState(null, '', `/org/${encodeURIComponent(orgId)}`);
    page = <OrgProfilePage orgId={orgId} />;
  } else {
    // Старые ссылки на событие: #/?e=<id> или #/event/<id>/... → карточка;
    // Home сам заменит URL на чистый /event/<id>/<slug> после загрузки
    const em = route.match(/[?&]e=([^&]+)/);
    const eventId = em
      ? decodeURIComponent(em[1])
      : route.startsWith('#/event/')
        ? decodeURIComponent(route.slice('#/event/'.length).split('/')[0])
        : undefined;
    if (eventId) {
      page = <Home key={`event:${eventId}`} eventId={eventId} />;
    } else if (route.startsWith('#/unsubscribe')) {
      page = <UnsubscribePage />;
    } else {
      page = <Home key="home" />;
    }
  }

  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-sm text-gray-400">
          {t('common.loading')}
        </div>
      }
    >
      {page}
    </Suspense>
  );
}
