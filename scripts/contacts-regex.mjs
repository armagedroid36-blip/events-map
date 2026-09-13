// Извлечение контактов из ТЕКСТА поста/описания события: WhatsApp, Telegram,
// телефон, email, Instagram.
//
// Зачем: коллекторы заполняли только contact_telegram — из ССЫЛОК поста
// (pickLinks → t.me). Контакты, написанные в тексте, терялись: например
// «Для записи пишите в WA: + 62 821 4462 5492» — номер не попадал в
// contact_whatsapp, хотя это единственный способ связи у организатора.
//
// Два питфола, из-за которых наивный regex не срабатывает:
//   1) «+ 62 …» — между «+» и цифрами ПРОБЕЛ (артефакт форматирования
//      Telegram), поэтому в шаблоне номера пробелы/переносы строки допустимы;
//   2) номер может быть перенесён на другую строку — перенос тоже допустим.
//
// Формат на выходе: номер — цифры с ведущим «+», если он был в тексте
// (пробелы, скобки, дефисы убираются: «+ 62 821 4462 5492» → «+628214462 5492» →
// «+6282146...»); Telegram — «@ник» (как normalizeTg в collect-tg); Instagram —
// ник без «@»; email — как есть. Не найдено → null.

/** Разряды/неразрывные пробелы → обычный пробел (номер может быть разбит) */
function flat(raw) {
  return String(raw ?? '')
    .replace(/[\u00A0\u202F\u2009]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Похоже на дату, а не на номер: «13.09.2026», «13.09», «13092026» */
function looksLikeDate(raw) {
  const s = flat(raw);
  if (/^\d{1,2}[.\-/]\d{1,2}(?:[.\-/]\d{2,4})?$/.test(s)) return true;
  const d = s.replace(/\D/g, '');
  const mm = Number(d.slice(2, 4));
  if (d.length === 8 && mm >= 1 && mm <= 12) return true;   // ддммгггг
  if (d.length === 6 && mm >= 1 && mm <= 12) return true;   // ддммгг
  return false;
}

/** Номер → цифры (+ ведущий плюс, если он был). Слишком короткий/длинный → '' */
function phoneNumber(raw) {
  const s = flat(raw);
  if (looksLikeDate(s)) return '';
  const digits = s.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) return ''; // E.164 и локальные форматы
  return (s.startsWith('+') ? '+' : '') + digits;
}

/** Числовой хвост после метки: «WA: + 62 …», «тел. 8 999 …» */
function afterLabel(text, labelSource, gap = 24) {
  const re = new RegExp(`${labelSource}[^\\d+]{0,${gap}}([+\\d][\\d\\s().\\-\\u00A0\\u202F]{6,})`, 'i');
  const m = re.exec(text);
  return m ? phoneNumber(m[1]) : '';
}

// Метки WhatsApp: WA, W/A, WhatsApp, ватсап/вотсап/вацап (RU-написания)
const WA_LABEL = '(?:\\bWA\\b|\\bW\\/A\\b|whats\\s?app|ватсап|вотсап|вацап|вотс\\s?ап|ва\\s?тс\\s?ап)';
// Метки телефона (без WhatsApp — им соответствует contact_phone).
// «тел» требует границы слова: иначе «тела/телесный» в текстах про йогу дают
// ложный номер из ближайшей даты («13.09.2026» → 13092026).
const PHONE_LABEL = '(?:(?<![A-Za-zА-Яа-яЁё])тел(?:\\.|ефон)?(?![A-Za-zА-Яа-яЁё])|звон(?:ите|ок|ить)|phone|call(?:\\s+me)?|номер)';
// Ссылки-контакты
const WA_LINK = /(?:wa\.me\/|api\.whatsapp\.com\/send\?phone=|whatsapp:\/\/send\?phone=)\+?(\d{8,15})/i;
const TG_LINK = /(?:t\.me|telegram\.me)\/([A-Za-z0-9_]{3,})/i;
// ВАЖНО: \b в JS работает только по ASCII, поэтому для «тг» используем
// lookbehind/lookahead по буквам/цифрам — иначе «в тг: @ник» не находится.
const TG_LABEL = /(?:телеграм|telegram|(?<![A-Za-z0-9_])тг(?![A-Za-z0-9_])|(?<![A-Za-z0-9_])tg(?![A-Za-z0-9_])|телега)\s*[:.\-–—]?\s*@?([A-Za-z0-9_]{4,})/i;
const IG_LINK = /instagram\.com\/([A-Za-z0-9_.]{3,})/i;
const IG_LABEL = /(?:инстаграм|instagram|(?<![A-Za-z0-9_])ig(?![A-Za-z0-9_]))\s*[:.\-–—]?\s*@?([A-Za-z0-9_.]{3,})/i;
const EMAIL = /[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/;
const TG_MENTION = /(?:^|[\s(])@([A-Za-z0-9_]{4,})\b/;
const TG_WORD = /телеграм|telegram|(?<![A-Za-z0-9_])тг(?![A-Za-z0-9_])|(?<![A-Za-z0-9_])tg(?![A-Za-z0-9_])/i;

/**
 * Контакты из текста. links — массив URL из поста (может отсутствовать):
 * wa.me и t.me ловим и по ссылкам, а не только по тексту.
 * @returns {{whatsapp: string|null, phone: string|null, telegram: string|null,
 *            email: string|null, instagram: string|null}}
 */
export function extractContacts(text, links = []) {
  const body = flat(text);
  const urls = (Array.isArray(links) ? links : []).map((l) => String(l || '')).join('\n');
  const all = `${body}\n${urls}`;

  const waLink = WA_LINK.exec(all);
  // Номер из ссылки wa.me приходит без «+» — приводим к международному виду
  const whatsapp = waLink
    ? phoneNumber(waLink[1].startsWith('0') ? waLink[1] : '+' + waLink[1])
    : afterLabel(body, WA_LABEL) || '';

  let phone = afterLabel(body, PHONE_LABEL);
  if (phone && phone === whatsapp) phone = ''; // тот же номер — не дублируем

  const tgLink = TG_LINK.exec(all);
  const tgLabel = TG_LABEL.exec(body);
  const tgMention = TG_WORD.test(body) ? TG_MENTION.exec(body) : null;
  const telegram = tgLink ? '@' + tgLink[1] : tgLabel ? '@' + tgLabel[1] : tgMention ? '@' + tgMention[1] : '';

  const email = EMAIL.exec(body);
  const igLink = IG_LINK.exec(all);
  const igLabel = IG_LABEL.exec(body);

  return {
    whatsapp: whatsapp || null,
    phone: phone || null,
    telegram: telegram || null,
    email: email ? email[0] : null,
    instagram: igLink ? igLink[1] : igLabel ? igLabel[1].replace(/[.,]+$/, '') : null,
  };
}
