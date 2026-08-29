// Общий модуль: определение адреса события через LLM (DeepSeek).
// Используется сборщиком collect-tg.mjs и backfill-address.mjs.
// Без DEEPSEEK_API_KEY или при любой ошибке возвращает null (сборка не падает,
// вызывающий код откатывается на regex extractAddress).

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

const SYSTEM_PROMPT =
  'Определи адрес или место проведения события. Ответь ТОЛЬКО JSON: {"address": string|null}. ' +
  'Адрес может стоять после любого эмодзи-указателя (🪧📍📌🗺️🏠 и др.), после слов "Локация/Адрес/Место" ' +
  'или быть просто упомянут в тексте (название отеля/заведения, улица, этаж). ' +
  'Пример: "📍 Boton Blue Hotel, 27 этаж" → "Boton Blue Hotel, 27 этаж". ' +
  'Пример: "🪧 Нячанг, Yen Garden Bistro" → "Yen Garden Bistro". ' +
  'Город, который совпадает с переданным городом (cityHint), в адрес НЕ включай — ' +
  'возвращай название заведения/улицы без города. ' +
  'Если адреса нет — null. Не выдумывай адрес, которого нет в тексте.';

/**
 * Одна попытка запроса к LLM.
 * @returns {Promise<{address: string|null}|undefined>} undefined = ошибка (нужен retry)
 */
async function tryOnce(text, cityHint) {
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
        max_tokens: 120,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Город: ${cityHint || ''}\nТекст:\n${String(text).slice(0, 1500)}` },
        ],
      }),
      signal: controller.signal,
    });
    if (!res.ok) return undefined;

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) return undefined;

    const parsed = JSON.parse(content);
    let address = typeof parsed.address === 'string' ? parsed.address.trim() : null;

    // Пост-обработка: город, совпадающий с cityHint, обрезаем
    // («Нячанг, Yen Garden Bistro» → «Yen Garden Bistro»)
    if (address && cityHint) {
      const esc = cityHint.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      address = address.replace(new RegExp(`^${esc}\\s*[,:-]\\s*`, 'i'), '').trim();
    }
    return { address: address || null };
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Определить адрес или место проведения по тексту события.
 * До 2 повторных попыток (пауза ~1с) при сетевой ошибке, невалидном JSON
 * или пустом ответе модели.
 * @param {string} text текст описания/поста
 * @param {string} cityHint город (Bali, Nha Trang, Da Nang...)
 * @returns {Promise<{address: string|null}|null>} null при ошибке/без ключа
 */
export async function extractAddressLLM(text, cityHint) {
  if (!DEEPSEEK_API_KEY || !text) return null;

  for (let attempt = 0; attempt < 3; attempt++) {
    const result = await tryOnce(text, cityHint);
    if (result !== undefined) return result;
    if (attempt < 2) await new Promise((r) => setTimeout(r, 1000));
  }
  return null;
}
