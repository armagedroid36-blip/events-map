// Уведомления админу о новых событиях на модерации: Telegram + email.
// Первый запуск (нет moderation_last_sent) — все события на модерации (до 10),
// затем записывается отметка. Повторные — только изменившиеся после отметки;
// новых нет — тишина (код 0).
// Запускается в GitHub Actions каждые 30 минут.
import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = process.env.SMTP_PORT;
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('Нужны переменные: SUPABASE_URL, SUPABASE_SERVICE_ROLE');
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

const ADMIN_URL = 'https://armagedroid36-blip.github.io/events-map/#/admin';
const MAX_ITEMS = 10;

// Экранирование HTML для parse_mode=HTML (Telegram)
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

function buildText(events, total) {
  const lines = [`Новые события на модерации: ${total}`];
  for (const ev of events) {
    const title = ev.title_ru || ev.title_en || ev.title || 'Без названия';
    const city = ev.city || '';
    const date = ev.start_date || '';
    const parts = [esc(title)];
    if (city) parts.push(esc(city));
    if (date) parts.push(esc(date));
    lines.push(`• ${parts.join(' — ')}`);
  }
  const rest = total - events.length;
  if (rest > 0) lines.push(`и ещё ${rest}…`);
  lines.push(`Открыть: ${ADMIN_URL}`);
  return lines.join('\n');
}

async function sendTelegram(text, chatId) {
  if (!TG_TOKEN) {
    console.warn('Telegram пропущен: TELEGRAM_BOT_TOKEN не задан');
    return false;
  }
  if (!chatId) {
    console.warn('Telegram пропущен: notify_chat_id не задан в app_settings');
    return false;
  }
  const res = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(`Telegram API: ${JSON.stringify(json)}`);
  console.log('Telegram: отправлено');
  return true;
}

async function sendEmail(text, to) {
  const smtpOk = SMTP_HOST && SMTP_PORT && SMTP_USER && SMTP_PASS;
  if (!smtpOk) {
    console.warn('Email пропущен: SMTP_* не заданы');
    return false;
  }
  if (!to) {
    console.warn('Email пропущен: notify_email не задан в app_settings');
    return false;
  }
  const transport = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: true,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  await transport.sendMail({
    from: SMTP_USER,
    to,
    subject: 'Новые события на модерации',
    text,
  });
  console.log(`Email: отправлено на ${to}`);
  return true;
}

async function main() {
  // 1. Настройки уведомлений
  const { data: settingsRows, error: se } = await db.from('app_settings').select('key,value');
  if (se) throw se;
  const settings = {};
  for (const r of settingsRows || []) settings[r.key] = r.value;
  const notifyEmail = settings.notify_email;
  const chatId = settings.notify_chat_id;
  const lastSent = settings.moderation_last_sent;

  // 2. События на модерации (после последней отправки — все)
  let q = db
    .from('events')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'moderation');
  if (lastSent) q = q.gt('updated_at', lastSent);
  const { count, error: ce } = await q;
  if (ce) throw ce;

  if (!count) {
    console.log('Новых событий на модерации нет');
    return;
  }

  let listQ = db
    .from('events')
    .select('id,title_ru,title_en,title,city,start_date')
    .eq('status', 'moderation')
    .order('updated_at', { ascending: false })
    .limit(MAX_ITEMS);
  if (lastSent) listQ = listQ.gt('updated_at', lastSent);
  const { data: events, error: ee } = await listQ;
  if (ee) throw ee;

  // 3. Текст
  const text = buildText(events || [], count);

  // 4. Отправка по каналам (ошибки изолированы)
  let sent = false;
  try {
    sent = (await sendTelegram(text, chatId)) || sent;
  } catch (e) {
    console.error('Telegram ошибка:', e.message);
  }
  try {
    sent = (await sendEmail(text, notifyEmail)) || sent;
  } catch (e) {
    console.error('Email ошибка:', e.message);
  }

  if (!sent) {
    console.error('Ни один канал не доставил — отметка не записана');
    process.exit(1);
  }

  // 5. Отметка — только после успешной доставки
  const { error: ue } = await db
    .from('app_settings')
    .upsert({ key: 'moderation_last_sent', value: new Date().toISOString() }, { onConflict: 'key' });
  if (ue) console.warn('Не удалось записать moderation_last_sent:', ue.message);
  else console.log('moderation_last_sent обновлён');
}

main().catch((e) => {
  console.error('Критическая ошибка:', e.message);
  process.exit(1);
});
