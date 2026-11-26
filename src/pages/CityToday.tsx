// Страница «город × сегодня» (посадочная под интент «events today …»).
//
// Статику пишет scripts/seo-prerender.mjs (блок #seo-today-block): крошка, h1,
// дата, список событий дня и блок «Ближайшие 7 дней». Здесь — тот же экран для
// SPA. В отличие от недельной/месячной посадочных, страница СУЩЕСТВУЕТ ВСЕГДА:
// гейт (>= 3 событий сегодня) решает не наличие страницы, а индексируемость —
// при недоборе SPA ставит meta robots noindex, follow (как статика) и
// показывает «Сегодня событий нет» + ближайшие события, а не 404.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Header from '../components/Header';
import { getApi } from '../lib/api';
import {
  CITY_NAME_BY_PATH,
  CITY_NAME_RU,
  CITY_NAME_RU_LOCATIVE,
  cityPath,
  isCyprusCity,
  placeLabel,
} from '../lib/address';
import type { CityPath } from '../lib/address';
import {
  categoryCells,
  categoryPageHref,
  categoryPagePublished,
} from '../lib/categoryPages';
import { eventOccursOn } from '../lib/calendar';
import { nextOccurrenceDate } from '../lib/recurrence';
import { eventHasEn, eventPageHref } from '../lib/slug';
import { applyTodayMeta, enDate, ruDate } from '../lib/seo';
import type { Category, EventItem } from '../lib/types';

const TODAY_MIN_EVENTS = 3;
const UPCOMING_LIMIT = 6;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
function addDaysIso(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

function priceText(ev: EventItem, en: boolean): string {
  const price = ev.price != null ? Number(ev.price) : null;
  if (price != null && price > 0) {
    return `${price} ${(ev.currency || 'usd').toUpperCase()}`;
  }
  if (ev.donation) return en ? 'Donation' : 'Донат';
  if (price === 0) return en ? 'Free' : 'Бесплатно';
  return '';
}

function pluralRu(n: number): string {
  const abs = Math.abs(n) % 100;
  const tail = abs % 10;
  if (abs > 10 && abs < 20) return 'событий';
  if (tail === 1) return 'событие';
  if (tail >= 2 && tail <= 4) return 'события';
  return 'событий';
}

export default function CityToday({ path }: { path: CityPath }) {
  const { i18n, t } = useTranslation();
  const en = i18n.language.startsWith('en');
  const [events, setEvents] = useState<EventItem[] | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);

  useEffect(() => {
    let alive = true;
    getApi()
      .listEvents()
      .then((list) => {
        if (alive) setEvents(list);
      })
      .catch(() => {
        if (alive) setEvents([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    getApi()
      .getCategories()
      .then((list) => {
        if (alive) setCategories(list);
      })
      .catch(() => {
        /* категорий нет — блок категорий просто не показываем */
      });
    return () => {
      alive = false;
    };
  }, []);

  const inCity = useCallback(
    (ev: EventItem) =>
      path === 'cyprus' ? isCyprusCity(ev.city) : cityPath(ev.city) === path,
    [path],
  );

  const today = todayIso();

  // События, которые ИДУТ сегодня, — правило eventOccursOn из lib/calendar.ts
  // (то же, что у карты и календаря): многодневное событие, начавшееся раньше
  // и идущее сейчас, тоже в списке. На EN — только с EN-версией.
  const list = useMemo(() => {
    if (!events) return [];
    return events
      .filter((ev) => {
        if (!inCity(ev)) return false;
        if (!eventOccursOn(ev, today)) return false;
        if (en && !eventHasEn(ev)) return false;
        return true;
      })
      .sort(
        (a, b) =>
          String(a.start_time || '').localeCompare(String(b.start_time || '')) ||
          String(a.id).localeCompare(String(b.id)),
      );
  }, [events, en, inCity, today]);

  // «Ближайшие 7 дней» — те же правила, что в статике: события дня сюда не
  // дублируются (одна карточка = одна строка на странице).
  const todayIds = useMemo(() => new Set(list.map((ev) => ev.id)), [list]);
  const upcoming = useMemo(() => {
    if (!events) return [];
    const end = addDaysIso(today, 7);
    return events
      .filter((ev) => {
        if (!inCity(ev)) return false;
        if (todayIds.has(ev.id)) return false;
        const next = nextOccurrenceDate(ev, today);
        if (!next || next <= today || next > end) return false;
        if (en && !eventHasEn(ev)) return false;
        return true;
      })
      .sort(
        (a, b) =>
          String(nextOccurrenceDate(a, today)).localeCompare(
            String(nextOccurrenceDate(b, today)),
          ) || String(a.id).localeCompare(String(b.id)),
      )
      .slice(0, UPCOMING_LIMIT);
  }, [events, en, inCity, today, todayIds]);

  // Сколько событий дня с EN-версией — гейт пары для hreflang (как в статике).
  const enTodayCount = useMemo(() => {
    if (!events) return 0;
    return events.filter(
      (ev) => inCity(ev) && eventOccursOn(ev, today) && eventHasEn(ev),
    ).length;
  }, [events, inCity, today]);

  const indexable = list.length >= TODAY_MIN_EVENTS;
  const hasEn = indexable && enTodayCount >= TODAY_MIN_EVENTS;

  const venues = useMemo(() => {
    const out: string[] = [];
    for (const ev of list) {
      const short = String(placeLabel(ev.address, ev.city, en ? 'en' : 'ru') || '')
        .split(',')[0]
        .trim();
      if (short && !out.includes(short)) out.push(short);
      if (out.length >= 3) break;
    }
    return out;
  }, [list, en]);

  useEffect(() => {
    if (!events) return;
    applyTodayMeta(path, en ? 'en' : 'ru', list.length, today, hasEn, venues);
  }, [events, list.length, path, en, hasEn, today, venues]);

  const cells = useMemo(() => categoryCells(events ?? []), [events]);
  const categoryLinks = useMemo(
    () =>
      categories
        .filter((c) => categoryPagePublished(cells, path, c.id))
        .map((c) => ({
          id: c.id,
          href: categoryPageHref(path, c.id, en ? 'en' : 'ru'),
          label: `${c.emoji} ${en ? c.name_en : c.name_ru}`.trim(),
        })),
    [categories, cells, path, en],
  );

  if (!events) {
    return (
      <div className="flex min-h-screen flex-col bg-white">
        <Header />
        <main className="mx-auto w-full max-w-2xl flex-1 p-4" />
      </div>
    );
  }

  const name = en ? CITY_NAME_BY_PATH[path] : CITY_NAME_RU_LOCATIVE[path] || path;
  const cityNameRu = CITY_NAME_RU_LOCATIVE[path] || path;
  const date = en ? enDate(today) : ruDate(today);
  const hubHref = `${en ? '/en' : ''}/${path}/`;
  const weekHref = `${en ? '/en' : ''}/${path}/this-week/`;
  const free = list.filter((ev) => ev.price != null && Number(ev.price) === 0).length;

  const intro = list.length
    ? en
      ? `${list.length} ${list.length === 1 ? 'event' : 'events'} on ${date}: concerts, meetups, workshops and parties with venues and prices.${venues.length ? ` Venues: ${venues.join(', ')}.` : ''}${free > 0 ? ` There are ${free} free events today.` : ' Most events are ticketed.'}`
      : `${list.length} ${pluralRu(list.length)} ${cityNameRu} на ${date}: концерты, встречи, мастер-классы и вечеринки с площадками и ценами.${venues.length ? ` Площадки дня: ${venues.join(', ')}.` : ''}${free > 0 ? ` Бесплатных событий сегодня: ${free}.` : ' Большинство событий по билетам.'}`
    : en
      ? `There are no events in ${name} today. The nearest dates are below — the list is updated every day.`
      : `Сегодня ${cityNameRu} событий нет. Ниже — ближайшие даты; афиша обновляется каждый день.`;

  const row = (ev: EventItem) => {
    // Многодневное разовое событие, начавшееся раньше: диапазон дат в подписи,
    // datetime — дата старта (как в статике).
    const multiDay =
      !ev.recurrence &&
      typeof ev.end_date === 'string' &&
      ev.end_date > ev.start_date &&
      ev.start_date < today;
    const occ = multiDay ? ev.start_date : String(nextOccurrenceDate(ev, today));
    const dateLabel = multiDay
      ? `${en ? enDate(ev.start_date) : ruDate(ev.start_date)} – ${en ? enDate(ev.end_date!) : ruDate(ev.end_date!)}`
      : en
        ? enDate(occ)
        : ruDate(occ);
    const href = eventPageHref(ev, en ? 'en' : 'ru') || '#';
    const title = en
      ? ev.title_en || ev.title || ev.title_ru || ''
      : ev.title_ru || ev.title || ev.title_en || '';
    const place = placeLabel(ev.address, ev.city, en ? 'en' : 'ru');
    const price = priceText(ev, en);
    const time = String(ev.start_time || '').slice(0, 5);
    return (
      <li key={ev.id}>
        <time dateTime={occ}>{dateLabel}</time>
        {/^\d{2}:\d{2}$/.test(time) ? ` — ${time}` : ''}
        {' — '}
        <a href={href} className="underline">
          {title}
        </a>
        {place ? ` — ${place}` : ''}
        {price ? ` — ${price}` : ''}
      </li>
    );
  };

  const faq: [string, string][] = en
    ? [
        [
          `What is happening in ${name} today?`,
          list.length
            ? `${list.length} ${list.length === 1 ? 'event' : 'events'} on ${date}. The full list with venues and prices is on this page.`
            : `There are no events in ${name} today. The nearest dates are in the “Next 7 days” block.`,
        ],
        [
          'How much do the events cost?',
          free > 0
            ? `Prices are shown in each card; ${free} ${free === 1 ? 'event is' : 'events are'} free today.`
            : 'All events are ticketed — the price is shown in each card.',
        ],
        [
          'How do I find events on another date?',
          `Use the date filter on the map or the “Next 7 days” block — the weekly page lists everything for the coming week.`,
        ],
      ]
    : [
        [
          `Что происходит ${cityNameRu} сегодня?`,
          list.length
            ? `${list.length} ${pluralRu(list.length)} ${cityNameRu} на ${date}. Полный список с площадками и ценами — на этой странице.`
            : `Сегодня ${cityNameRu} событий нет. Ближайшие даты — в блоке «Ближайшие 7 дней».`,
        ],
        [
          'Сколько стоят события?',
          free > 0
            ? `Цена указана в каждой карточке; бесплатных событий сегодня: ${free}.`
            : 'Все события по билетам — цена указана в карточке события.',
        ],
        [
          'Как найти события на другую дату?',
          'Откройте карту и фильтр по дате — или блок «Ближайшие 7 дней»: на странице недели собраны все события на неделю вперёд.',
        ],
      ];

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <Header />
      <main className="mx-auto w-full max-w-2xl flex-1 p-4">
        <nav aria-label={en ? 'Breadcrumbs' : 'Хлебные крошки'} className="text-sm text-gray-500">
          <p>
            <a href={en ? '/en/' : '/'} className="underline">
              {en ? 'Home' : 'Главная'}
            </a>
            {' › '}
            <a href={hubHref} className="underline">
              {en ? CITY_NAME_BY_PATH[path] : CITY_NAME_RU_LOCATIVE[path]}
            </a>
            {' › '}
            <span>{t('todayPage.crumb')}</span>
          </p>
        </nav>
        <h1 className="mt-4 text-2xl font-semibold text-gray-900">
          {t('todayPage.h1', { city: en ? CITY_NAME_BY_PATH[path] : CITY_NAME_RU[path] })}
        </h1>
        <p className="mt-2 text-sm text-gray-500">
          {t('todayPage.dateLabel')}: <time dateTime={today}>{date}</time>
        </p>
        <p className="mt-3 text-sm leading-relaxed text-gray-700">{intro}</p>
        {list.length > 0 && (
          <>
            <h2 className="mt-5 text-base font-semibold text-gray-900">
              {t('todayPage.eventsHeading', { date })}
            </h2>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-gray-700">
              {list.map(row)}
            </ul>
          </>
        )}
        {list.length === 0 && (
          <h2 className="mt-5 text-base font-semibold text-gray-900">{t('todayPage.empty')}</h2>
        )}
        {upcoming.length > 0 && (
          <>
            <h2 className="mt-6 text-base font-semibold text-gray-900">
              {t('todayPage.upcoming')}
            </h2>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-gray-700">
              {upcoming.map(row)}
            </ul>
          </>
        )}
        <p className="mt-5 text-sm">
          <a href={weekHref} className="underline">
            {t('todayPage.weekLink')}
          </a>
        </p>
        {categoryLinks.length > 0 && (
          <p className="mt-3 text-sm text-gray-700">
            {t('todayPage.categories')}:{' '}
            {categoryLinks.map((c, i) => (
              <span key={c.id}>
                {i > 0 ? ' · ' : ''}
                <a href={c.href} className="underline">
                  {c.label}
                </a>
              </span>
            ))}
          </p>
        )}
        <p className="mt-3 text-sm">
          <a href={hubHref} className="underline">
            {t('todayPage.hubLink', { city: en ? CITY_NAME_BY_PATH[path] : cityNameRu })}
          </a>
        </p>
        <section className="mt-6 space-y-2 text-sm text-gray-700">
          <h2 className="text-base font-semibold text-gray-900">{t('citySeo.faqTitle')}</h2>
          {faq.map(([q, a]) => (
            <details key={q}>
              <summary className="cursor-pointer">{q}</summary>
              <p className="mt-1">{a}</p>
            </details>
          ))}
        </section>
      </main>
    </div>
  );
}
