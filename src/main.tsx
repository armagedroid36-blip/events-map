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

// Service worker (push-уведомления) — только production; путь строится от
// document.baseURI, поэтому работает и в корне домена, и в подпапке /events-map/.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(new URL('sw.js', document.baseURI).href)
      .catch((err) => console.error('SW registration failed:', err));
  });
}
