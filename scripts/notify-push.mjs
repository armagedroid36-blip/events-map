// Push-уведомления о новых событиях (браузерные подписки).
// Ежедневно (шаг в notify-subscribers.yml, cron 04:00 UTC):
// 1. события status='active', созданные за последние 24 часа;
// 2. все подписки из push_subscriptions;
// 3. каждой — web-push sendNotification; 404/410 (подписка умерла) — удаляем.
import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
// Куда ведёт клик по уведомлению (основной адрес сайта)
const SITE_URL = (process.env.SITE_URL || '').trim() || 'https://mypins.site/';

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('Нужны переменные: SUPABASE_URL, SUPABASE_SERVICE_ROLE');
  process.exit(1);
}
if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
  console.error('Нужны VAPID-ключи: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY');
  process.exit(1);
}

webpush.setVapidDetails('mailto:dima.armagedroid@yandex.ru', VAPID_PUBLIC, VAPID_PRIVATE);

const db = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

const PERIOD_HOURS = 24;

async function main() {
  const since = new Date(Date.now() - PERIOD_HOURS * 3600 * 1000).toISOString();

  // 1. Новые активные события за период
  const { data: events, error: evErr } = await db
    .from('events')
    .select('title_ru, title_en, title, city, start_date')
    .eq('status', 'active')
    .gte('created_at', since)
    .order('created_at', { ascending: false });

  if (evErr) throw evErr;

  if (!events || events.length === 0) {
    console.log('Новых событий за 24 часа нет — push не отправляем');
    return;
  }

  // 2. Все браузерные подписки
  const { data: subs, error: subsErr } = await db.from('push_subscriptions').select('endpoint, p256dh, auth');
  if (subsErr) throw subsErr;

  if (!subs || subs.length === 0) {
    console.log(`Событий: ${events.length}, но подписок на push нет`);
    return;
  }

  // Тело уведомления: «N новых: первые два названия — город»
  const names = events
    .slice(0, 2)
    .map((e) => {
      const title = (e.title_ru || e.title_en || e.title || '').trim();
      const city = (e.city || '').trim();
      return city ? `${title} — ${city}` : title;
    })
    .filter(Boolean)
    .join(', ');

  const payload = JSON.stringify({
    title: 'Новые события на карте',
    body: events.length === 1 ? `Новое: ${names}` : `Новых: ${events.length} — ${names}`,
    url: SITE_URL,
    tag: `new-events-${new Date().toISOString().slice(0, 10)}`,
  });

  let sent = 0;
  let removed = 0;

  for (const sub of subs || []) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
        { TTL: 60 * 60 * 24 },
      );
      sent += 1;
    } catch (err) {
      const code = err?.statusCode;
      if (code === 404 || code === 410) {
        // Подписка умерла (браузер отозвал/перевыпустил) — чистим базу
        await db.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
        removed += 1;
        console.log(`Удалена мёртвая подписка (${code}): ${String(sub.endpoint).slice(0, 60)}…`);
      } else {
        console.error(`Ошибка отправки (${code ?? 'unknown'}): ${err?.message ?? err}`);
      }
    }
  }

  console.log(`Событий: ${events.length}, подписок: ${subs.length}, Отправлено: ${sent}, удалено мёртвых: ${removed}`);
}

main().catch((err) => {
  console.error('Ошибка прогона notify-push:', err);
  process.exit(1);
});
