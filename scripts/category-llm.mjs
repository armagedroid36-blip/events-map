// Общий модуль: определение категории события через LLM (DeepSeek).
// Используется сборщиками collect-bali.mjs и collect-tg.mjs.
// Без DEEPSEEK_API_KEY или при любой ошибке возвращает null (работает старая логика).

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

const CATEGORIES =
  'conference — Конференции, exhibition — Выставки, concert — Концерты, sport — Спорт, ' +
  'lecture — Лекции, party — Вечеринки, festival — Фестивали, food — Еда и напитки, ' +
  'cinema — Киноклуб, wellness — Йога и здоровье, workshop — Мастер-классы, ' +
  'games — Игры и квизы, meetup — Встречи и нетворкинг, tour — Экскурсии и туры, ' +
  'speaking — Разговорный клуб';

const SYSTEM_PROMPT =
  'Определи категорию события. Ответь ТОЛЬКО JSON: {"category": "<id>"}. ' +
  `Доступные категории (id — русское название): ${CATEGORIES}. ` +
  'Правила: квиз/викторина/настолки/мафия → games; разговорный клуб/speaking club/english club → speaking; ' +
  'йога/медитация/практика → wellness; концерт/живая музыка/dj-сет → concert; ' +
  'вечеринка/танцы/party → party; мастер-класс/рисование/творчество → workshop. ' +
  'Выбери наиболее подходящую, не выдумывай новые.';

/**
 * Определить категорию события по тексту.
 * @param {string} text текст описания/поста
 * @param {string} hint подсказка (город или типы источника, напр. «Типы Балифорума: Концерт, Игра»)
 * @returns {Promise<string|null>} id категории или null (нет ключа/ошибка)
 */
export async function extractCategory(text, hint) {
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
          { role: 'user', content: `${hint || ''}\nТекст:\n${String(text).slice(0, 1500)}` },
        ],
      }),
      signal: controller.signal,
    });
    if (!res.ok) return null;

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) return null;

    const parsed = JSON.parse(content);
    const cat = typeof parsed.category === 'string' ? parsed.category.trim() : '';
    return cat || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
