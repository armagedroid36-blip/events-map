// Общий модуль: определение ДАТЫ события через LLM (DeepSeek).
// Дополняет regex-парсер parseDate в collect-tg.mjs — ловит нестандартные
// формулировки: «в следующую пятницу», «29 сентября в 19:00», «завтра» и т.п.
// Без DEEPSEEK_API_KEY или при любой ошибке возвращает null (работает старый
// парсер; сборка не падает).

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

/** Сегодняшняя дата в городе (UTC + tzMin) — строка 'ДД.ММ.ГГГГ' */
function todayInCity(tzMin) {
  const offset = Number(tzMin) || 420;
  const d = new Date(Date.now() + offset * 60000);
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}.${mm}.${d.getUTCFullYear()}`;
}

function systemPrompt(tzMin) {
  const tz = Math.floor((Number(tzMin) || 420) / 60);
  return (
    'Определи дату начала события из текста (и время, если указано). ' +
    'Сегодня в городе события: ' +
    todayInCity(tzMin) +
    ` (часовой пояс UTC+${tz}). ` +
    'Понимай относительные формулировки: «завтра», «в следующую пятницу», «в субботу», «29 сентября в 19:00», «вечером 12 числа». ' +
    'Названия месяцев — русские (январь…декабрь). Год: если в тексте нет года, возьми ближайший год, в котором дата ещё не прошла (учитывая «сегодня»). ' +
    'Ответь ТОЛЬКО JSON: {"start_date": "YYYY-MM-DD"|null, "start_time": "HH:MM"|null}. ' +
    'start_date — дата начала события в формате YYYY-MM-DD; start_time — время начала в 24-часовом формате (если указано), иначе null. ' +
    'Даты события в тексте нет → {"start_date": null, "start_time": null}. Не выдумывай дату, которой нет в тексте.'
  );
}

/**
 * Определить дату начала события по тексту через LLM.
 * @param {string} text текст поста
 * @param {number} [tzMin] смещение города от UTC в минутах (default 420 = UTC+7)
 * @returns {Promise<{start_date: string|null, start_time: string|null}|null>}
 *   null — нет ключа/ошибка/невалидный JSON; даты нет — {start_date: null, ...}
 */
export async function extractDateLLM(text, tzMin) {
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
          { role: 'system', content: systemPrompt(tzMin) },
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
    const date = typeof parsed.start_date === 'string' ? parsed.start_date.trim() : '';
    const time = typeof parsed.start_time === 'string' ? parsed.start_time.trim() : '';
    // Валидация форматов (защита от «мусора» модели)
    const dateOk = /^\d{4}-\d{2}-\d{2}$/.test(date);
    const timeOk = /^\d{2}:\d{2}$/.test(time);
    if (!dateOk && !timeOk) return { start_date: null, start_time: null };
    return {
      start_date: dateOk ? date : null,
      start_time: timeOk ? time : null,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
