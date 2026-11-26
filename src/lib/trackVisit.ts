// Трекер визитов: fire-and-forget POST на публичную Edge Function track_visit
// (без JWT). Страна и провайдер определяются на сервере по IP, IP не
// сохраняется. Дополнительно отправляем часовой пояс и язык браузера — по ним
// сервер отличает заходы через VPN от реальных посетителей (вердикт
// user / suspect_vpn / bot). Ошибки сети/сервера молча игнорируются —
// трекинг не должен влиять на загрузку страницы.
import { config } from '../config';

/** Часовой пояс браузера: 'Europe/Moscow'. Ошибка/недоступность → 'unknown' */
function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown';
  } catch {
    return 'unknown';
  }
}

/** Язык браузера: 'ru-RU'. Пусто → 'unknown' */
function browserLang(): string {
  try {
    return navigator.language || 'unknown';
  } catch {
    return 'unknown';
  }
}

export function trackVisit(): void {
  if (!config.supabaseUrl) return;
  // Страница входа: чистый путь без query и хэша (функция всё равно вырежет их,
  // но так в теле запроса нет лишнего). Хэш-маршруты приватных разделов (#/admin)
  // дают '/', в статистику источников они как посадочные не попадают.
  const pagePath = window.location.pathname.slice(0, 200);
  const referrer = document.referrer.slice(0, 500);
  fetch(`${config.supabaseUrl}/functions/v1/track_visit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      page_path: pagePath,
      referrer,
      tz: browserTimeZone(),
      lang: browserLang(),
    }),
    // Не ждём ответа и не держим соединение ради трекинга
    keepalive: true,
  }).catch(() => {});
}
