// Страница «город × на этой неделе» (§4.1.7 плана SEO).
//
// Статику пишет scripts/seo-prerender.mjs (блок #seo-week-block): крошка, h1,
// интро из фактов недели и список событий окна. Здесь — тот же экран для SPA,
// чтобы клиент после гидратации не расходился со статикой. Набор — уже
// загруженные активные события (api.listEvents), фильтр по городу и окну
// [сегодня; +6 дней] — то же правило, что у пре-рендера.
//
// Гейт (≥3 события в окне) решается на данных: пока набор не пришёл — ничего
// не показываем, после — либо панель, либо прежняя 404-заглушка. URL, которых
// нет в статике, сюда и не приходят: пре-рендер такие страницы не пишет.
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
import { applyWeekMeta, enDate, ruDate } from '../lib/seo';
import type { EventItem } from '../lib/types';

const WEEK_MIN_EVENTS = 3;
const WEEK_LIST_LIMIT = 50;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
function addDaysIso(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

const RU_MONTHS_GEN = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];
const EN_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function weekRange(start: string, end: string, en: boolean): string {
  const [ys, ms, ds] = start.split('-').map(Number);
  const [ye, me, de] = end.split('-').map(Number);
  if (ys === ye && ms === me) {
    return en ? `${EN_MONTHS[ms - 1]} ${ds}–${de}, ${ys}` : `${ds}–${de} ${RU_MONTHS_GEN[ms - 1]} ${ys}`;
  }
  return en
    ? `${EN_MONTHS[ms - 1]} ${ds} – ${EN_MONTHS[me - 1]} ${de}, ${ye}`
    : `${ds} ${RU_MONTHS_GEN[ms - 1]} – ${de} ${RU_MONTHS_GEN[me - 1]} ${ye}`;
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

export default function CityWeek({ path }: { path: CityPath }) {
  const { i18n } = useTranslation();
  const en = i18n.language.startsWith('en');
  const [events, setEvents] = useState<EventItem[] | null>(null);

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
    if (!events) return [];
    const start = todayIso();
    const end = addDaysIso(start, 6);
    return events
      .filter((ev) => {
        const inCity =
          path === 'cyprus' ? isCyprusCity(ev.city) : cityPath(ev.city) === path;
        if (!inCity) return false;
        const next = nextOccurrenceDate(ev, start);
        if (!next || next < start || next > end) return false;
        if (en && !(ev.title_en || ev.source_lang === 'en')) return false;
        return true;
      })
      .sort((a, b) => {
        const da = String(nextOccurrenceDate(a, start));
        const db = String(nextOccurrenceDate(b, start));
        return da.localeCompare(db) || String(a.id).localeCompare(String(b.id));
      })
      .slice(0, WEEK_LIST_LIMIT);
  }, [events, path, en]);

  const hasEn = useMemo(() => {
    if (!events) return false;
    const start = todayIso();
    const end = addDaysIso(start, 6);
    return (
      events.filter((ev) => {
        const inCity =
          path === 'cyprus' ? isCyprusCity(ev.city) : cityPath(ev.city) === path;
        if (!inCity) return false;
        const next = nextOccurrenceDate(ev, start);
        return Boolean(next) && next >= start && next <= end && Boolean(ev.title_en || ev.source_lang === 'en');
      }).length >= WEEK_MIN_EVENTS
    );
  }, [events, path]);

  const applyMeta = useCallback(() => {
    if (!events) return;
    applyWeekMeta(
      path,
      en ? 'en' : 'ru',
      list.length,
      todayIso(),
      addDaysIso(todayIso(), 6),
      hasEn,
    );
  }, [events, list.length, path, en, hasEn]);

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
  if (list.length < WEEK_MIN_EVENTS) return <NotFound />;

  const loc = en ? CITY_NAME_BY_PATH[path] : CITY_NAME_RU_LOCATIVE[path];
  const locRu = cityLocativeRu(path === 'cyprus' ? 'Кипр' : path);
  const range = weekRange(todayIso(), addDaysIso(todayIso(), 6), en);
  const hubHref = `${en ? '/en' : ''}/${path}/`;
  const venues: string[] = [];
  for (const ev of list) {
    const short = String(placeLabel(ev.address, ev.city, en ? 'en' : 'ru') || '').split(',')[0].trim();
    if (short && !venues.includes(short)) venues.push(short);
    if (venues.length >= 4) break;
  }
  const free = list.filter((ev) => ev.price != null && Number(ev.price) === 0).length;
  const intro = en
    ? `${list.length} events are on in ${loc} from ${range}: concerts, meetups, workshops and parties with dates, venues and prices.` +
      (venues.length ? ` Venues include ${venues.join(', ')}.` : '') +
      (free > 0 ? ` There are ${free} free events this week.` : ' Most events are ticketed.')
    : `${list.length} событий проходит ${locRu || loc} с ${range}: концерты, встречи, мастер-классы и вечеринки с датами, площадками и ценами.` +
      (venues.length ? ` Площадки недели: ${venues.join(', ')}.` : '') +
      (free > 0 ? ` Бесплатных событий на этой неделе: ${free}.` : ' Большинство событий по билетам.');

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
            <span>{en ? 'This week' : 'На этой неделе'}</span>
          </p>
        </nav>
        <h1 className="mt-4 text-2xl font-semibold text-gray-900">
          {en ? `Events in ${loc} this week` : `События ${locRu || loc} на этой неделе`}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-gray-700">{intro}</p>
        <h2 className="mt-5 text-base font-semibold text-gray-900">
          {en ? `Events ${range}` : `События ${range}`}
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
        </p>
      </main>
    </div>
  );
}
