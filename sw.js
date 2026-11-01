// Service worker: push-уведомления о новых событиях.
// Работает и из подпапки (/events-map/), и из корня домена: все пути
// строятся от self.registration.scope, поэтому иконка и ссылка перехода
// всегда указывают на тот же каталог, где лежит сам sw.js.
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Push: показываем уведомление с данными из payload.
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    // не-JSON payload — покажем общее уведомление
  }
  const title = data.title || 'События на карте';
  const options = {
    body: data.body || '',
    icon: data.icon || `${self.registration.scope}favicon.png`,
    badge: data.icon || `${self.registration.scope}favicon.png`,
    data: { url: data.url || self.registration.scope },
  };
  if (data.tag) options.tag = data.tag;
  event.waitUntil(self.registration.showNotification(title, options));
});

// Клик по уведомлению: фокусируем открытую вкладку сайта или открываем новую.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || self.registration.scope;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of windows) {
        try {
          const clientUrl = new URL(client.url);
          const targetUrl = new URL(url);
          if (clientUrl.origin === targetUrl.origin) {
            await client.focus();
            if (clientUrl.pathname !== targetUrl.pathname || clientUrl.search !== targetUrl.search) {
              await client.navigate(url);
            }
            return;
          }
        } catch {
          // невалидный url — пробуем следующую вкладку
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});

// base64url -> Uint8Array (applicationServerKey для переподписки).
// VAPID public key дублирует config.vapidPublicKey (публичный, не секрет) —
// sw.js не бандлится, импортировать из src нельзя.
const VAPID_PUBLIC_KEY =
  'BETuziM1TY17y3z_rCvYbP5hbmqEfIomCX1BYLUnrFAZSLLGypumv9OuSAfTYYpFquJZ07xFo5x8oc9NJOY7CUY';
function urlBase64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

// Push-сервис перевыпустил подписку (endpoint устарел): подписываемся заново
// с тем же VAPID-ключом и сообщаем открытым вкладкам — они обновят endpoint
// в базе (страницы сами пишут в БД: у них есть сессия/ключи).
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const sub = await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });
        const clients = await self.clients.matchAll({ type: 'window' });
        for (const c of clients) {
          c.postMessage({ type: 'push-subscription-changed', endpoint: sub.endpoint });
        }
      } catch (err) {
        console.error('Resubscribe failed:', err);
      }
    })(),
  );
});

self.addEventListener('fetch', () => {
  // PWA installability: обработчик fetch требуется для установки. Сеть НЕ
  // перехватываем: контент всегда свежий, кэш GitHub Pages не ломаем.
});
