// Общий модуль: определение цены и валюты события через LLM (DeepSeek).
// Используется сборщиками collect-bali.mjs и collect-tg.mjs.
// Без DEEPSEEK_API_KEY или при любой ошибке возвращает null (сборка не падает).

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

const SYSTEM_PROMPT =
  'Определи цену билета на событие по тексту. Ответь ТОЛЬКО JSON: {"price": number|null, "currency": "idr"|"vnd"|"usd"|"rub"|null, "free": boolean, "donation": boolean}. ' +
  'Правила: "600к"/"200 000 IDR" на Бали → price=600000/200000, currency="idr"; "$12" → 12, "usd"; ' +
  '"вход свободный"/"бесплатно"/"free" → price=null, free=true; "донат"/"donation" → price=null, donation=true; ' +
  'цены нет → price=null, currency=null, free=false. Если валюта не указана: Бали → idr, Дананг/Нячанг → vnd, рублёвые суммы → rub. ' +
  'Не выдумывай цену, если её нет в тексте.';

/**
 * Определить цену и валюту по тексту события.
 * @param {string} text текст описания/поста
 * @param {string} cityHint город (Bali, Nha Trang, Da Nang...)
 * @returns {Promise<{price: number|null, currency: string|null, free: boolean, donation: boolean}|null>}
 */
export async function extractPrice(text, cityHint) {
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
        max_tokens: 150,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Город: ${cityHint || ''}\nТекст:\n${String(text).slice(0, 2000)}` },
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
      price: typeof parsed.price === 'number' && Number.isFinite(parsed.price) ? parsed.price : null,
      currency: typeof parsed.currency === 'string' ? parsed.currency : null,
      free: !!parsed.free,
      donation: !!parsed.donation,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
