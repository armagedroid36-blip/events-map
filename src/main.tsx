import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Языки подключаются до первого рендера — интерфейс сразу на нужном языке
import './i18n';
import './index.css';
import App from './App';
import { AuthProvider } from './lib/auth';

// Статический SEO-блок города (h1+интро+FAQ, RU) кладёт в HTML пре-рендер
// (scripts/seo-prerender.mjs) — его видит краулер без JS. При живом React
// городскую страницу рисует сам Home (тот же текст из i18n, локализованный),
// поэтому статический блок удаляем — на странице должен остаться ровно один
// h1. Элемент есть только на городских страницах (bali/da-nang/nha-trang).
document.getElementById('seo-city-block')?.remove();

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
