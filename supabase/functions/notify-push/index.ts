// Мгновенные push-уведомления о публикации события организатора.
// Вызывается триггером events (pg_net) при переходе события в status='active'
// (INSERT active / UPDATE -> active по approve_event), payload — формат
// Database Webhook Supabase: {type, table, schema, record, old_record}.
// Доставка: Web Push (VAPID) подписчикам org_push_subscriptions организатора.
// env: WEBHOOK_SECRET, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
// (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY подставляются автоматически).
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import * as webpush from 'jsr:@negrel/webpush@0.5.0';

const WEBHOOK_SECRET = Deno.env.get('WEBHOOK_SECRET') || '';
const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY') || '';
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY') || '';
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:onthemap@inbox.ru';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const FALLBACK_ORIGIN = 'https://mypins.site';

// --- base64url -> bytes / bytes -> base64url ---
function b64urlToBytes(s: string): Uint8Array {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const b64 = (s + pad).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function bytesToB64url(b: Uint8Array): string {
  let bin = '';
  for (const x of b) bin += String.fromCharCode(x);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// VAPID в формате web-push (публичный raw 65 байт: 0x04|x|y, приватный raw 32 байта)
// -> JWK (ECDSA P-256) для @negrel/webpush. ВАЖНО: публичный JWK БЕЗ 'd'
// (иначе Web Crypto считает ключ приватным и падает 'Invalid key usage').
function vapidKeysToJwk(): { publicKey: JsonWebKey; privateKey: JsonWebKey } {
  const pub = b64urlToBytes(VAPID_PUBLIC);
  if (pub.length !== 65 || pub[0] !== 4) throw new Error('VAPID public key: expected 65-byte uncompressed EC point');
  const x = bytesToB64url(pub.slice(1, 33));
  const y = bytesToB64url(pub.slice(33, 65));
  const priv = b64urlToBytes(VAPID_PRIVATE);
  if (priv.length !== 32) throw new Error('VAPID private key: expected 32 bytes');
  return {
    publicKey: { kty: 'EC', crv: 'P-256', x, y },
    privateKey: { kty: 'EC', crv: 'P-256', x, y, d: bytesToB64url(priv) },
  };
}

/** Короткая локализованная дата начала: '5 сен' / 'Sep 5' */
function shortDate(iso: string | null | undefined, lang: string): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return '';
  const [, m, d] = iso.match(/^(\d{4})-(\d{2})-(\d{2})/)!;
  const month = Number(m);
  if (lang === 'ru') {
    const ru = ['', 'янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
    return `${Number(d)} ${ru[month]}`;
  }
  const en = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${en[month]} ${Number(d)}`;
}

interface WebhookRecord {
  id?: string | null;
  owner_id?: string | null;
  status?: string | null;
  start_date?: string | null;
  title?: string | null;
  title_ru?: string | null;
  title_en?: string | null;
}
interface SubRow {
  endpoint: string;
  p256dh: string;
  auth: string;
  lang: string;
  site_origin: string;
}

async function deliver(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const out = { skipped: '', sent: 0, removed: 0, errors: 0 };
  const rec = (body.record ?? {}) as WebhookRecord;
  const oldRec = (body.old_record ?? null) as WebhookRecord | null;
  if (body.type !== 'INSERT' && body.type !== 'UPDATE') return { ...out, skipped: 'not-insert-or-update' };
  if (rec.status !== 'active') return { ...out, skipped: 'not-active' };
  if (body.type === 'UPDATE' && (!oldRec || oldRec.status === 'active')) {
    return { ...out, skipped: 'not-transition-to-active' };
  }
  const ownerId: string | undefined = rec.owner_id ?? undefined;
  if (!ownerId) return { ...out, skipped: 'no-owner' };
  const eventId: string | undefined = rec.id ?? undefined;
  if (!eventId) return { ...out, skipped: 'no-id' };
  // Событие уже началось на момент публикации — не будим про прошедшее
  const today = new Date().toISOString().slice(0, 10);
  if (typeof rec.start_date === 'string' && rec.start_date < today) return { ...out, skipped: 'past-start' };
  out.skipped = 'none';

  // Имя организатора (title пуша) + подписчики
  let orgName = '';
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?select=display_name&id=eq.${ownerId}`,
      { headers: { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}` } },
    );
    if (r.ok) {
      const rows = (await r.json()) as { display_name: string | null }[];
      orgName = rows[0]?.display_name || '';
    }
  } catch (e) {
    console.error('org name fetch failed:', String(e));
  }

  const subsRes = await fetch(
    `${SUPABASE_URL}/rest/v1/org_push_subscriptions?select=endpoint,p256dh,auth,lang,site_origin&org_id=eq.${ownerId}`,
    { headers: { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}` } },
  );
  if (!subsRes.ok) throw new Error(`subs fetch ${subsRes.status}`);
  const subs = (await subsRes.json()) as SubRow[];

  const appServer = await webpush.ApplicationServer.new({
    contactInformation: VAPID_SUBJECT,
    vapidKeys: await webpush.importVapidKeys(vapidKeysToJwk()),
  });

  for (const sub of subs) {
    const endpoint = sub.endpoint;
    const lang = sub.lang === 'ru' ? 'ru' : 'en';
    try {
      // Дедуп: (endpoint, event_id) уже слали -> повторный webhook/ретрай молчит
      const dres = await fetch(`${SUPABASE_URL}/rest/v1/push_deliveries`, {
        method: 'POST',
        headers: { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint, event_id: eventId }),
      });
      if (dres.status === 409) continue; // уже отправлено ранее
      if (!dres.ok) {
        console.error(`dedup insert ${dres.status}: ${await dres.text()}`);
        continue;
      }

      const titleText = lang === 'ru'
        ? (rec.title_ru || rec.title || rec.title_en || '')
        : (rec.title_en || rec.title || rec.title_ru || '');
      const date = shortDate(rec.start_date, lang);
      const subscriber = appServer.subscribe({ endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } });
      await subscriber.pushTextMessage(
        JSON.stringify({
          title: orgName || (lang === 'ru' ? 'Новое событие' : 'New event'),
          body: `${titleText}${date ? ' · ' + date : ''}`,
          url: `${(sub.site_origin || FALLBACK_ORIGIN).replace(/\/+$/, '')}/#/?e=${eventId}`,
        }),
        { ttl: 60 * 60 * 24, urgency: webpush.Urgency.High },
      );
      out.sent += 1;
    } catch (e) {
      const status = e instanceof webpush.PushMessageError ? e.response.status : 0;
      if (status === 404 || status === 410) {
        try {
          await fetch(
            `${SUPABASE_URL}/rest/v1/org_push_subscriptions?org_id=eq.${ownerId}&endpoint=eq.${encodeURIComponent(endpoint)}`,
            { method: 'DELETE', headers: { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}` } },
          );
          out.removed += 1;
        } catch (de) {
          console.error('dead-sub delete failed:', String(de));
        }
      } else {
        // 429/сетевые и прочие — не роняем, дедуп не снимаем (строка не вставлена
        // только при успешной вставке... нет: вставка была ДО отправки — при сбое
        // доставки повторный webhook уже не придёт; это приемлемо для этой итерации)
        out.errors += 1;
        console.error(`push failed (${status || 'network'}): ${String(e).slice(0, 300)}`);
      }
    }
  }
  return out;
}

serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });
  if (req.headers.get('x-webhook-secret') !== WEBHOOK_SECRET) {
    return new Response('unauthorized', { status: 401 });
  }
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response('bad json', { status: 400 });
  }
  try {
    const result = await deliver(body);
    console.log('notify-push:', JSON.stringify(result));
    return new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('notify-push error:', String(e));
    return new Response('internal error: ' + String(e).slice(0, 500), { status: 500 });
  }
});
