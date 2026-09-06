import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Языки подключаются до первого рендера — интерфейс сразу на нужном языке
import './i18n';
import './index.css';
import App from './App';
import { AuthProvider } from './lib/auth';

// Статические SEO-блоки кладёт в HTML пре-рендер (scripts/seo-prerender.mjs):
// главная (h1+абзацы+ссылки, id=seo-home-block), городские страницы
// (h1+интро+события+FAQ, id=seo-city-block), профили
// организаторов (h1+bio, id=seo-org-block), страницы событий (h1+дата+место+
// цена+описание, id=seo-event-block), страницы блога (h1+секции статьи,
// id=seo-article-block), B2B-страница «Для организаторов» (h1+интро+секции+
// FAQ, id=seo-b2b-block) и страница «О проекте» (h1+секции,
// id=seo-about-block) — их видит краулер без JS. При
// живом React страницу рисует сам SPA (Home — городской текст из i18n,
// OrgProfilePage — свой h1, EventCard — h1 события, BlogIndex/ArticlePage —
// заголовок блога/статьи, ForOrganizers/About — свой h1), поэтому статические
// блоки удаляем — на странице должен остаться ровно один h1. Элементы есть
// только на пре-рендеренных страницах (/ и bali/da-nang/nha-trang, /org/<id>,
// /event/<id>/<slug>, /blog, /blog/<slug>, /for-organizers и /about).
document
  .querySelectorAll(
    '#seo-home-block, #seo-city-block, #seo-org-block, #seo-event-block, #seo-article-block, #seo-b2b-block, #seo-about-block',
  )
  .forEach((el) => el.remove());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
);

// Service worker (push-уведомления) — только production. Путь абсолютный от
// корня: на вложенных чистых URL (/event/<id>/...) относительная регистрация
// ушла бы в подпапку маршрута. Сайт развёрнут на корневом домене (mypins.site).
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .catch((err) => console.error('SW registration failed:', err));
  });
}
