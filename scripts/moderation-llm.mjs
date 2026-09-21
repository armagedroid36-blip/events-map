// LLM-судья автопроверки событий (DeepSeek), второй этап после правил.
// Задача: решить, соответствует ли карточка критериям публикации — нет мата,
// нет нарушения закона и морали, это действительно событие, а не реклама.
//
// Без DEEPSEEK_API_KEY или при любой ошибке возвращает null — вызывающий код
// обязан трактовать null как «на проверку человеку», а не как «публиковать».

const DEEPSEEK_URL = 'https://api.deepseek.com/v1/chat/completions';

const SYSTEM_PROMPT =
  'Ты — модератор афиши событий для туристов и экспатов (Бали, Дананг, Нячанг, ЮВА). ' +
  'Реши, можно ли опубликовать карточку события без участия человека. ' +
  'Ответь ТОЛЬКО JSON: {"verdict":"publish|review|reject","flags":[],"reason":"..."}. ' +
  'reject — если есть мат, грубая брань, оскорбления; нарушение закона (наркотики, оружие, мошенничество, ' +
  'продажа документов, проституция, азартные игры на деньги); аморальное (18+, откровенный контент, эскорт); ' +
  'вражда и экстремизм; это не событие, а реклама товара/услуги или спам-объявление. ' +
  'review — если это политическая агитация, митинг или религиозная проповедь; псевдомедицинские обещания; ' +
  'спорный контент; информации слишком мало и непонятно, что за событие. ' +
  'publish — обычное событие: концерт, фестиваль, выставка, спорт, лекция, мастер-класс, вечеринка, ' +
  'экскурсия, театр, кинопоказ, еда, нетворкинг — без нарушений. ' +
  'Название на иностранном языке (индонезийский, вьетнамский, английский) НЕ причина отклонять. ' +
  'Короткое описание или отсутствие цены НЕ причина отклонять. ' +
  'flags — массив из: profanity, illegal, drugs, weapons, adult, gambling, scam, hate, politics, spam, unclear. ' +
  'Если нарушений нет — пустой массив. reason — коротко по-русски, до 120 символов.';

const VERDICTS = new Set(['publish', 'review', 'reject']);
const FLAGS = new Set([
  'profanity', 'illegal', 'drugs', 'weapons', 'adult', 'gambling', 'scam',
  'hate', 'politics', 'spam', 'unclear',
]);

/** Привести ответ модели к строгому виду; некорректный ответ → null */
function normalize(parsed) {
  const verdict = typeof parsed?.verdict === 'string' ? parsed.verdict.trim().toLowerCase() : '';
  if (!VERDICTS.has(verdict)) return null;
  const flags = Array.isArray(parsed.flags)
    ? parsed.flags.map((f) => String(f).trim().toLowerCase()).filter((f) => FLAGS.has(f))
    : [];
  const reason = typeof parsed.reason === 'string' ? parsed.reason.replace(/\s+/g, ' ').trim().slice(0, 200) : '';
  return { verdict, flags, reason };
}

/**
 * Проверить карточку события LLM-судьёй.
 * @param {{title: string, description?: string, city?: string, address?: string, category?: string, website?: string}} card
 * @returns {Promise<{verdict: 'publish'|'review'|'reject', flags: string[], reason: string}|null>}
 */
export async function judgeEvent(card) {
  // Ключ читается в момент вызова: при локальном запуске .env подгружается
  // уже после импорта модуля, константой на уровне файла его не поймать.
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey || !card?.title) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    const res = await fetch(DEEPSEEK_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        temperature: 0,
        max_tokens: 200,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content:
              `Название: ${card.title}\n` +
              `Категория: ${card.category || '—'}\n` +
              `Город: ${card.city || '—'}\n` +
              `Адрес: ${card.address || '—'}\n` +
              `Ссылка: ${card.website || '—'}\n` +
              `Описание: ${card.description || '—'}`,
          },
        ],
      }),
      signal: controller.signal,
    });
    if (!res.ok) return null;

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) return null;
    return normalize(JSON.parse(content));
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
