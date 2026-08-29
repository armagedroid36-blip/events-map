// Бот обратной связи @Eventsmap_feedback_bot: посетители сайта пишут боту,
// сообщения пересылаются в личный Telegram владельца (OWNER_CHAT_ID) и на почту.
// Владелец отвечает РЕПЛАЕМ на сообщение бота — ответ уходит клиенту.
// Запускается в GitHub Actions каждые 2 минуты (поллинг getUpdates).
// Смещение (offset) хранится в app_settings (ключ feedback_offset).
import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
const BOT_TOKEN = process.env.FEEDBACK_BOT_TOKEN;
const OWNER_CHAT_ID = Number(process.env.OWNER_CHAT_ID || 0);
const FEEDBACK_EMAIL = process.env.FEEDBACK_EMAIL || 'eventsmap@yandex.ru';
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = process.env.SMTP_PORT;
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;

if (!SUPABASE_URL || !SERVICE_ROLE || !BOT_TOKEN || !OWNER_CHAT_ID) {
  console.error('Нужны переменные: SUPABASE_URL, SUPABASE_SERVICE_ROLE, FEEDBACK_BOT_TOKEN, OWNER_CHAT_ID');
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
const API = `https://api.telegram.org/bot${BOT_TOKEN}`;

/** Вызов Telegram API; возвращает json или бросает */
async function tg(method, params = {}) {
  const res = await fetch(`${API}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const json = await res.json().catch(() => ({}));
  if (!json.ok) throw new Error(`Telegram ${method}: ${JSON.stringify(json).slice(0, 300)}`);
  return json.result;
}

/** Отправка письма (как в notify-moderation.mjs, secure SMTP 465) */
async function sendEmail(text, subject) {
  if (!(SMTP_HOST && SMTP_PORT && SMTP_USER && SMTP_PASS)) {
    console.warn('Email пропущен: SMTP_* не заданы');
    return false;
  }
  const transport = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: true,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  await transport.sendMail({ from: SMTP_USER, to: FEEDBACK_EMAIL, subject, text });
  console.log(`Email: отправлено на ${FEEDBACK_EMAIL}`);
  return true;
}

/** Имя отправителя для показа: «Имя Фамилия (@username)» или id */
function senderName(m) {
  const u = m.from || {};
  const name = [u.first_name, u.last_name].filter(Boolean).join(' ') || null;
  const nick = u.username ? `@${u.username}` : null;
  return [name, nick].filter(Boolean).join(' ') || String(u.id || m.chat?.id || '?');
}

/** Хранимый offset из app_settings */
async function readOffset() {
  const { data, error } = await db.from('app_settings').select('value').eq('key', 'feedback_offset').maybeSingle();
  if (error) throw error;
  const n = Number(data?.value || 0);
  return Number.isFinite(n) ? n : 0;
}

async function saveOffset(offset) {
  const { error } = await db
    .from('app_settings')
    .upsert({ key: 'feedback_offset', value: String(offset) }, { onConflict: 'key' });
  if (error) throw error;
}

async function main() {
  const offset = await readOffset();
  let forwarded = 0;
  let replied = 0;

  const updates = await tg('getUpdates', { offset, timeout: 0 });
  for (const up of updates || []) {
    const m = up.message || up.edited_message;
    if (!m) continue;
    try {
      const chatId = Number(m.chat?.id || 0);

      // Ответ владельца: реплай на сообщение бота → уходит клиенту (id в тексте)
      if (chatId === OWNER_CHAT_ID && m.reply_to_message) {
        const idMatch = String(m.reply_to_message.text || '').match(/\[id=(\d+)\]/);
        const clientId = idMatch ? Number(idMatch[1]) : 0;
        if (clientId && m.text) {
          await tg('sendMessage', { chat_id: clientId, text: m.text });
          replied++;
          console.log(`Ответ клиенту ${clientId}: ${String(m.text).slice(0, 60)}`);
        } else {
          await tg('sendMessage', {
            chat_id: OWNER_CHAT_ID,
            text: 'Не нашёл клиента в сообщении, на которое вы ответили. Ответьте реплаем на сообщение вида «Новое обращение… [id=…]».',
          });
        }
        continue;
      }

      // Сообщение от владельца без реплая — подсказка
      if (chatId === OWNER_CHAT_ID) {
        await tg('sendMessage', {
          chat_id: OWNER_CHAT_ID,
          text: 'Чтобы ответить клиенту — нажмите «ответить» (reply) на его обращение и напишите текст.',
        });
        continue;
      }

      // Команда /start — приветствие, не обращение
      if (m.text && m.text.startsWith('/')) {
        await tg('sendMessage', {
          chat_id: chatId,
          text: 'Напишите ваше сообщение — я передам его разработчику, и он ответит вам здесь же.',
        });
        continue;
      }
      if (!m.text) continue; // пока только текстовые обращения

      // Новое обращение клиента
      const body = `Новое обращение с сайта\nОт: ${senderName(m)} [id=${chatId}]\n\n${m.text}`;
      await tg('sendMessage', { chat_id: OWNER_CHAT_ID, text: `${body}\n\nОтветьте реплаем на это сообщение — ответ уйдёт клиенту.` });
      await tg('sendMessage', {
        chat_id: chatId,
        text: 'Спасибо! Ваше сообщение передано разработчику — он ответит вам здесь же.',
      });
      await sendEmail(`${body}\n\n(ответ клиенту — в Telegram: реплай на его обращение)`, `Обратная связь: ${senderName(m)}`).catch((e) => console.warn('Email ошибка:', e.message));
      forwarded++;
      console.log(`Обращение от ${chatId}: ${String(m.text).slice(0, 60)}`);
    } catch (e) {
      console.error(`Ошибка обработки update ${up.update_id}: ${e.message}`);
    }
  }

  const lastId = updates.length ? updates[updates.length - 1].update_id : 0;
  if (lastId > offset) await saveOffset(lastId + 1);
  console.log(`Готово: обращений ${forwarded}, ответов ${replied}.`);
}

main().catch((e) => {
  console.error('Критическая ошибка:', e.message);
  process.exit(1);
});
