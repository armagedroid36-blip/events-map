// Push-уведомления: хелперы для браузера.
// Регистрация service worker'а — в main.tsx (только production).
import { config } from '../config';

/** base64url (VAPID-ключ) -> Uint8Array для applicationServerKey */
export function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  // Явный ArrayBuffer: TS отличает Uint8Array<ArrayBuffer> от
  // Uint8Array<ArrayBufferLike> (SharedArrayBuffer) — PushManager требует первый
  const buf = new ArrayBuffer(raw.length);
  const arr = new Uint8Array(buf);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

/** Данные подписки для записи в БД (endpoint, p256dh, auth) */
export function subscriptionData(sub: PushSubscription): { endpoint: string; p256dh: string; auth: string } {
  const j = sub.toJSON();
  return { endpoint: j.endpoint ?? '', p256dh: j.keys?.p256dh ?? '', auth: j.keys?.auth ?? '' };
}

/** Поддерживает ли браузер push (secure context + service worker) */
export function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/** Текущая подписка браузера (если уже включена) */
export async function getBrowserSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  try {
    const reg = await navigator.serviceWorker.ready;
    return await reg.pushManager.getSubscription();
  } catch {
    return null;
  }
}

/**
 * Включить push в браузере: создаёт подписку (если ещё нет) с нашим
 * VAPID-ключом. Разрешение Notification.requestPermission() запрашивает
 * вызывающий код (по клику).
 */
export async function enablePush(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  if (!config.vapidPublicKey) throw new Error('VAPID key missing');
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(config.vapidPublicKey),
    });
  }
  return sub;
}

/** Выключить push в браузере: отписаться локально (БД чистит вызывающий код) */
export async function disablePush(): Promise<void> {
  if (!pushSupported()) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) await sub.unsubscribe();
  } catch {
    // локальная отписка не критична — сервер сам почистит мёртвые подписки
  }
}
