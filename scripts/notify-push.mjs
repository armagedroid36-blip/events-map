// Push-уведомления (браузерные подписки). Ежедневно, шаг в notify-subscribers.yml
// (cron 04:00 UTC), два прохода:
//   A. НОВЫЕ СОБЫТИЯ: события status='active' за последние 24 часа → всем
//      подпискам из push_subscriptions; 404/410 — подписку удаляем.
//   B. НАПОМИНАНИЯ «ЗА ДЕНЬ» (промпт 21.09.2026): RPC reminders_due(p_on) отдаёт
//      непереданные напоминания на сегодня (таблица event_reminders), каждому
//      владельцу шлём push по его подпискам и помечаем sent_at — повторно одно
//      напоминание не уходит.
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

async function sendNewEvents() {
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

/**
 * Проход B: напоминания «за день». Напоминания хранит таблица event_reminders
 * (user_id, event_id, remind_on, sent_at). RPC reminders_due возвращает то, что
 * надо отправить сегодня; после отправки строки помечаются sent_at, поэтому
 * повторный прогон в тот же день ничего не отправит.
 */
async function sendReminders() {
  const today = new Date().toISOString().slice(0, 10);
  const { data: due, error } = await db.rpc('reminders_due', { p_on: today });
  if (error) {
    // Нет доступа/таблицы — не валим весь прогон: новые события уже разосланы
    console.error('reminders_due недоступен:', error.message);
    return;
  }
  if (!due || due.length === 0) {
    console.log('Напоминаний на сегодня нет');
    return;
  }

  // Подписки всех, кому напоминаем: один запрос на пачку из 50 пользователей
  const userIds = [...new Set(due.map((r) => r.user_id))];
  const subsByUser = new Map();
  for (let i = 0; i < userIds.length; i += 50) {
    const { data: subs } = await db
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth, user_id')
      .in('user_id', userIds.slice(i, i + 50));
    for (const s of subs ?? []) {
      if (!subsByUser.has(s.user_id)) subsByUser.set(s.user_id, []);
      subsByUser.get(s.user_id).push(s);
    }
  }

  let sent = 0;
  let removed = 0;
  let noSubs = 0;
  for (const row of due) {
    const subs = subsByUser.get(row.user_id) ?? [];
    if (subs.length === 0) noSubs += 1;
    const name = (row.title_ru || row.title || row.title_en || '').trim();
    const payload = JSON.stringify({
      title: 'Напоминание / Reminder',
      body: name ? `${name}${row.start_date ? ' · ' + row.start_date : ''}` : '',
      url: `${SITE_URL}#/?e=${row.event_id}`,
      tag: `reminder-${row.event_id}`,
    });
    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
          { TTL: 60 * 60 * 12 },
        );
        sent += 1;
      } catch (err) {
        const code = err?.statusCode;
        if (code === 404 || code === 410) {
          await db.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
          removed += 1;
        } else {
          console.error(`Ошибка напоминания (${code ?? 'unknown'}): ${err?.message ?? err}`);
        }
      }
    }
    // Отметку ставим и когда подписок нет: напоминание без устройства
    // доставить некуда, и пытаться каждый день смысла нет
    await db
      .from('event_reminders')
      .update({ sent_at: new Date().toISOString() })
      .eq('id', row.reminder_id);
  }
  console.log(
    `Напоминаний на ${today}: ${due.length}, отправлено: ${sent}, без подписок: ${noSubs}, удалено мёртвых: ${removed}`,
  );
}

async function main() {
  // SKIP_NEW_EVENTS=1 — только напоминания (ручная проверка прохода B и разовые
  // прогоны, когда рассылка о новых событиях уже ушла)
  if (process.env.SKIP_NEW_EVENTS === '1') {
    console.log('Рассылка о новых событиях пропущена (SKIP_NEW_EVENTS=1)');
  } else {
    await sendNewEvents();
  }
  await sendReminders();
}

main().catch((err) => {
  console.error('Ошибка прогона notify-push:', err);
  process.exit(1);
});
