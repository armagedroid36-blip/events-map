// Уведомления админу о новых событиях на модерации: Telegram + email.
// Первый запуск (нет moderation_last_sent) — все события на модерации (до 10),
// далее — только новые после последней успешной отправки.
// Плюс строка-сводка автопроверки (scripts/moderate-events.mjs): сколько
// карточек опубликовано автоматически, сколько ушло на проверку и отклонено.
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = process.env.SMTP_PORT;
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;

const MAX_ITEMS = 10;
const ADMIN_URL = 'https://mypins.site/#/admin';

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('Нужны переменные: SUPABASE_URL, SUPABASE_SERVICE_ROLE');
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

// Экранирование HTML для parse_mode=HTML (Telegram)
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[c]);
}

// Убираем переводы строк — защита от SMTP-инъекции через заголовки
function cleanLine(s) {
  return String(s ?? '').replace(/[\r\n]+/g, ' ').trim();
}

function buildText(events, total, auto) {
  const lines = [];
  // Сводка автопроверки — первой строкой, если она что-то сделала
  if (auto && (auto.totals.publish || auto.totals.reject || auto.totals.review)) {
    lines.push(
      `Автопроверка: опубликовано ${auto.totals.publish}, на проверку ${auto.totals.review}, ` +
        `отклонено ${auto.totals.reject}`,
    );
    const bad = (auto.items || []).filter((i) => i.verdict === 'reject').slice(0, 3);
    for (const r of bad) lines.push(`✕ ${esc(r.title)} — ${esc(r.reason || 'нарушение правил')}`);
    // Отказы LLM-судьи: карточки остались на ручной проверке не по своей вине
    if (Number(auto.llm_failed) > 0) {
      const why = (auto.llm_errors || []).slice(0, 2).join('; ');
      lines.push(
        `LLM-судья не ответил по ${auto.llm_failed} карточкам${why ? ` (${esc(why)})` : ''} — ` +
          'они ждут ручной проверки',
      );
    }
  }
  if (total > 0) {
    lines.push(`Новые события на модерации: ${total}`);
    for (const ev of events) {
      const title = cleanLine(ev.title_ru || ev.title_en || ev.title || 'Без названия');
      const city = ev.city || '';
      const date = ev.start_date || '';
      // Источник события: [автосбор] / [театры и шоу] / [организатор]
      const src =
        ev.source_type === 'theatre' ? '[театры и шоу]' : ev.source_type === 'organizer' ? '[организатор]' : '[автосбор]';
      const parts = [esc(src)];
      if (title) parts.push(esc(title));
      if (city) parts.push(esc(city));
      if (date) parts.push(esc(date));
      lines.push(`• ${parts.join(' — ')}`);
    }
    const rest = total - events.length;
    if (rest > 0) lines.push(`и ещё ${rest}…`);
  }
  lines.push(`Полный список: ${ADMIN_URL}`);
  return lines.join('\n');
}

/** Отчёт автопроверки (его пишет scripts/moderate-events.mjs в том же запуске) */
function readAutoReport() {
  const file = process.env.MODERATION_REPORT || path.join(process.cwd(), 'auto-moderation-report.json');
  try {
    if (!fs.existsSync(file)) return null;
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    // Отчёт может быть от прошлого запуска — берём только свежий (до 6 часов)
    const age = Date.now() - Date.parse(data.checked_at || 0);
    if (!Number.isFinite(age) || age > 6 * 3600 * 1000) return null;
    return data;
  } catch {
    return null;
  }
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

async function sendEmail(text, to, subject = 'Новые события на модерации') {
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
    subject,
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

  // 2а. Отчёт автопроверки — мог опубликовать или отклонить карточки без человека
  const auto = readAutoReport();
  const autoDid = !!(auto && (auto.totals.publish || auto.totals.reject || auto.totals.review));

  if (!count && !autoDid) {
    console.log('Новых событий на модерации нет, автопроверка ничего не меняла');
    return;
  }

  let events = [];
  if (count) {
    let listQ = db
      .from('events')
      .select('id,title_ru,title_en,title,city,start_date,source_type')
      .eq('status', 'moderation')
      .order('updated_at', { ascending: false })
      .limit(MAX_ITEMS);
    if (lastSent) listQ = listQ.gt('updated_at', lastSent);
    const { data, error: ee } = await listQ;
    if (ee) throw ee;
    events = data || [];
  }

  // 3. Текст
  const text = buildText(events, count || 0, autoDid ? auto : null);
  // Заголовок письма — с первым названием события (переносы строк вырезаны)
  const firstTitle = cleanLine(events?.[0]?.title_ru || events?.[0]?.title_en || events?.[0]?.title || '');
  const subject = firstTitle
    ? `Новые события на модерации: ${firstTitle}`
    : count
      ? 'Новые события на модерации'
      : 'Автопроверка событий';

  // 4. Отправка по каналам (ошибки изолированы)
  let sent = false;
  try {
    sent = (await sendTelegram(text, chatId)) || sent;
  } catch (e) {
    console.error('Telegram ошибка:', e.message);
  }
  try {
    sent = (await sendEmail(text, notifyEmail, subject)) || sent;
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
