// Трекер визитов по странам: fire-and-forget POST на публичную Edge Function
// track_visit (без JWT). Страна определяется на сервере по IP, IP не
// сохраняется. Ошибки сети/сервера молча игнорируются — трекинг не должен
// влиять на загрузку страницы.
import { config } from '../config';

export function trackVisit(): void {
  if (!config.supabaseUrl) return;
  const pagePath = (window.location.hash || window.location.pathname).slice(0, 500);
  const referrer = document.referrer.slice(0, 500);
  fetch(`${config.supabaseUrl}/functions/v1/track_visit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ page_path: pagePath, referrer }),
    // Не ждём ответа и не держим соединение ради трекинга
    keepalive: true,
  }).catch(() => {});
}
