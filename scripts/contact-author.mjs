// Контакт из ПОДПИСИ поста: «Пост от: Misha | MISH.REC» → аккаунт t.me/mish_rec.
//
// Проблема: в афишных каналах автор поста часто подписывается строкой вида
// «Пост от: <Имя> | <Бренд>». В приложении Telegram это имя кликабельно (подпись
// администратора ведёт на аккаунт), но в HTML t.me/s ссылки НЕТ — это обычный
// текст, поэтому коллектор не мог поставить contact_telegram.
//
// Решение (без угадывания «наугад»):
//   1) если в посте есть ЯКОРЬ, текст которого совпадает с подписью, — берём его
//      href (самый надёжный путь: организатор сам поставил ссылку);
//   2) иначе строим кандидатов-ников из латинских частей подписи
//      (MISH.REC → mish_rec / mishrec) и проверяем t.me/<ник>: аккаунт
//      принимается ТОЛЬКО если его display-name (og:title) содержит все
//      латинские слова подписи. Совпадение по названию — обязательное условие,
//      случайный однофамилец не подставится.
//   3) Кириллические подписи не разбираем (ник из них не вывести) — контакта не будет.

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36';

/** «Пост от: X» / «Автор: X» / «Организатор: X» / «От: X» → X (одна строка) */
export function signatureOf(text) {
  const m = /(?:^|[\n\r])\s*(?:📌|✍️|👤)?\s*(?:Пост\s+от|Автор|Организатор|От)\s*[:—-]\s*([^\n\r]{2,70})/i.exec(String(text || ''));
  return m ? m[1].trim().replace(/\s+/g, ' ') : null;
}

/** Нормализация: только строчные буквы/цифры (для сравнения названий) */
function norm(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/gi, '');
}

/** Слова подписи: латиница/цифры длиной >= 3 (для сверки с display-name) */
function tokens(signature) {
  return String(signature || '')
    .split(/[^\p{L}\p{N}]+/u)
    .map((t) => t.trim())
    .filter((t) => /^[A-Za-z][A-Za-z0-9]{2,}$/.test(t))
    .map((t) => t.toLowerCase());
}

/**
 * Кандидаты-ники из подписи. Сначала «брендовая» часть (после | — MISH.REC →
 * mish_rec / mishrec), затем отдельные слова и их склейки: в афишных каналах
 * контакт — обычно бренд автора, а не имя.
 */
function candidates(signature) {
  const out = new Set();
  const parts = String(signature || '')
    .split(/[|/,·•]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  for (const part of parts) {
    const whole = part.replace(/[^\p{L}\p{N}]+/gu, '_').toLowerCase();
    const glued = part.replace(/[^\p{L}\p{N}]+/gu, '').toLowerCase();
    for (const c of [whole, glued]) if (/^[a-z0-9_]{4,32}$/.test(c)) out.add(c);
  }
  for (const part of parts) {
    const words = part.split(/[^\p{L}\p{N}]+/u).filter((w) => /^[A-Za-z][A-Za-z0-9]{2,}$/.test(w));
    if (!words.length) continue;
    for (const w of words) {
      const c = w.toLowerCase();
      if (/^[a-z0-9_]{4,32}$/.test(c)) out.add(c);
    }
    const joined = words.join('_').toLowerCase();
    if (/^[a-z0-9_]{4,32}$/.test(joined)) out.add(joined);
  }
  return [...out].slice(0, 10);
}

/** og:title страницы t.me/<ник> (null — нет такого/сеть/ошибка) */
async function titleOf(nick, timeoutMs = 10000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(`https://t.me/${nick}`, { headers: { 'User-Agent': UA }, signal: ctl.signal });
    if (!res.ok) return null;
    const html = await res.text();
    const m = html.match(/<meta\s+property="og:title"\s+content="([^"]*)"/i);
    return m ? m[1] : null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/** Настоящее display-name аккаунта? «Telegram: Contact @nick» — заглушка
 *  (её og:title содержит сам ник, поэтому по ней нельзя сверять подпись). */
function displayName(title) {
  const t = String(title || '').trim();
  if (!t) return null;
  if (/^Telegram:\s*Contact\s*@/i.test(t)) return null;
  if (t.split(/\s+/).length < 2 && t.length < 6) return null;
  return t;
}

/**
 * Контакт-аккаунт по подписи поста.
 * @param {{text: string, anchors?: Array<{href: string, text: string}>, log?: (m: string) => void}} p
 * @returns {Promise<string|null>} «@ник» или null
 */
export async function resolveAuthorContact({ text, anchors = [], log } = {}) {
  const sig = signatureOf(text);
  if (!sig) return null;
  const words = tokens(sig);
  if (!words.length) return null; // кириллическая подпись — не разбираем

  // 1) Якорь с текстом подписи (организатор поставил ссылку сам)
  for (const a of anchors) {
    const nick = /(?:t\.me|telegram\.me)\/([A-Za-z0-9_]{4,})/.exec(a.href || '');
    if (!nick) continue;
    const t = norm(a.text);
    if (t && words.every((w) => t.includes(w))) {
      if (log) log(`  ⇢ подпись «${sig}» → якорь @${nick[1]}`);
      return '@' + nick[1];
    }
  }

  // 2) Кандидаты-ники + сверка display-name аккаунта
  for (const cand of candidates(sig)) {
    const title = displayName(await titleOf(cand));
    if (!title) continue;
    const t = norm(title);
    if (words.every((w) => t.includes(w))) {
      if (log) log(`  ⇢ подпись «${sig}» → аккаунт @${cand} («${title}»)`);
      return '@' + cand;
    }
  }
  return null;
}
