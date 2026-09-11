// Похожие события: другие активные события того же города И той же категории
// (план §2.8 «Внутренняя перелинковка», §4.1.4 «Похожие события»).
// Блок «Похожие события» на странице события связывает говорящие соседей —
// города и категории совпадают с посадочными «город × категория».
//
// ЗЕРКАЛЬНАЯ КОПИЯ логики scripts/seo-prerender.mjs (buildSimilarGroups /
// similarItems / similarEventsHtml): правила отбора, сортировки и гейт
// MIN_SIMILAR менять синхронно с пре-рендером, иначе статика и SPA покажут
// разные списки.
import type { EventItem } from './types';
import { cityPath } from './address';
import { occurrenceDate, seriesSiblings } from './series';

/** Сколько похожих событий максимум в блоке (как в пре-рендере) */
export const MAX_SIMILAR = 6;
/** Минимум кандидатов, при котором блок выводится (анти-тонкий контент) */
export const MIN_SIMILAR = 3;

/** Есть ли у события EN-версия страницы (title_en непуст ИЛИ исходник EN) —
 *  тот же признак hasEn, что в пре-рендере: на EN-странице ссылаться можно
 *  только на существующие /en/event/… (иначе ссылка ведёт в 404). */
function hasEnVersion(ev: EventItem): boolean {
  return Boolean(ev.title_en) || ev.source_lang === 'en';
}

/** Разница дат в днях (ISO YYYY-MM-DD): b − a; нечисловая дата — «далеко» */
function dayGap(a: string, b: string): number {
  const diff = (Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000;
  return Number.isFinite(diff) ? Math.round(diff) : Number.MAX_SAFE_INTEGER;
}

/**
 * Похожие события для страницы события: другие активные события того же
 * города (cityPath) и той же категории (category_id), кроме самого события и
 * дат его серии — они уже показаны в блоке «Другие даты серии».
 * Кандидаты сортируются по близости даты вхождения к дате самого события
 * (при равной разнице — более ранняя дата первой), в блок попадает не больше
 * MAX_SIMILAR, а вывод идёт по возрастанию даты. Меньше MIN_SIMILAR
 * кандидатов — пустой массив (блока нет).
 * events — уже загруженный список (api.listEvents, кэш 30 c); запросов здесь
 * нет, рендер карточки не блокируется. Для lang='en' остаются только события
 * с EN-версией страницы. Логика зеркальна similarItems в
 * scripts/seo-prerender.mjs — менять синхронно.
 */
export function similarEvents(
  event: EventItem,
  events: EventItem[],
  lang: 'ru' | 'en' = 'ru',
): EventItem[] {
  const path = cityPath(event.city);
  if (!path || !event.category_id) return [];
  const skip = new Set(seriesSiblings(event, events).map((ev) => ev.id));
  const own = occurrenceDate(event);
  const en = lang === 'en';
  const items = events
    .filter(
      (ev) =>
        ev &&
        typeof ev.id === 'string' &&
        typeof ev.title === 'string' &&
        Boolean(ev.title) &&
        ev.id !== event.id &&
        !skip.has(ev.id) &&
        cityPath(ev.city) === path &&
        ev.category_id === event.category_id &&
        (!en || hasEnVersion(ev)),
    )
    .map((ev) => ({ ev, occ: occurrenceDate(ev) }))
    .sort((a, b) => {
      const da = Math.abs(dayGap(a.occ, own));
      const db = Math.abs(dayGap(b.occ, own));
      if (da !== db) return da - db;
      // Равная разница (например ±7 дней) — первой идёт более ранняя дата
      return a.occ.localeCompare(b.occ);
    });
  if (items.length < MIN_SIMILAR) return [];
  return items
    .slice(0, MAX_SIMILAR)
    .sort((a, b) => a.occ.localeCompare(b.occ))
    .map((x) => x.ev);
}
