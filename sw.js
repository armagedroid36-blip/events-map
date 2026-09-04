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
