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

/** Вернуть очищенное описание ('', если это ярлык). */
export function cleanDescription(text) {
  const s = String(text ?? '').trim();
  return isJunkDescription(s) ? '' : s;
}
