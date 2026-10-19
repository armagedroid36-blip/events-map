// Правило «интервальная карточка накрывает дату кандидата» (запуск 331).
//
// Класс, который это лечит: агрегатор (Cyprus Now) держит одну многодневную
// гонку/тур НЕСКОЛЬКИМИ записями с разными start_at — сборщик вставлял каждую
// запись отдельной карточкой (Leptos 4-day Challenge: 4 карточки; Lefkara
// Classic: 2). Ключ `title|start_date` такие записи не склеивает, а штатный
// дедуп требует совпадения дат.
//
// Правило (узкое, чтобы не съесть законные серии):
//   живая карточка с ТЕМ ЖЕ нормализованным названием и ТЕМ ЖЕ городом,
//   у которой интервал [start_date, end_date] длиной 2..60 дней,
//   накрывает дату кандидата (start < date <= end) ⇒ кандидат — копия.
//
// Серии (несколько вечеров/занятий) не затрагиваются: у их записей
// end_date = start_date (лента отдаёт end_at=null), т.е. интервала нет.

/** Нормализация названия: регистр, пунктуация, лишние пробелы. */
export function titleKey(title) {
  return String(title || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/**
 * Ядро названия без цифровых вкраплений: у записей одного многодневного
 * события агрегатор дописывает даты («… 4-day Challenge – 26-29.11.2026»,
 * «Leptos … 08.11»), поэтому сравнивать надо буквенные слова.
 */
export function coreTitle(title) {
  return titleKey(title)
    .split(' ')
    .filter((w) => /\p{L}/u.test(w))
    .join(' ');
}

/** Ядро одного названия содержит другое (минимум 15 знаков у короткого). */
export function titlesMatch(a, b) {
  const x = coreTitle(a);
  const y = coreTitle(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return short.length >= 15 && long.includes(short);
}

/** Город без служебного суффикса страны: «Лимасол, Кипр» → «лимасол». */
export function cityKey(city) {
  return String(city || '')
    .toLowerCase()
    .split(',')[0]
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

const DAY = 86400000;
function dayNum(s) {
  const d = String(s || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  return Math.round(Date.parse(`${d}T00:00:00Z`) / DAY);
}

export const MIN_SPAN_DAYS = 2;
export const MAX_SPAN_DAYS = 30;
const LIVE = new Set(['active', 'moderation', 'needs_changes']);

/**
 * Построить индекс интервалов из строк базы.
 * @param {Array} rows строки с полями title/title_ru/title_en, city, start_date, end_date, status
 */
export function buildIntervalIndex(rows) {
  const out = [];
  for (const r of rows || []) {
    if (r.status && !LIVE.has(r.status)) continue;
    const a = dayNum(r.start_date);
    const b = dayNum(r.end_date);
    if (a === null || b === null) continue;
    const span = b - a;
    if (span < MIN_SPAN_DAYS || span > MAX_SPAN_DAYS) continue;
    const city = cityKey(r.city);
    if (!city) continue;
    for (const t of [r.title, r.title_ru, r.title_en]) {
      const core = coreTitle(t);
      if (core.length >= 8) out.push({ key: titleKey(t), core, city, start: a, end: b });
    }
  }
  return out;
}

/**
 * Кандидат накрыт интервалом уже живущей карточки?
 * @param {Array} index результат buildIntervalIndex
 * @param {{title?:string, city?:string, start_date?:string}} cand
 * @param {{seriesCount?:number}} [opts] seriesCount — поле ленты `series_count`
 */
export function coveredByInterval(index, cand, opts = {}) {
  // ЗАЩИТА ОТ ЛОЖНЫХ (запуск 332): `series_count > 1` — запись ленты является ОДНОЙ
  // ИЗ СЕРИИ изданий/заездов, а не копией. Пример: Official Nicosia Christmas Market
  // (3 издания: 28-29.11, 12-13.12, 27.12) — карточка 28.11..21.12 накрывала 12.12 по
  // календарю, но 12.12 — ДРУГОЙ уикенд ярмарки; Regatta of Champions (series_count 2:
  // 09.11 и 11.11) — разные дни гонки. Без этой проверки правило съедало бы их.
  if (Number(opts && opts.seriesCount) > 1) return false;
  const key = titleKey(cand && cand.title);
  const core = coreTitle(cand && cand.title);
  const city = cityKey(cand && cand.city);
  const d = dayNum(cand && cand.start_date);
  if (!key || !city || d === null) return false;
  for (const it of index || []) {
    if (it.city !== city) continue;
    if (it.start >= d) continue; // кандидат не позже начала интервала — это сама карточка/раньше
    // Конец интервала НЕ накрывает: у туров окно кончается показом в ДРУГОМ городе
    // (Hans Zimmer 19–23.01: Никосия 23.01 — отдельное настоящее событие), поэтому
    // дата, равная end_date, копией не считается.
    if (d >= it.end) continue;
    if (it.key === key) return true;
    if (it.core === core) return true;
    const [short, long] = it.core.length <= core.length ? [it.core, core] : [core, it.core];
    if (short.length >= 15 && long.includes(short)) return true;
  }
  return false;
}
