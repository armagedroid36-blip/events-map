// Описание, которое не описание: ярлык вместо текста.
//
// Зачем: источник Cyprus Now в поле description кладёт не описание события, а
// имя исполнителя/строку состава («Balletto di Milano»). На карточке это
// рендерится как блок «О событии» с одним именем — читается как обрывок.
// Настоящее описание — фраза (есть знаки конца предложения) и обычно длиннее.
//
// Правило намеренно узкое: строка короче 25 знаков, без знаков . ! ? ; : , —
// то есть не предложение, а ярлык/имя.
const SENTENCE_MARKS = /[.!?;:,]/;

/** @param {unknown} text @returns {boolean} */
export function isJunkDescription(text) {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!s) return false;
  if (s.length >= 25) return false;
  if (SENTENCE_MARKS.test(s)) return false;
  return s.split(' ').filter(Boolean).length <= 4;
}

// Описание, повторяющее заголовок (источник Cyprus Now кладёт title и в description —
// напр. «CHASING LIFE | COLLECTIVE FRAMES», «Bachata – Beginner Course Thursdays in
// Limassol»): на карточке блок «О событии» дублирует название. Сравнение — по
// нормализованной строке (регистр, кавычки, пунктуация, пробелы).
const normDesc = (s) => String(s ?? '').trim().toLowerCase().replace(/[«»"'`.,!?]/g, '').replace(/\s+/g, ' ');

/** Совпадает ли описание с заголовком (описание не несёт новой информации). */
export function isTitleEcho(text, title) {
  const d = normDesc(text);
  const t = normDesc(title);
  return Boolean(d) && d === t;
}

/**
 * Вернуть очищенное описание ('', если это ярлык или повтор заголовка).
 * @param {unknown} text @param {unknown} [title] — заголовок карточки (для отсева повторов)
 */
export function cleanDescription(text, title) {
  const s = String(text ?? '').trim();
  if (isJunkDescription(s)) return '';
  if (isTitleEcho(s, title)) return '';
  return s;
}
