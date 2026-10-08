// Безопасная работа с текстом перед отправкой в LLM.
//
// Зачем: обрезка строки «по символам» (`s.slice(0, N)`) режет суррогатную пару
// (эмодзи = 2 UTF-16 единицы) и оставляет в тексте одиночный суррогат. Такой
// текст проходит JSON.stringify, но парсер DeepSeek на нём падает:
//   HTTP 400 "Failed to parse the request body as JSON: messages[1].content:
//   unexpected end of hex escape at line 1 column N"
// и карточка уезжает в очередь к человеку (проверено 08.10.2026: 5 карточек,
// у одной описание обрезалось ровно на эмодзи 😈/🎯).
//
// Правило: любой текст, уходящий в API, прогнать через clipText(text, max)
// (обрезать, не разрывая пару) или wellFormedText(text).

/** Убрать одиночные суррогаты; валидные пары (эмодзи) сохранить */
export function wellFormedText(str) {
  const s = String(str ?? '');
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const n = s.charCodeAt(i + 1);
      if (n >= 0xdc00 && n <= 0xdfff) {
        out += s[i] + s[i + 1];
        i++;
      }
      // одиночный старший суррогат — выбрасываем
    } else if (c >= 0xdc00 && c <= 0xdfff) {
      // одиночный младший суррогат — выбрасываем
    } else {
      out += s[i];
    }
  }
  return out;
}

/** Обрезать до max UTF-16 единиц, не разрывая суррогатную пару, и вычистить одиночные суррогаты */
export function clipText(str, max) {
  const s = String(str ?? '');
  const limit = Math.max(0, Number(max) || 0);
  let cut = s;
  if (s.length > limit) {
    const last = s.charCodeAt(limit - 1);
    const cutAtPair = last >= 0xd800 && last <= 0xdbff ? limit - 1 : limit;
    cut = s.slice(0, cutAtPair);
  }
  return wellFormedText(cut);
}

/** Есть ли в тексте одиночный суррогат (диагностика) */
export function hasLoneSurrogate(str) {
  return wellFormedText(str).length !== String(str ?? '').length;
}
