// Общий модуль: определение адреса события через LLM (DeepSeek).
// Используется сборщиком collect-tg.mjs.
// Без DEEPSEEK_API_KEY или при любой ошибке возвращает null (сборка не падает,
// вызывающий код откатывается на старый regex extractAddress).

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

const SYSTEM_PROMPT =
  'Определи адрес или место проведения события. Ответь ТОЛЬКО JSON: {"address": string|null}. ' +
  'Адрес может стоять после любого эмодзи (📍📌🗺️🏠 и др.), после слов "Локация/Адрес/Место" ' +
  'или быть просто упомянут в тексте (название отеля/заведения, улица, этаж). ' +
  'Пример: "📍 Boton Blue Hotel, 27 этаж" → "Boton Blue Hotel, 27 этаж". ' +
  'Если адреса нет — null. Не выдумывай адрес, которого нет в тексте.';

/**
 * Определить адрес или место проведения по тексту события.
 * @param {string} text текст описания/поста
 * @param {string} cityHint город (Bali, Nha Trang, Da Nang...)
 * @returns {Promise<{address: string|null}|null>} null при ошибке/без ключа
 */
export async function extractAddressLLM(text, cityHint) {
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
        max_tokens: 80,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Город: ${cityHint || ''}\nТекст:\n${String(text).slice(0, 1500)}` },
        ],
      }),
      signal: controller.signal,
    });
    if (!res.ok) return null;

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) return null;

    const parsed = JSON.parse(content);
    const address = typeof parsed.address === 'string' ? parsed.address.trim() : null;
    return { address: address || null };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
