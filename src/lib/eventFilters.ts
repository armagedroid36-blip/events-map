// Общая логика фильтров событий — используется на главной (Home) и в
// «Избранном» (Favorites). Единая реализация, чтобы поведение совпадало.
import type { EventItem, Filters } from './types';
import { isUpcoming, todayIso, tomorrowIso } from './dates';
import { recurrenceMatchesDate } from './recurrence';
import { cityMatches } from './cities';
import { eventCountry } from './countries';

/** Фильтры по умолчанию (без ограничений) */
export const DEFAULT_FILTERS: Filters = {
  categoryId: null,
  date: undefined,
  price: 'any',
  priceMin: undefined,
  priceMax: undefined,
  currency: null,
  language: null,
  country: null,
  city: undefined,
  query: undefined,
};

// Примерные курсы к USD (без внешних API): цена события приводится к USD
// для сравнения с диапазоном фильтра. Неизвестная валюта = как USD.
const CURRENCY_TO_USD: Record<string, number> = {
  usd: 1,
  idr: 15500,
  vnd: 24500,
  thb: 34,
  sgd: 1.34,
  myr: 4.2,
  php: 56,
  eur: 0.92,
  rub: 88,
};

function toUsd(price: number, currency?: string | null): number {
  const rate = CURRENCY_TO_USD[(currency ?? 'usd').toLowerCase()] ?? 1;
  return price / rate;
}

/** Проходит ли событие фильтры: категория, дата, цена, валюта, язык, страна, город, запрос */
export function eventMatchesFilters(ev: EventItem, filters: Filters): boolean {
  const q = (filters.query ?? '').toLowerCase();
  const city = filters.city ?? '';
  if (filters.categoryId && ev.category_id !== filters.categoryId) return false;
  // По умолчанию — только предстоящие (прошедшие скрыты);
  // выбранная дата в фильтре — поверх, показывает события этого дня
  if (!filters.date && !isUpcoming(ev)) return false;
  // Дата: событие проходит в выбранный день (сегодня / завтра / конкретная дата)
  if (filters.date) {
    const d =
      filters.date === 'today'
        ? todayIso()
        : filters.date === 'tomorrow'
          ? tomorrowIso()
          : filters.date;
    const end = ev.end_date ?? ev.start_date;
    if (ev.recurrence) {
      if (!recurrenceMatchesDate(ev, d)) return false;
    } else {
      if (ev.start_date > d || end < d) return false;
    }
  }
  // Цена: бесплатные (price = null или 0), платные (price > 0) или донат + диапазон
  if (filters.price === 'free' && ev.price != null && ev.price > 0) return false;
  if (filters.price === 'paid' && (ev.price == null || ev.price <= 0)) return false;
  if (filters.price === 'donation' && !ev.donation) return false;
  // Диапазон цены считается в USD: конвертируем цену события по курсу валюты
  if ((filters.price === 'any' || filters.price === 'paid') && ev.price != null && ev.price > 0) {
    const usd = toUsd(ev.price, ev.currency);
    if (filters.priceMin != null && usd < filters.priceMin) return false;
    if (filters.priceMax != null && usd > filters.priceMax) return false;
  }
  // Валюта, язык и страна
  if (filters.currency && ev.currency !== filters.currency) return false;
  if (filters.language && ev.language !== filters.language) return false;
  if (filters.country) {
    const ec = eventCountry(ev);
    // «Другие» — события, чью страну не удалось определить
    if (filters.country === 'other' ? ec !== '' : ec !== filters.country) return false;
  }
  // Город: работает и по-русски, и по-английски («Убуд» = «Ubud»)
  if (city && !cityMatches(ev.city, city)) return false;
  if (q) {
    const hay = `${ev.title} ${ev.description} ${ev.city}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}
