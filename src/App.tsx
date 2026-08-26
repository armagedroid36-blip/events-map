// Точка входа приложения.
// Навигация по якорю: #/ — карта, #/admin — управление (админ),
// #/my-events — мои мероприятия (организатор), #/history — история просмотров,
// #/privacy — политика конфиденциальности.
// (Без внешнего роутера — для MVP достаточно, работает на любом хостинге.)
import { lazy, Suspense, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { getApi } from './lib/api';

// Страницы грузятся по требованию (code-split): тяжёлые зависимости
// (карта Leaflet, админка) уходят в отдельные чанки, основной чанк меньше.
const Home = lazy(() => import('./pages/Home'));
const Admin = lazy(() => import('./pages/Admin'));
const MyEvents = lazy(() => import('./pages/MyEvents'));
const HistoryPage = lazy(() => import('./pages/History'));
const Privacy = lazy(() => import('./pages/Privacy'));
const Profile = lazy(() => import('./pages/Profile'));
const Favorites = lazy(() => import('./pages/Favorites'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const OrgProfilePage = lazy(() => import('./pages/OrgProfilePage'));
const UnsubscribePage = lazy(() => import('./pages/UnsubscribePage'));

export default function App() {
  const { t } = useTranslation();
  const [route, setRoute] = useState(window.location.hash);
  // Ссылка восстановления пароля: Supabase кладёт в hash
  // #access_token=...&type=recovery&... — рендерим страницу сброса
  const [recovery, setRecovery] = useState(() => window.location.hash.includes('type=recovery'));

  // Счётчик посещений: одна загрузка страницы = одно посещение
  useEffect(() => {
    getApi()
      .incrementCounter('visits')
      .catch(() => {});
  }, []);

  useEffect(() => {
    const onHash = () => setRoute(window.location.hash);
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  let page: ReactNode;
  if (recovery) page = <ResetPassword onFinish={() => setRecovery(false)} />;
  else if (route.startsWith('#/admin')) page = <Admin />;
  else if (route.startsWith('#/my-events')) page = <MyEvents />;
  else if (route.startsWith('#/history')) page = <HistoryPage />;
  else if (route.startsWith('#/privacy')) page = <Privacy />;
  else if (route.startsWith('#/profile')) page = <Profile />;
  else if (route.startsWith('#/favorites')) page = <Favorites />;
  else if (route.startsWith('#/org/'))
    page = <OrgProfilePage orgId={decodeURIComponent(route.slice('#/org/'.length))} />;
  else if (route.startsWith('#/unsubscribe')) page = <UnsubscribePage />;
  else page = <Home />;

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
