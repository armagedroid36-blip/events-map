// Общий regex-fallback: адрес из текста поста (используется collect-tg.mjs
// и backfill-address.mjs, когда LLM недоступен или не дал ответа).
// Понимает строки с эмодзи-указателями (🪧📍📌🗺️🏠 и др.) и «Локация/Адрес/Место:».

/** Эмодзи-указатели места (начало строки адреса): пин, плашка, дом, карта и т.п. */
const ADDRESS_EMOJI = /[\u{1F3E0}\u{1F3E2}\u{1F3E6}\u{1F3E8}\u{1F3EA}\u{1F3EC}\u{1F3ED}\u{1F3EF}\u{1F4CD}\u{1F4CC}\u{1F5FA}\u{1F6A9}\u{1FAA7}\u{26EA}\u{26F2}]/u;

/**
 * Адрес из текста: строка с эмодзи-указателем или «Локация/Адрес/Место:».
 * Ведущий город, совпадающий с city, обрезается:
 * «🪧 Нячанг, Yen Garden Bistro» → «Yen Garden Bistro».
 * @param {string} text текст поста
 * @param {string} [city] город канала/события (для обрезки префикса)
 * @returns {string|null}
 */
export function extractAddress(text, city) {
  const lines = String(text || '').split(/\n/);
  for (const rawLine of lines) {
    let line = rawLine.trim();
    if (!line) continue;

    let rest = null;
    // 1) Строка начинается с эмодзи-указателя места
    const em = line.match(ADDRESS_EMOJI);
    if (em && em.index === 0 && line.slice(em[0].length).trim().length >= 3) {
      rest = line.slice(em[0].length).trim();
    }
    // 2) Или со слова «локация/адрес/место»
    if (rest === null) {
      const w = line.match(/^(?:локаци[яи]|адрес|место)\s*[:—-]?\s*(.+)$/i);
      if (w) rest = w[1].trim();
    }
    if (rest === null) continue;

    // После эмодзи может идти «📍 Локация: …» — снимаем повторное слово-указатель
    rest = rest.replace(/^(?:локаци[яи]|адрес|место)\s*[:—-]?\s*/i, '').trim();
    // Хвостовая пунктуация и пробелы
    rest = rest.replace(/[.,;:!?\s]+$/g, '').trim();
    if (rest.length < 3) continue;

    // Обрезаем ведущий город: «Нячанг, Yen Garden Bistro» → «Yen Garden Bistro»
    if (city) {
      const esc = city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      rest = rest.replace(new RegExp(`^${esc}\\s*[,:-]\\s*`, 'i'), '').trim();
    }
    if (rest.length >= 3) return rest;
  }
  return null;
}
