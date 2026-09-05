import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Языки подключаются до первого рендера — интерфейс сразу на нужном языке
import './i18n';
import './index.css';
import App from './App';
import { AuthProvider } from './lib/auth';

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
