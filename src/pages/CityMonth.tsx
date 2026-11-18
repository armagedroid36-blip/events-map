// Страница «город × месяц» (Фаза 4, батч 2).
//
// Статику пишет scripts/seo-prerender.mjs (#seo-month-block): крошка, h1,
// интро из фактов месяца, список событий месяца, FAQ и ссылки. Здесь — тот же
// экран для SPA, чтобы после гидратации не было расхождений и второго h1.
// Набор — уже загруженные активные события; окно = календарный месяц ключа
// monthKey ('november-2026'), гейт ≥3 события (иначе прежняя 404-заглушка).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Header from '../components/Header';
import NotFound from '../components/NotFound';
import { getApi } from '../lib/api';
import {
  CITY_NAME_BY_PATH,
  CITY_NAME_RU_LOCATIVE,
  cityLocativeRu,
  cityPath,
  isCyprusCity,
  placeLabel,
} from '../lib/address';
import type { CityPath } from '../lib/address';
import { nextOccurrenceDate } from '../lib/recurrence';
import { eventPageHref } from '../lib/slug';
import { applyMonthMeta, enDate, ruDate } from '../lib/seo';
import type { EventItem } from '../lib/types';

const MONTH_MIN_EVENTS = 3;
const MONTH_LIST_LIMIT = 50;
const MONTHS_EN_LOWER = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];
const RU_MONTHS_NOM = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];
const RU_MONTHS_PREP = [
  'январе', 'феврале', 'марте', 'апреле', 'мае', 'июне',
  'июле', 'августе', 'сентябре', 'октябре', 'ноябре', 'декабре',
];

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function monthWindow(monthKey: string): { start: string; end: string } | null {
  const m = /^([a-z]+)-(\d{4})$/.exec(monthKey);
  if (!m) return null;
  const idx0 = MONTHS_EN_LOWER.indexOf(m[1]);
  if (idx0 < 0) return null;
  const year = Number(m[2]);
  const lastDay = new Date(Date.UTC(year, idx0 + 1, 0)).getUTCDate();
  return {
    start: `${year}-${String(idx0 + 1).padStart(2, '0')}-01`,
    end: `${year}-${String(idx0 + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
  };
}

function monthLabel(monthKey: string, en: boolean, mode: 'plain' | 'prep' | 'cap' = 'plain'): string {
  const m = /^([a-z]+)-(\d{4})$/.exec(monthKey);
  if (!m) return monthKey;
  const idx0 = MONTHS_EN_LOWER.indexOf(m[1]);
  if (idx0 < 0) return monthKey;
  if (en) {
    const enName = m[1].charAt(0).toUpperCase() + m[1].slice(1);
    return `${enName} ${m[2]}`;
  }
  if (mode === 'prep') return `${RU_MONTHS_PREP[idx0]} ${m[2]}`;
  if (mode === 'cap') return `${RU_MONTHS_NOM[idx0]} ${m[2]}`;
  return `${RU_MONTHS_NOM[idx0].toLowerCase()} ${m[2]}`;
}

function priceText(ev: EventItem, en: boolean): string {
  const price = ev.price != null ? Number(ev.price) : null;
  if (price != null && price > 0) return `${price} ${(ev.currency || 'usd').toUpperCase()}`;
  if (ev.donation) return en ? 'Donation' : 'Донат';
  if (price === 0) return en ? 'Free' : 'Бесплатно';
  return '';
}

export default function CityMonth({ path, monthKey }: { path: CityPath; monthKey: string }) {
  const { i18n } = useTranslation();
  const en = i18n.language.startsWith('en');
  const [events, setEvents] = useState<EventItem[] | null>(null);
  const window_ = monthWindow(monthKey);

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

  const list = useMemo(() => {
    if (!events || !window_) return [];
    const start = todayIso();
    return events
      .filter((ev) => {
        const inCity = path === 'cyprus' ? isCyprusCity(ev.city) : cityPath(ev.city) === path;
        if (!inCity) return false;
        const next = nextOccurrenceDate(ev, start);
        if (!next || next < window_.start || next > window_.end) return false;
        if (en && !(ev.title_en || ev.source_lang === 'en')) return false;
        return true;
      })
      .sort((a, b) => {
        const da = String(nextOccurrenceDate(a, start));
        const db = String(nextOccurrenceDate(b, start));
        return da.localeCompare(db) || String(a.id).localeCompare(String(b.id));
      })
      .slice(0, MONTH_LIST_LIMIT);
  }, [events, path, en, window_]);

  const hasEn = useMemo(() => {
    if (!events || !window_) return false;
    const start = todayIso();
    return (
      events.filter((ev) => {
        const inCity = path === 'cyprus' ? isCyprusCity(ev.city) : cityPath(ev.city) === path;
        if (!inCity) return false;
        const next = nextOccurrenceDate(ev, start);
        return (
          Boolean(next) &&
          next >= window_.start &&
          next <= window_.end &&
          Boolean(ev.title_en || ev.source_lang === 'en')
        );
      }).length >= MONTH_MIN_EVENTS
    );
  }, [events, path, window_]);

  const applyMeta = useCallback(() => {
    if (!events) return;
    applyMonthMeta(path, en ? 'en' : 'ru', list.length, monthKey, hasEn);
  }, [events, list.length, path, en, monthKey, hasEn]);

  useEffect(() => {
    applyMeta();
  }, [applyMeta]);

  if (!events) {
    return (
      <div className="flex min-h-screen flex-col bg-white">
        <Header />
        <main className="mx-auto w-full max-w-2xl flex-1 p-4" />
      </div>
    );
  }
  if (!window_ || list.length < MONTH_MIN_EVENTS) return <NotFound />;

  const loc = en ? CITY_NAME_BY_PATH[path] : CITY_NAME_RU_LOCATIVE[path];
  const locRu = cityLocativeRu(path === 'cyprus' ? 'Кипр' : path);
  const label = monthLabel(monthKey, en);
  const labelPrep = monthLabel(monthKey, en, 'prep');
  const labelCap = monthLabel(monthKey, en, 'cap');
  const hubHref = `${en ? '/en' : ''}/${path}/`;
  const weekHref = `${en ? '/en' : ''}/${path}/this-week/`;
  const venues: string[] = [];
  for (const ev of list) {
    const short = String(placeLabel(ev.address, ev.city, en ? 'en' : 'ru') || '').split(',')[0].trim();
    if (short && !venues.includes(short)) venues.push(short);
    if (venues.length >= 4) break;
  }
  const free = list.filter((ev) => ev.price != null && Number(ev.price) === 0).length;
  const intro = en
    ? `${list.length} events are scheduled in ${loc} in ${label}: concerts, meetups, workshops and parties.` +
      (venues.length ? ` Venues include ${venues.join(', ')}.` : '') +
      (free > 0 ? ` ${free} of them are free.` : ' Prices and booking details are on each card.')
    : `В ${locRu || loc} в ${labelPrep} запланировано ${list.length} событий: концерты, встречи, мастер-классы и вечеринки.` +
      (venues.length ? ` Площадки: ${venues.join(', ')}.` : '') +
      (free > 0 ? ` Бесплатных: ${free}.` : ' Цены и билеты — в карточках событий.');
  const faq: [string, string][] = en
    ? [
        [
          `How many events are there in ${loc} in ${label}?`,
          `${list.length} events are announced. The full list with dates and venues is on this page.`,
        ],
        [
          'Are there free events this month?',
          free > 0
            ? `Yes, ${free} of ${list.length} events are free to attend.`
            : 'All events this month are ticketed; prices are shown on each card.',
        ],
        [
          'What changes closer to the date?',
          'The list is rebuilt every day from the live event feed — new events appear on this page and on the city map.',
        ],
      ]
    : [
        [
          `Сколько событий ${locRu || loc} в ${labelPrep}?`,
          `${list.length} событий. Полный список с датами и площадками — на этой странице.`,
        ],
        [
          'Есть ли бесплатные события в этом месяце?',
          free > 0
            ? `Да, ${free} из ${list.length} событий — бесплатные.`
            : 'Все события месяца по билетам; цена указана в карточке.',
        ],
        [
          'Что меняется ближе к дате?',
          'Список пересобирается каждый день из живой афиши: новые события сразу появляются здесь и на карте города.',
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
              {loc}
            </a>
            {' › '}
            <span>{labelCap}</span>
          </p>
        </nav>
        <h1 className="mt-4 text-2xl font-semibold text-gray-900">
          {en ? `Events in ${loc} in ${label}` : `События ${locRu || loc} в ${labelPrep}`}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-gray-700">{intro}</p>
        <h2 className="mt-5 text-base font-semibold text-gray-900">
          {en ? `Events in ${label}` : `События в ${label}`}
        </h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-gray-700">
          {list.map((ev) => {
            const date = String(nextOccurrenceDate(ev, todayIso()));
            const href = eventPageHref(ev, en ? 'en' : 'ru') || '#';
            const name = en
              ? ev.title_en || ev.title || ev.title_ru || ''
              : ev.title_ru || ev.title || ev.title_en || '';
            const place = placeLabel(ev.address, ev.city, en ? 'en' : 'ru');
            const price = priceText(ev, en);
            return (
              <li key={ev.id}>
                <time dateTime={date}>{en ? enDate(date) : ruDate(date)}</time>
                {' — '}
                <a href={href} className="underline">
                  {name}
                </a>
                {place ? ` — ${place}` : ''}
                {price ? ` — ${price}` : ''}
              </li>
            );
          })}
        </ul>
        <p className="mt-5 text-sm">
          <a href={hubHref} className="underline">
            {en ? `All events in ${loc}` : `Все события ${locRu || loc}`}
          </a>
          {' · '}
          <a href={weekHref} className="underline">
            {en ? 'Events this week' : 'События на этой неделе'}
          </a>
        </p>
        <section className="mt-6 space-y-2 text-sm text-gray-700">
          {faq.map(([q, a]) => (
            <details key={q} className="rounded border border-gray-200 p-3">
              <summary className="cursor-pointer font-medium">{q}</summary>
              <p className="mt-2">{a}</p>
            </details>
          ))}
        </section>
      </main>
    </div>
  );
}
