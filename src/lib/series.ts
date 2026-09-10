// Серии событий: одно название + одно место, много дат (Фаза 2 SEO-промпта).
// Внутри серии <title>/og:title страницы совпадали, поэтому даты серии
// связываются внутренними ссылками «Другие даты серии».
//
// ЗЕРКАЛЬНАЯ КОПИЯ логики scripts/seo-prerender.mjs (buildSeries /
// seriesPlaceKey / titleAliases / occurrence): правила «то же название» и
// «то же место» менять синхронно с пре-рендером, иначе статика и SPA
// покажут разные списки.
import type { EventItem } from './types';
import { todayIso } from './dates';
import { nextOccurrenceDate } from './recurrence';

/** Сколько ближайших дат серии показывать в карточке (как в пре-рендере) */
export const SERIES_MAX_DATES = 5;
/** Округление координат до 3 знаков = «то же место» ~110 м */
const SERIES_COORD_DECIMALS = 3;

/** Нормализация названия для ключа серии: регистр и пробелы не важны */
function normTitleKey(v: string | null | undefined): string {
  return String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Ключ места: округлённые координаты, без координат — адрес; иначе null.
 * Валидность координат — как isValidCoords (lib/coords.ts). */
function seriesPlaceKey(ev: EventItem): string | null {
  const lat = Number(ev.lat);
  const lng = Number(ev.lng);
  if (
    ev.lat != null &&
    ev.lng != null &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    !(lat === 0 && lng === 0) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180
  ) {
    return `${lat.toFixed(SERIES_COORD_DECIMALS)},${lng.toFixed(SERIES_COORD_DECIMALS)}`;
  }
  const addr = normTitleKey(ev.address);
  return addr ? `addr:${addr}` : null;
}

/** Варианты названия карточки (RU и EN) — как titleAliases в dedupe-events.mjs */
function titleAliases(ev: EventItem): string[] {
  const out = new Set<string>();
  for (const t of [ev.title_ru, ev.title, ev.title_en]) {
    const n = normTitleKey(t);
    if (n) out.add(n);
  }
  return [...out];
}

/** Дата вхождения события (ближайшее будущее — как JSON-LD startDate) */
export function occurrenceDate(ev: EventItem): string {
  return nextOccurrenceDate(ev, todayIso());
}

/**
 * Другие даты серии для события: то же место (округлённые координаты или
 * адрес) + любое общее название, но другая дата вхождения. Отсортировано по
 * дате, не длиннее SERIES_MAX_DATES. Пустой массив — событие не в серии.
 * events — уже загруженный список (api.listEvents, кэш 30 c); запросов здесь
 * нет, рендер карточки не блокируется.
 */
export function seriesSiblings(event: EventItem, events: EventItem[]): EventItem[] {
  const place = seriesPlaceKey(event);
  if (!place) return [];
  const mine = titleAliases(event);
  if (!mine.length) return [];
  const own = occurrenceDate(event);
  return events
    .filter(
      (ev) =>
        ev &&
        ev.id !== event.id &&
        seriesPlaceKey(ev) === place &&
        occurrenceDate(ev) !== own &&
        titleAliases(ev).some((a) => mine.includes(a)),
    )
    .sort((a, b) => occurrenceDate(a).localeCompare(occurrenceDate(b)))
    .slice(0, SERIES_MAX_DATES);
}
