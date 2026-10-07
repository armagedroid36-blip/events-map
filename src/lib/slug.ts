// Слаг и транслит в чистых URL — ОДНА реализация на пре-рендер
// (scripts/seo-prerender.mjs) и на клиент (src/*). Скрипт импортирует этот
// файл напрямую: Node 22.18+ срезает типы TS сам (в CI node 22 — см.
// .github/workflows/rebuild-pages.yml), поэтому копий функции больше нет.
//
// Правило адресов событий (ТЗ 07.10.2026): хвост URL строится из ПЕРЕВОДА —
// RU из title_ru, EN из title_en. Название на языке оригинала (греческий и
// любой другой) самостоятельной версией не является: греческий транслит не
// нужен, в URL попадает только перевод. Оригинал — фолбэк, когда перевода
// нет (англоязычное событие: title и есть английское название).
//
// Пустой слаг или слаг без латинских букв (греческий оригинал без перевода,
// иероглифы, эмодзи, одни цифры) → `event-<первые 8 символов id>`: адрес
// остаётся уникальным и предсказуемым, а не превращается в «event»/«2026» у
// десятков разных событий (в sitemap такие URL не попадают).

/** Кириллица → латиница. Греческий алфавит НЕ транслитерируем: в URL он не
 *  попадает (адрес берётся из перевода), а самодельный транслит давал мусор
 *  («Οικογένεια Κουάξ» → «oikogeneia-kouax» у события, у которого есть
 *  title_ru/title_en). */
const RU_TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z',
  и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
  с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh',
  щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

/** Источник названий события: подходит и EventItem (src/lib/types.ts), и
 *  строка RPC-ответа в скрипте пре-рендера. */
export interface EventSlugSource {
  id?: string | null;
  title?: string | null;
  title_ru?: string | null;
  title_en?: string | null;
  source_lang?: string | null;
}

/** Язык публичной страницы — он же язык хвоста URL */
export type PageLang = 'ru' | 'en';

/** Слаг без фолбэка: пустая строка, если в названии нет ни букв, ни цифр
 *  латиницы/транслита. Порядок важен: сначала транслит кириллицы (пока это
 *  ещё кириллица), потом NFD — диакритика латиницы (Café → cafe,
 *  Machalárt → machalart), а не разделители. */
function slugifyRaw(title: unknown): string {
  return String(title ?? '')
    .toLowerCase()
    .replace(/[а-яё]/g, (ch) => RU_TRANSLIT[ch] ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** «Вечеринка у бассейна» → vecherinka-u-basseyna; «Da Nang night market» →
 *  da-nang-night-market. Пустой результат → 'event' (города, организации,
 *  имена файлов: там уникальность даёт сам ключ). */
export function slugify(title: string): string {
  return slugifyRaw(title) || 'event';
}

/** Название для RU-адреса: перевод, иначе оригинал, иначе EN-перевод */
export function eventTitleRu(ev: EventSlugSource | null | undefined): string {
  return ev?.title_ru || ev?.title || ev?.title_en || '';
}

/** Название для EN-адреса: EN-перевод, иначе оригинал (англоязычное событие) */
export function eventTitleEn(ev: EventSlugSource | null | undefined): string {
  return ev?.title_en || ev?.title || '';
}

/** Есть ли у события английское название — то есть ЖИВАЯ /en/event/... страница:
 *  перевод title_en или англоязычный оригинал (title на английском). Событие
 *  без английского названия EN-версии не имеет: страница не генерируется и в
 *  sitemap не попадает. Условие обязано совпадать в пре-рендере, в SPA
 *  (мета/ссылки/hreflang) и в фильтрах блоков «ещё события». */
export function eventHasEn(ev: EventSlugSource | null | undefined): boolean {
  return Boolean(ev?.title_en) || ev?.source_lang === 'en';
}

/** Хвост URL события на языке страницы: RU — слаг русского названия
 *  (title_ru), EN — английского (title_en). Фолбэк `event-<первые 8 символов
 *  id>`, если адреса из названия не выходит: пусто после транслита (греческий
 *  оригинал без перевода) ИЛИ в слаге нет ни одной латинской буквы — «2026»
 *  у трёх разных архивных кипрских событий (перевод не заполнен, в title_ru
 *  лежит греческое название) не адрес, а мусор, и в sitemap ему не место. */
export function eventSlug(
  ev: EventSlugSource | null | undefined,
  lang: PageLang,
): string {
  const title = lang === 'en' ? eventTitleEn(ev) : eventTitleRu(ev);
  const s = slugifyRaw(title);
  return /[a-z]/.test(s) ? s : `event-${String(ev?.id ?? '').slice(0, 8)}`;
}
