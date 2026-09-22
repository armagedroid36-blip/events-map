// LLM-судья автопроверки событий (DeepSeek), второй этап после правил.
// Задача: решить, соответствует ли карточка критериям публикации — нет мата,
// нет нарушения закона и морали, это действительно событие, а не реклама.
//
// Надёжность: разовые отказы API (429, 5xx, сеть, таймаут, битый ответ) не должны
// выбрасывать карточку в очередь к человеку — запрос повторяется до
// MODERATION_LLM_ATTEMPTS раз (по умолчанию 3) с паузами. Причина каждого отказа
// печатается в лог, итоговая — попадает в auto_review.reason карточки.
// Ошибки ключа/баланса (401/402/403) не повторяются: это не флак, а настройка.
//
// judgeEvent(card) → { verdict, flags, reason } | null  (null = «на проверку человеку»)
// judgeEventWithReason(card) → { ok: true, verdict, flags, reason } | { ok: false, error }

const DEEPSEEK_URL = process.env.MODERATION_LLM_URL || 'https://api.deepseek.com/v1/chat/completions';
const TIMEOUT_MS = Math.max(3000, Number(process.env.MODERATION_LLM_TIMEOUT_MS || 25000) || 25000);
const ATTEMPTS = Math.max(1, Number(process.env.MODERATION_LLM_ATTEMPTS || 3) || 3);
const BACKOFF_MS = [3000, 8000, 15000];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

function brief(text, max = 160) {
  return String(text || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

/**
 * Проверить карточку события LLM-судьёй, с повторами и понятной причиной отказа.
 * @param {{title: string, description?: string, city?: string, address?: string, category?: string, website?: string}} card
 * @returns {Promise<{ok: true, verdict: string, flags: string[], reason: string} | {ok: false, error: string}>}
 */
export async function judgeEventWithReason(card) {
  // Ключ читается в момент вызова: при локальном запуске .env подгружается
  // уже после импорта модуля, константой на уровне файла его не поймать.
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return { ok: false, error: 'нет DEEPSEEK_API_KEY' };
  if (!card?.title) return { ok: false, error: 'пустая карточка' };

  let lastError = 'нет ответа';

  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
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

      if (!res.ok) {
        const body = brief(await res.text().catch(() => ''));
        lastError = `HTTP ${res.status}${body ? ` — ${body}` : ''}`;
        if (res.status === 401 || res.status === 402 || res.status === 403) {
          // Ключ, баланс или доступ — повтор не поможет, сообщаем сразу.
          console.warn(`! LLM недоступен: ${lastError} (повторы не помогут)`);
          return { ok: false, error: lastError };
        }
        console.warn(`… LLM: попытка ${attempt}/${ATTEMPTS} — ${lastError}`);
      } else {
        const data = await res.json().catch(() => null);
        const content = data?.choices?.[0]?.message?.content;
        if (!content) {
          lastError = 'пустой ответ модели';
          console.warn(`… LLM: попытка ${attempt}/${ATTEMPTS} — ${lastError}`);
        } else {
          let parsed = null;
          try {
            parsed = normalize(JSON.parse(content));
          } catch {
            parsed = null;
          }
          if (parsed) return { ok: true, ...parsed };
          lastError = `ответ не по формату: ${brief(content, 80)}`;
          console.warn(`… LLM: попытка ${attempt}/${ATTEMPTS} — ${lastError}`);
        }
      }
    } catch (e) {
      lastError = e?.name === 'AbortError' ? `таймаут ${TIMEOUT_MS} мс` : `сеть: ${e?.message || e}`;
      console.warn(`… LLM: попытка ${attempt}/${ATTEMPTS} — ${lastError}`);
    } finally {
      clearTimeout(timer);
    }

    if (attempt < ATTEMPTS) await sleep(BACKOFF_MS[attempt - 1] ?? BACKOFF_MS[BACKOFF_MS.length - 1]);
  }

  console.warn(`! LLM не ответил после ${ATTEMPTS} попыток: ${lastError}`);
  return { ok: false, error: lastError };
}

/**
 * Совместимая обёртка: вердикт или null (null = карточка уходит на проверку человеку).
 * @param {{title: string}} card
 * @returns {Promise<{verdict: 'publish'|'review'|'reject', flags: string[], reason: string}|null>}
 */
export async function judgeEvent(card) {
  const res = await judgeEventWithReason(card);
  return res.ok ? { verdict: res.verdict, flags: res.flags, reason: res.reason } : null;
}
