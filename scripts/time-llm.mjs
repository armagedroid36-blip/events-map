// Общий модуль: определение времени события через LLM (DeepSeek).
// Дополняет regex-парсер даты/времени в collect-tg.mjs (понимает «9pm» и т.п.).
// Без DEEPSEEK_API_KEY или при любой ошибке возвращает null (работает старый парсер).

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

const SYSTEM_PROMPT =
  'Определи время начала и конца события из текста. Ответь ТОЛЬКО JSON: {"start_time": "HH:MM"|null, "end_time": "HH:MM"|null}. ' +
  'Правила: "9pm" → 21:00, "6am" → 06:00, "19:30" → 19:30, "с 15:00 до 18:00" → start 15:00, end 18:00, "начало в 20:00" → start 20:00. ' +
  'Всегда выводи в 24-часовом формате. Времени нет → null.';

/**
 * Определить время начала/конца события по тексту.
 * @param {string} text текст поста
 * @returns {Promise<{start_time: string|null, end_time: string|null}|null>}
 */
export async function extractTime(text) {
  if (!DEEPSEEK_API_KEY || !text) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        temperature: 0,
        max_tokens: 60,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Текст:\n${String(text).slice(0, 1500)}` },
        ],
      }),
      signal: controller.signal,
    });
    if (!res.ok) return null;

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) return null;

    const parsed = JSON.parse(content);
    return {
      start_time: typeof parsed.start_time === 'string' && parsed.start_time ? parsed.start_time : null,
      end_time: typeof parsed.end_time === 'string' && parsed.end_time ? parsed.end_time : null,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
