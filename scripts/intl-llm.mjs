// Общий модуль: определение «международный (гастролирующий) артист» через LLM (DeepSeek).
// Используется collect-bali.mjs для концертов/музыки (типы «Концерт», «Музыка», «Живая музыка»):
// отличает приезжих артистов от местных кавер-бэндов/диджеев.
// Без DEEPSEEK_API_KEY или при любой ошибке возвращает null (метка не ставится).

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

const SYSTEM_PROMPT =
  'Ты — редактор афиш. Определи, международный ли (гастролирующий, НЕ местный) артист выступает на событии. ' +
  'Международный = артист/группа из другой страны, приехал на гастроли (например, мировой тур, известный зарубежный диджей/музыкант). ' +
  'Местный = индонезийский/вьетнамский исполнитель, кавер-бэнд, локальный диджей, резидент клуба, местный коллектив. ' +
  'Если по названию/тексту неясно — считай местным (false). ' +
  'Ответь ТОЛЬКО JSON: {"international": true|false}';

/**
 * Является ли артист международным (гастролирующим).
 * @param {string} title название события (обычно содержит имя артиста)
 * @param {string} text описание/подсказка
 * @returns {Promise<boolean|null>} true/false или null (нет ключа/ошибка)
 */
export async function isInternationalArtist(title, text) {
  if (!DEEPSEEK_API_KEY) return null;

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
        max_tokens: 40,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Название: ${String(title || '').slice(0, 200)}\nТекст:\n${String(text || '').slice(0, 800)}` },
        ],
      }),
      signal: controller.signal,
    });
    if (!res.ok) return null;

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) return null;

    const parsed = JSON.parse(content);
    return typeof parsed.international === 'boolean' ? parsed.international : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
