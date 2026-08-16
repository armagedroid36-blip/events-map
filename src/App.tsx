// Точка входа приложения.
// Навигация по якорю: #/ — карта, #/admin — управление (админ),
// #/my-events — мои мероприятия (организатор), #/history — история просмотров.
// (Без внешнего роутера — для MVP достаточно, работает на любом хостинге.)
import { useEffect, useState } from 'react';
import Home from './pages/Home';
import Admin from './pages/Admin';
import MyEvents from './pages/MyEvents';
import HistoryPage from './pages/History';

export default function App() {
  const [route, setRoute] = useState(window.location.hash);

  useEffect(() => {
    const onHash = () => setRoute(window.location.hash);
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  if (route.startsWith('#/admin')) return <Admin />;
  if (route.startsWith('#/my-events')) return <MyEvents />;
  if (route.startsWith('#/history')) return <HistoryPage />;
  return <Home />;
}
