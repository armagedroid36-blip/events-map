// Точка входа приложения.
// Простая навигация по якорю: #/ — главная страница, #/admin — админка.
// (Без внешнего роутера — для MVP достаточно, работает на любом хостинге.)
import { useEffect, useState } from 'react';
import Home from './pages/Home';
import Admin from './pages/Admin';

export default function App() {
  const [route, setRoute] = useState(window.location.hash);

  useEffect(() => {
    const onHash = () => setRoute(window.location.hash);
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  return route.startsWith('#/admin') ? <Admin /> : <Home />;
}
