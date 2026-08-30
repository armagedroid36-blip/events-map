// Бот обратной связи @Eventsmap_feedback_bot — мгновенный Telegram webhook.
// Владелец (OWNER_CHAT_ID) получает обращения сразу; отвечает реплаем —
// ответ уходит клиенту. Поллинга нет (удалён feedback-bot.yml).
// Почта НЕ используется (копия на eventsmap@yandex.ru убрана).
// env: FEEDBACK_BOT_TOKEN, OWNER_CHAT_ID, FEEDBACK_SECRET.
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const BOT_TOKEN = Deno.env.get('FEEDBACK_BOT_TOKEN') || '';
const OWNER_CHAT_ID = Number(Deno.env.get('OWNER_CHAT_ID') || 0);
const SECRET = Deno.env.get('FEEDBACK_SECRET') || '';

const API = `https://api.telegram.org/bot${BOT_TOKEN}`;

/** Вызов Telegram API (best-effort: при ошибке молчим, Telegram ретраит сам) */
async function tg(method: string, params: Record<string, unknown>): Promise<void> {
  try {
    await fetch(`${API}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
  } catch {
    /* ignore */
  }
}

/** Имя отправителя: «Имя Фамилия (@username)» или id */
function senderName(m: Record<string, any>): string {
  const u = m.from || {};
  const name = [u.first_name, u.last_name].filter(Boolean).join(' ') || '';
  const nick = u.username ? `@${u.username}` : '';
  return [name, nick].filter(Boolean).join(' ') || String(u.id || m.chat?.id || '?');
}

serve(async (req) => {
  // Верификация webhook: секрет из setWebhook (защита от чужих запросов)
  if (req.headers.get('X-Telegram-Bot-Api-Secret-Token') !== SECRET) {
    return new Response('forbidden', { status: 403 });
  }

  try {
    const update = await req.json();
    const m = update?.message || update?.edited_message;
    if (!m) return new Response('ok');
    const chatId = Number(m.chat?.id || 0);

    // Ответ владельца: реплай на сообщение бота → уходит клиенту (id в тексте)
    if (chatId === OWNER_CHAT_ID && m.reply_to_message) {
      const idMatch = String(m.reply_to_message.text || '').match(/\[id=(\d+)\]/);
      const clientId = idMatch ? Number(idMatch[1]) : 0;
      if (clientId && m.text) {
        await tg('sendMessage', { chat_id: clientId, text: m.text });
      } else {
        await tg('sendMessage', {
          chat_id: OWNER_CHAT_ID,
          text: 'Не нашёл клиента в сообщении, на которое вы ответили. Ответьте реплаем на сообщение вида «Новое обращение… [id=…]».',
        });
      }
      return new Response('ok');
    }

    // Сообщение владельца без реплая — подсказка
    if (chatId === OWNER_CHAT_ID) {
      await tg('sendMessage', {
        chat_id: OWNER_CHAT_ID,
        text: 'Чтобы ответить клиенту — нажмите «ответить» (reply) на его обращение и напишите текст.',
      });
      return new Response('ok');
    }

    // Команда от клиента (/start и т.п.) — приветствие, не обращение
    if (m.text && m.text.startsWith('/')) {
      await tg('sendMessage', {
        chat_id: chatId,
        text: 'Напишите ваше сообщение — я передам его разработчику, и он ответит вам здесь же.',
      });
      return new Response('ok');
    }
    if (!m.text) return new Response('ok');

    // Новое обращение клиента
    const body = `Новое обращение с сайта\nОт: ${senderName(m)} [id=${chatId}]\n\n${m.text}`;
    await tg('sendMessage', {
      chat_id: OWNER_CHAT_ID,
      text: `${body}\n\nОтветьте реплаем на это сообщение — ответ уйдёт клиенту.`,
    });
    await tg('sendMessage', {
      chat_id: chatId,
      text: 'Спасибо! Ваше сообщение передано разработчику — он ответит вам здесь же.',
    });
    return new Response('ok');
  } catch (e) {
    console.error(String(e));
    return new Response('ok');
  }
});
