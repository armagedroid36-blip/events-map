// Общий модуль: определение категории события через LLM (DeepSeek).
// Используется сборщиками collect-bali.mjs и collect-tg.mjs.
// Без DEEPSEEK_API_KEY или при любой ошибке возвращает null (работает старая логика).

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

const CATEGORIES =
  'conference — Конференции, exhibition — Выставки, concert — Концерты, sport — Спорт, ' +
  'lecture — Лекции, party — Вечеринки, festival — Фестивали, food — Еда и напитки, ' +
  'cinema — Киноклуб, wellness — Йога и здоровье, workshop — Мастер-классы, ' +
  'games — Игры и квизы, meetup — Встречи и нетворкинг, tour — Экскурсии и туры, ' +
  'speaking — Разговорный клуб, theatre — Театры и шоу';

// id уходит прямо в FK events_category_id_fkey: значения, которого нет в таблице
// categories, роняет ВСТАВКУ целиком, и событие теряется на каждом прогоне
// (15.10.2026: «A Poem Is Being Written by a Landscape» падало в двух прогонах
// подряд — лента Cyprus Now отдаёт ярлык «Culture & Community», а судья возвращал
// свой id). Принимаем только id из таблицы categories, остальное → null:
// звонящий подставит свой проверенный фолбэк (pickCategory / 'festival').
export const CATEGORY_IDS = new Set([
  'conference', 'exhibition', 'concert', 'sport', 'lecture', 'party', 'festival',
  'food', 'cinema', 'wellness', 'workshop', 'games', 'meetup', 'tour', 'speaking', 'theatre',
  // Есть в таблице categories, но не в промпте судьи: принимать обязательно, иначе
  // легитимный ответ судьи («show») затирался бы фолбэком источника («festival»).
  'show',
]);

// Судья отвечает не только id, но иногда НАЗВАНИЕМ категории: промпт перечисляет
// «id — русское название», и 15.10.2026 на ярлык ленты «Culture & Community» пришло
// «выставки» — вставка падала на FK, событие терялось. Названия (RU из промпта и
// EN из таблицы categories) сводим к id; всё остальное — null.
export const CATEGORY_LABELS = {
  'конференции': 'conference', 'conferences': 'conference',
  'выставки': 'exhibition', 'exhibitions': 'exhibition',
  'концерты': 'concert', 'concerts': 'concert',
  'спорт': 'sport', 'sports': 'sport',
  'лекции': 'lecture', 'lectures': 'lecture',
  'вечеринки': 'party', 'parties': 'party',
  'фестивали': 'festival', 'festivals': 'festival',
  'еда и напитки': 'food', 'food & drink': 'food',
  'киноклуб': 'cinema', 'cinema club': 'cinema',
  'йога и здоровье': 'wellness', 'yoga & wellness': 'wellness',
  'мастер-классы': 'workshop', 'workshops': 'workshop',
  'игры и квизы': 'games', 'games & quizzes': 'games',
  'встречи и нетворкинг': 'meetup', 'meetups & networking': 'meetup',
  'экскурсии и туры': 'tour', 'tours & excursions': 'tour',
  'разговорный клуб': 'speaking', 'speaking club': 'speaking',
  'театры и шоу': 'theatre', 'театр и шоу': 'theatre', 'theatre': 'theatre', 'theatres & shows': 'theatre',
  'шоу и представления': 'show', 'show': 'show', 'shows & performances': 'show',
};

/** id категории из ответа судьи: точный id, название RU/EN или null. */
export function normalizeCategory(raw) {
  const key = String(raw ?? '').trim().toLowerCase().replace(/ё/g, 'е').replace(/[«»"'`]/g, '');
  if (CATEGORY_IDS.has(key)) return key;
  const byLabel = CATEGORY_LABELS[key];
  return byLabel && CATEGORY_IDS.has(byLabel) ? byLabel : null;
}

const SYSTEM_PROMPT =
  'Определи категорию события. Ответь ТОЛЬКО JSON: {"category": "<id>"}. ' +
  `Доступные категории (id — русское название): ${CATEGORIES}. ` +
  'Правила: квиз/викторина/настолки/мафия → games; разговорный клуб/speaking club/english club → speaking; ' +
  'йога/медитация/практика → wellness; концерт/живая музыка/dj-сет → concert; ' +
  'вечеринка/танцы/party → party; мастер-класс/рисование/творчество → workshop; ' +
  'театр/спектакль/представление/шоу/цирк/балет/традиционные танцы → theatre. ' +
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
    const raw = typeof parsed.category === 'string' ? parsed.category.trim() : '';
    const cat = normalizeCategory(raw);
    if (!cat && raw) console.log(`[категория-неизвестна] «${raw}» -> фолбэк источника`);
    return cat;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
