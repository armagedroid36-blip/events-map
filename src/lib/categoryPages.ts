// Посадочные страницы «город × категория» (/<city>/<category>/, Фаза 4):
// гейт качества, тексты и мета — ЕДИНЫЙ источник для SPA (Home, EventCard,
// lib/seo). Живое зеркало — scripts/seo-prerender.mjs (обычный JS, импорт TS
// невозможен): MIN_CATEGORY_EVENTS, categoryCells/categoryPageExists/
// categoryPageHref/cellFacts/categoryH1/categoryTitle/categoryDescription/
// categoryIntro/categoryFaq — при правках менять ОБА места, тексты и формулы
// держать посимвольно одинаковыми (проверка — scripts/check-category-pages.py
// скилла: проверяет все критерии приёмки по dist, в т.ч. паритет текстов).
//
// Гейт: страница пары (город, категория) существует, только если в этом городе
// >= MIN_CATEGORY_EVENTS АКТИВНЫХ событий этой категории (набор активных =
// list_active_events, он же грузится в SPA) — иначе 404 и вне sitemap.
//
// Уникальность (гайдлайны programmatic, >=40% уникального текста на страницу):
// вступление и FAQ строятся на ФАКТАХ ЯЧЕЙКИ — названия ближайших событий, их
// даты, число событий, площадки из адресов, цены. Плюс каждая шаблонная фраза
// (городская справка, даты, цены, подводка списка, концовки FAQ) имеет 3
// варианта, выбираемых детерминированно по ключу ячейки (cellVariant) — общий
// текст у страниц одного города сведён к минимуму (difflib < 60%, проверено на
// реальном наборе; порядок вариантов должен совпадать со статикой).
import type { Category, EventItem } from './types';
import { cityPath } from './address';
import type { CityPath } from './address';

/** Порог качества: страница ячейки существует с 3+ активными событиями */
export const MIN_CATEGORY_EVENTS = 3;

/** RU/EN названия городов по пути (как в JSON-LD и городских страницах) */
const CITY_NAME_RU: Record<CityPath, string> = {
  bali: 'Бали',
  'da-nang': 'Дананг',
  'nha-trang': 'Нячанг',
};

const CITY_NAME_EN: Record<CityPath, string> = {
  bali: 'Bali',
  'da-nang': 'Da Nang',
  'nha-trang': 'Nha Trang',
};

/** Предлог + город в предложном падеже (RU): «на Бали», «в Дананге» */
const CITY_WHERE_RU: Record<CityPath, string> = {
  bali: 'на Бали',
  'da-nang': 'в Дананге',
  'nha-trang': 'в Нячанге',
};

/** Локализованное имя города по пути */
export function categoryCityName(path: CityPath, lang: 'ru' | 'en'): string {
  return lang === 'en' ? CITY_NAME_EN[path] : CITY_NAME_RU[path];
}

/** «на Бали» / «в Дананге» (RU), «in Bali» (EN) */
export function categoryWhere(path: CityPath, lang: 'ru' | 'en'): string {
  return lang === 'en' ? `in ${CITY_NAME_EN[path]}` : CITY_WHERE_RU[path];
}

/** Ключ ячейки «город × категория» */
export function cellKey(path: CityPath, categoryId: string): string {
  return `${path}|${categoryId}`;
}

/** Стабильный «отпечаток» ячейки (0..999) — выбор вариантов шаблонных фраз.
 * Тот же алгоритм в scripts/seo-prerender.mjs: у статики и SPA тексты обязаны
 * совпадать. */
export function cellSeed(path: CityPath, categoryId: string): number {
  const key = cellKey(path, categoryId);
  let sum = 0;
  for (let i = 0; i < key.length; i += 1) sum = (sum * 31 + key.charCodeAt(i)) % 997;
  return sum;
}

/** Вариант фразы номер k для ячейки (3 варианта в каждом наборе) */
export function cellVariant(seed: number, k: number): number {
  return (seed + k * 7) % 3;
}

/** Счётчики ячеек по активному набору: ключ cellKey → число событий */
export function categoryCells(events: EventItem[]): Map<string, number> {
  const cells = new Map<string, number>();
  for (const ev of events) {
    const cp = cityPath(ev.city);
    if (!cp || !ev.category_id) continue;
    const k = cellKey(cp, ev.category_id);
    cells.set(k, (cells.get(k) ?? 0) + 1);
  }
  return cells;
}

/** События ячейки (город + категория) — та же фильтрация, что у счётчика */
export function categoryCellEvents(
  events: EventItem[],
  path: CityPath,
  categoryId: string,
): EventItem[] {
  return events.filter((ev) => cityPath(ev.city) === path && ev.category_id === categoryId);
}

/** Страница ячейки существует (прошла гейт MIN_CATEGORY_EVENTS) */
export function categoryPageExists(
  cells: Map<string, number>,
  path: CityPath,
  categoryId: string,
): boolean {
  return (cells.get(cellKey(path, categoryId)) ?? 0) >= MIN_CATEGORY_EVENTS;
}

/** Относительный href страницы ячейки своего языка: /bali/party/ или /en/bali/party/ */
export function categoryPageHref(
  path: CityPath,
  categoryId: string,
  lang: 'ru' | 'en',
): string {
  return `${lang === 'en' ? '/en' : ''}/${path}/${categoryId}/`;
}

const RU_MONTHS = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

const EN_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** «2026-09-11» → «11 сентября 2026» (без TZ-сюрпризов Intl) */
function ruDay(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  if (!m) return iso ?? '';
  const month = RU_MONTHS[Number(m[2]) - 1];
  return month ? `${Number(m[3])} ${month} ${m[1]}` : iso;
}

/** «2026-09-11» → «September 11, 2026» */
function enDay(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  if (!m) return iso ?? '';
  const month = EN_MONTHS[Number(m[2]) - 1];
  return month ? `${month} ${Number(m[3])}, ${m[1]}` : iso;
}

function day(iso: string, lang: 'ru' | 'en'): string {
  return lang === 'en' ? enDay(iso) : ruDay(iso);
}

/** Короткая дата (день и месяц, без года) для списка ближайших */
function shortDay(iso: string, lang: 'ru' | 'en'): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  if (!m) return iso ?? '';
  return lang === 'en'
    ? `${EN_MONTHS[Number(m[2]) - 1]} ${Number(m[3])}`
    : `${Number(m[3])} ${RU_MONTHS[Number(m[2]) - 1]}`;
}

/** Русское склонение: 3 события, 5 событий */
function pluralRu(n: number, forms: [string, string, string]): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b > 1 && b < 5) return forms[1];
  if (b === 1) return forms[0];
  return forms[2];
}

/** «5 событий» / «5 events» */
function eventsWord(n: number, lang: 'ru' | 'en'): string {
  return lang === 'en'
    ? `${n} ${n === 1 ? 'event' : 'events'}`
    : `${n} ${pluralRu(n, ['событие', 'события', 'событий'])}`;
}

/** Название для текста: обрезка по границе слова (без разрыва суррогатной пары) */
function shortName(title: string, max = 46): string {
  const clean = String(title ?? '').replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const i = cut.lastIndexOf(' ');
  const head = i > max * 0.6 ? cut.slice(0, i) : cut;
  return `${head.replace(/[\s,.;:—–-]+$/, '')}…`;
}

/** Городская справка: 3 КОРОТКИХ варианта на город (выбор — cellVariant, k=0).
 * Основную уникальность дают факты ячейки, поэтому общий текст держим минимальным */
const CITY_BLURB: Record<CityPath, { ru: string[]; en: string[] }> = {
  bali: {
    ru: [
      'Бали — событийный остров Юго-Восточной Азии.',
      'На Бали афиша не затихает круглый год.',
      'Бали живёт событиями: Чангу, Убуд, Семиньяк и Кута.',
    ],
    en: [
      'Bali is the busiest events island in Southeast Asia.',
      'In Bali the listings never stop all year round.',
      'Bali runs on events: Canggu, Ubud, Seminyak and Kuta.',
    ],
  },
  'da-nang': {
    ru: [
      'Дананг — компактный город у моря.',
      'Дананг небольшой, и всё событийное рядом.',
      'В Дананге события собраны в центре, Ми Ане и на набережной.',
    ],
    en: [
      'Da Nang is a compact city by the sea.',
      'Da Nang is small, and everything happens nearby.',
      'Da Nang events cluster in the centre, My An and the riverside.',
    ],
  },
  'nha-trang': {
    ru: [
      'Нячанг — курортная столица юга Вьетнама.',
      'В Нячанге события идут вдоль набережной.',
      'Нячанг живёт у моря: набережная и север города.',
    ],
    en: [
      'Nha Trang is the resort capital of southern Vietnam.',
      'In Nha Trang events run along the promenade.',
      'Nha Trang lives by the sea: the promenade and the north.',
    ],
  },
};

/** Категорийный блок (по id категории; неизвестная — DEFAULT_BLURB) */
const CATEGORY_BLURB: Record<string, { ru: string; en: string }> = {
  party: {
    ru: 'Вечеринки — главный ночной жанр: клубные ночи, пляжные сеты и вечеринки с диджеями.',
    en: 'Parties are the main night genre: club nights, beach sets and DJ evenings.',
  },
  concert: {
    ru: 'Концерты — живые выступления: акустика в кафе, большие сцены и джем-сейшены.',
    en: 'Concerts bring live music: acoustic sets in cafes, big stages and jam sessions.',
  },
  wellness: {
    ru: 'Йога и здоровье — утренние практики, дыхательные сессии, звуковые ванны и ретриты.',
    en: 'Yoga and wellness: morning practices, breathwork, sound baths and retreats.',
  },
  workshop: {
    ru: 'Мастер-классы — практические занятия: гончарное дело, кулинария, танцы и ремёсла.',
    en: 'Workshops are hands-on classes: pottery, cooking, dance and crafts with local makers.',
  },
  festival: {
    ru: 'Фестивали — многодневные события с музыкой, едой, маркетами и локальной культурой.',
    en: 'Festivals are multi-day events with music, food, markets and local culture.',
  },
  games: {
    ru: 'Игры и квизы — командные квизы, настолки, вечера мафии и турниры.',
    en: 'Games and quizzes: team quizzes, board games, mafia nights and tournaments.',
  },
  theatre: {
    ru: 'Театры и шоу — сценические постановки, национальные танцы, огненные шоу.',
    en: 'Theatres and shows: stage productions, traditional dance and fire shows.',
  },
  show: {
    ru: 'Шоу и представления — сценические программы: танцы, музыка, огонь и костюмы.',
    en: 'Shows and performances: stage programmes with dance, music, fire and costumes.',
  },
  meetup: {
    ru: 'Встречи и нетворкинг — неформальные сходы экспатов, языковые обмены и сообщества.',
    en: 'Meetups and networking: informal get-togethers of expats, language exchanges and communities.',
  },
  exhibition: {
    ru: 'Выставки — живопись, фотография, инсталляции и арт-пространства художников.',
    en: 'Exhibitions: painting, photography, installations and art spaces of local artists.',
  },
  sport: {
    ru: 'Спорт — забеги, тренировки, единоборства, футбол и активные выходные.',
    en: 'Sports: runs, training sessions, martial arts, football and active weekends.',
  },
  tour: {
    ru: 'Экскурсии и туры — поездки к водопадам, в джунгли, на острова и в парки с гидом.',
    en: 'Tours and excursions: guided trips to waterfalls, jungles, islands and nature parks.',
  },
  speaking: {
    ru: 'Разговорный клуб — практика английского и других языков в кафе и коворкингах.',
    en: 'Speaking clubs: English and other language practice in cafes and coworkings.',
  },
  cinema: {
    ru: 'Киноклуб — показы классики и новых фильмов, документальное кино и обсуждения.',
    en: 'Cinema clubs: classics and new releases, documentaries and after-screening talks.',
  },
  food: {
    ru: 'Еда и напитки — гастро-ужины, дегустации, кулинарные вечера и маркеты.',
    en: 'Food and drink: tasting dinners, cooking nights and markets with local produce.',
  },
  lecture: {
    ru: 'Лекции — разговоры об истории, науке, технологиях и путешествиях со спикерами.',
    en: 'Lectures: talks on history, science, technology and travel with invited speakers.',
  },
  conference: {
    ru: 'Конференции — деловые встречи, воркшопы и нетворкинг для специалистов.',
    en: 'Conferences: business meetups, workshops and networking for professionals.',
  },
};

/** Блок категории по умолчанию (id без своего текста) */
const DEFAULT_BLURB = {
  ru: 'Афиша этой категории обновляется организаторами каждый день: даты, места и цены — в карточках.',
  en: 'This category is refreshed by organizers every day: dates, venues and prices are in the event cards.',
};

/** Служебные слова, по которым сегмент адреса не считается названием места */
const PLACE_SKIP = [
  'индонезия', 'indonesia', 'вьетнам', 'vietnam', 'бали', 'bali', 'дананг', 'da nang',
  'нячанг', 'nha trang', 'малайзия', 'malaysia', 'таиланд', 'thailand',
  'камбоджа', 'сингапур', 'филиппины', 'центр', 'район', 'city', 'город', 'улица',
];

/** Первое слово сегмента — признак улицы/адреса, а не названия места */
const STREET_WORDS = /^(jl|jalan|gang|gg|duong|đường|street|str|st|улица|ул|проспект|пер)[.\s]/i;

const CYRILLIC_OR_LATIN = /[A-Za-z\u0400-\u04FF]/;

/** Название площадки одного события (та же фильтрация, что у topVenues):
 * первый сегмент адреса, похожий на имя места — заглавная и строчная буквы,
 * 4–28 знаков, без цифр/координат/«:»/скобок и служебных слов. Пусто →
 * площадка не определяется. */
function venueOf(ev: EventItem): string {
  const raw = String(ev.address ?? '').split(',')[0]?.trim() ?? '';
  if (!raw) return '';
  if (raw.length < 4 || raw.length > 28) return '';
  if (/\d/.test(raw) || /[:()"°]/.test(raw) || raw.endsWith('.')) return '';
  if (!CYRILLIC_OR_LATIN.test(raw)) return '';
  if (!/[A-ZА-ЯЁ]/.test(raw) || !/[a-zа-яё]/.test(raw)) return '';
  if (STREET_WORDS.test(raw)) return '';
  const low = raw.toLowerCase();
  if (PLACE_SKIP.some((w) => low === w || low.startsWith(`${w} `))) return '';
  return raw;
}

/** Названия площадок из адресов ячейки (до 3, порядок стабильный).
 * Пусто → площадки не упоминаем. */
function topVenues(items: CellItem[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const { ev } of items) {
    const raw = venueOf(ev);
    if (!raw) continue;
    const low = raw.toLowerCase();
    if (seen.has(low)) continue;
    seen.add(low);
    out.push(raw);
    if (out.length >= 3) break;
  }
  return out;
}

/** Число с разделителем тысяч: 100000 → «100 000» (одинаково в SPA и статике) */
export function fmtNum(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/** Событие ячейки с датой ближайшего вхождения (ISO) */
export interface CellItem {
  ev: EventItem;
  date: string;
}

/** События ячейки, отсортированные по ближайшему вхождению.
 * dateOf — nextOccurrenceDate: SPA считает от сегодняшней даты, пре-рендер —
 * от даты сборки (TODAY_ISO). */
export function cellItems(
  events: EventItem[],
  path: CityPath,
  categoryId: string,
  dateOf: (ev: EventItem) => string,
): CellItem[] {
  return categoryCellEvents(events, path, categoryId)
    .map((ev) => ({ ev, date: String(dateOf(ev) ?? '') }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export interface CellFacts {
  count: number;
  /** Ближайшее вхождение (ISO) */
  nearest: string;
  /** Последнее вхождение в наборе (ISO) */
  last: string;
  /** Сколько событий с бесплатным входом или донатом */
  freeCount: number;
  /** Минимальная и максимальная ненулевая цена (нет платных → null) */
  priceFrom: number | null;
  priceTo: number | null;
  currency: string;
  venues: string[];
  /** До восьми ближайших событий: название, дата, площадка (если определилась) */
  upcoming: { name: string; date: string; venue: string }[];
  /** Название самого дальнего события в наборе (для FAQ) */
  lastName: string;
  /** Фрагмент описания ближайшего события (уникальный текст страницы) */
  nearestText: string;
}

/** Фрагмент описания для текста блока: без HTML и переносов, обрезка по слову */
function shortText(text: string | null | undefined, max = 150): string {
  const clean = String(text ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) return '';
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const i = cut.lastIndexOf(' ');
  let head = i > max * 0.6 ? cut.slice(0, i) : cut;
  const code = head.charCodeAt(head.length - 1);
  if (code >= 0xd800 && code <= 0xdbff) head = head.slice(0, -1);
  return `${head.replace(/[\s,.;:—–-]+$/, '')}…`;
}

/** Факты ячейки — основа уникального текста (числа, даты, названия, цены) */
export function cellFacts(items: CellItem[], lang: 'ru' | 'en'): CellFacts {
  const evs = items.map((i) => i.ev);
  const dates = items.map((i) => i.date).filter(Boolean).sort();
  const prices = evs
    .map((e) => (e.price != null ? Number(e.price) : 0))
    .filter((p) => p > 0);
  const currencies = evs
    .map((e) => (typeof e.currency === 'string' && e.currency ? e.currency : 'usd').toUpperCase())
    .filter((c) => c);
  const nameOf = (ev: EventItem): string =>
    lang === 'en'
      ? ev.title_en || ev.title || ''
      : ev.title_ru || ev.title || ev.title_en || '';
  const textOf = (ev: EventItem): string =>
    lang === 'en'
      ? ev.description_en || ev.description || ev.description_ru || ''
      : ev.description_ru || ev.description || ev.description_en || '';
  const upcoming = items.slice(0, 8).map((i) => ({
    name: shortName(nameOf(i.ev)),
    date: i.date,
    venue: venueOf(i.ev),
  }));
  const lastItem = items[items.length - 1];
  const first = items[0];
  return {
    count: evs.length,
    nearest: dates[0] ?? '',
    last: dates[dates.length - 1] ?? '',
    freeCount: evs.filter((e) => !(e.price != null && Number(e.price) > 0)).length,
    priceFrom: prices.length ? Math.min(...prices) : null,
    priceTo: prices.length ? Math.max(...prices) : null,
    currency: currencies[0] ?? 'USD',
    venues: topVenues(items),
    upcoming,
    lastName: lastItem ? shortName(nameOf(lastItem.ev)) : '',
    nearestText: first ? shortText(textOf(first.ev)) : '',
  };
}

/** Фраза с датами афиши: 3 варианта (k=1) */
function datesPhrase(f: CellFacts, lang: 'ru' | 'en', v: number): string {
  const en = lang === 'en';
  const d1 = day(f.nearest, lang);
  const d2 = day(f.last, lang);
  const single = !f.nearest || !f.last || f.last === f.nearest;
  if (en) {
    if (single) {
      return [
        ` The next one is on ${d1}.`,
        ` The next event is on ${d1}.`,
        ` Every event here is on ${d1}.`,
      ][v];
    }
    return [
      ` The next one is on ${d1}, the last one in this list on ${d2}.`,
      ` The listing runs from ${d1} to ${d2}.`,
      ` The first event in the list is on ${d1} and the last one on ${d2}.`,
    ][v];
  }
  if (single) {
    return [
      ` Ближайшее — ${d1}.`,
      ` Ближайшее событие — ${d1}.`,
      ` Все события подборки — ${d1}.`,
    ][v];
  }
  return [
    ` Ближайшее — ${d1}, последнее в подборке — ${d2}.`,
    ` Первое событие списка — ${d1}, последнее — ${d2}.`,
    ` Афиша охватывает период с ${d1} по ${d2}.`,
  ][v];
}

/** Фраза о ценах: 3 варианта (k=2) */
function pricePhrase(f: CellFacts, lang: 'ru' | 'en', v: number): string {
  const en = lang === 'en';
  const from = f.priceFrom;
  const to = f.priceTo;
  const currency = f.currency;
  const free = ` ${f.freeCount} ${en ? 'of' : 'из'} ${f.count} ${en ? 'events are' : 'событий'} ${
    en ? 'free or donation-based.' : 'бесплатные или за донат.'
  }`;
  if (from == null || to == null) {
    return en
      ? [
          ' Entry is free or donation-based; the exact price is always shown in the event card.',
          ' You do not have to pay: entry is free or donation-based.',
          ' Admission is free or by donation — details are in the event card.',
        ][v]
      : [
          ' Вход бесплатный или за донат; точная цена всегда указана в карточке события.',
          ' Платить не обязательно: вход бесплатный или за донат.',
          ' Вход свободный или за донат — подробности в карточке события.',
        ][v];
  }
  if (f.freeCount === f.count) {
    return en
      ? [
          ' All of them are free or donation-based.',
          ' None of them is paid: free entry and donations only.',
          ' Every event here is free or donation-based.',
        ][v]
      : [
          ' Все события бесплатные или за донат.',
          ' Платных среди них нет: только свободный вход и донат.',
          ' Каждое событие — бесплатное или за донат.',
        ][v];
  }
  if (from === to) {
    const p = `${fmtNum(from)} ${currency}`;
    return en
      ? [
          ` Tickets are ${p},${free}`,
          ` The ticket price is ${p};${free}`,
          ` Admission costs ${p}.${free}`,
        ][v]
      : [
          ` Билеты — ${p},${free}`,
          ` Цена билета — ${p};${free}`,
          ` Вход стоит ${p}.${free}`,
        ][v];
  }
  const range = `${fmtNum(from)}–${fmtNum(to)} ${currency}`;
  const rangeText = en
    ? `${fmtNum(from)} to ${fmtNum(to)} ${currency}`
    : `от ${fmtNum(from)} до ${fmtNum(to)} ${currency}`;
  return en
    ? [
        ` Tickets cost from ${rangeText},${free}`,
        ` Prices for tickets range from ${rangeText};${free}`,
        ` Tickets are ${range}.${free}`,
      ][v]
    : [
        ` Билеты — от ${fmtNum(from)} до ${fmtNum(to)} ${currency},${free}`,
        ` Цены на билеты — ${rangeText};${free}`,
        ` Билеты стоят ${range}.${free}`,
      ][v];
}

/** Вступление ячейки (>=300 знаков, не mad-libs: город + категория + факты
 * ячейки — ближайшие события по названиям и датам, площадки, цены) */
export function categoryIntro(
  cat: Category,
  path: CityPath,
  lang: 'ru' | 'en',
  f: CellFacts,
): string {
  const en = lang === 'en';
  const seed = cellSeed(path, cat.id);
  const name = en ? cat.name_en : cat.name_ru;
  const blurb = (CATEGORY_BLURB[cat.id] ?? DEFAULT_BLURB)[en ? 'en' : 'ru'];
  const city = CITY_BLURB[path][en ? 'en' : 'ru'][cellVariant(seed, 0)];
  const where = categoryWhere(path, lang);
  const head = `${name} ${where}: ${eventsWord(f.count, lang)} ${en ? 'on the map.' : 'в афише.'}`;
  const venues = f.venues.length
    ? en
      ? [
          ` Most events take place at ${f.venues.join(', ')}.`,
          ` The usual venues: ${f.venues.join(', ')}.`,
          ` You will find them at ${f.venues.join(', ')}.`,
        ][cellVariant(seed, 3)]
      : [
          ` Чаще всего события проходят здесь: ${f.venues.join(', ')}.`,
          ` Обычные площадки: ${f.venues.join(', ')}.`,
          ` Ждём вас здесь: ${f.venues.join(', ')}.`,
        ][cellVariant(seed, 3)]
    : '';
  const dates = datesPhrase(f, lang, cellVariant(seed, 1));
  const lead = en
    ? [' Coming up:', ' Next events:', ' On the schedule:'][cellVariant(seed, 4)]
    : [
        ' События на ближайшие дни:',
        ' Ближайшие события:',
        ' Что происходит в ближайшие дни:',
      ][cellVariant(seed, 4)];
  const upcoming = f.upcoming.length
    ? ` ${lead} ${f.upcoming
        .map((u) =>
          en
            ? `“${u.name}” on ${shortDay(u.date, lang)}${u.venue ? ` (${u.venue})` : ''}`
            : `«${u.name}» — ${shortDay(u.date, lang)}${u.venue ? ` (${u.venue})` : ''}`,
        )
        .join(', ')}.`
    : '';
  const details = f.nearestText
    ? en
      ? ` Details: ${f.nearestText}`
      : ` Подробности: ${f.nearestText}`
    : '';
  const price = pricePhrase(f, lang, cellVariant(seed, 2));
  return `${head} ${blurb} ${city}${venues}${dates}${upcoming}${details}${price}`.replace(/\s{2,}/g, ' ');
}

/** Вопросы-ответы ячейки (3 шт.): ответы — с фактами ячейки (названия
 * ближайшего и дальнего события, число событий, цены), формулировки вопросов
 * и концовок — в трёх вариантах (cellVariant) */
export function categoryFaq(
  cat: Category,
  path: CityPath,
  lang: 'ru' | 'en',
  f: CellFacts,
): { q: string; a: string }[] {
  const en = lang === 'en';
  const seed = cellSeed(path, cat.id);
  const name = en ? cat.name_en : cat.name_ru;
  const where = categoryWhere(path, lang);
  const next = f.upcoming[0];
  const from = f.priceFrom;
  const to = f.priceTo;
  const currency = f.currency;
  const v0 = cellVariant(seed, 5);
  const v1 = cellVariant(seed, 6);
  const v2 = cellVariant(seed, 7);
  const q1 = en
    ? [
        `How many ${name} events are there ${where} right now?`,
        `How many ${name} events can I find ${where}?`,
        `What is on in the ${name} category ${where}?`,
      ][v0]
    : [
        `Сколько событий в категории «${name}» ${where} сейчас?`,
        `Сколько событий категории «${name}» ${where}?`,
        `Что сейчас идёт в категории «${name}» ${where}?`,
      ][v0];
  const a1 = en
    ? `There are ${eventsWord(f.count, 'en')}: from “${next ? next.name : ''}” on ${
        next ? shortDay(next.date, 'en') : ''
      } to “${f.lastName}” on ${shortDay(f.last, 'en')}.`
    : `Сейчас ${eventsWord(f.count, 'ru')}: от «${next ? next.name : ''}» ${
        next ? shortDay(next.date, 'ru') : ''
      } до «${f.lastName}» ${shortDay(f.last, 'ru')}.`;
  const q2 = next
    ? en
      ? [
          `When is the next ${name} event?`,
          `When does the next ${name} event take place?`,
          `What is the nearest ${name} event?`,
        ][v1]
      : [
          `Когда ближайшее событие в категории «${name}»?`,
          `Когда проходит ближайшее событие категории «${name}»?`,
          `Какое событие категории «${name}» ближайшее?`,
        ][v1]
    : null;
  const a2 = next
    ? en
      ? `“${next.name}” on ${shortDay(next.date, 'en')}${f.venues[0] ? `, ${f.venues[0]}` : ''}.`
      : `«${next.name}» — ${shortDay(next.date, 'ru')}${f.venues[0] ? `, ${f.venues[0]}` : ''}.`
    : null;
  const noPaid = from == null || to == null || f.freeCount === f.count;
  const q3 =
    noPaid
      ? en
        ? ['Are these events free?', 'Do I need to buy a ticket?', 'Is entry free?'][v2]
        : ['Есть ли бесплатные события?', 'Нужно ли покупать билет?', 'Вход бесплатный?'][v2]
      : en
        ? ['How much do tickets cost?', 'What are the ticket prices?', 'How much is entry?'][v2]
        : ['Сколько стоит вход?', 'Какие цены на билеты?', 'Сколько стоят билеты?'][v2];
  const a3 =
    noPaid
      ? en
        ? `Entry is free or donation-based; the exact price is always shown in the event card.`
        : `Вход бесплатный или за донат; точная цена всегда указана в карточке события.`
      : from === to
        ? en
          ? `${fmtNum(from)} ${currency}; ${f.freeCount} of ${f.count} events are free or donation-based.`
          : `${fmtNum(from)} ${currency}; ${f.freeCount} из ${f.count} событий бесплатные или за донат.`
        : en
          ? `From ${fmtNum(from)} to ${fmtNum(to)} ${currency}; ${f.freeCount} of ${f.count} events are free or donation-based.`
          : `От ${fmtNum(from)} до ${fmtNum(to)} ${currency}; ${f.freeCount} из ${f.count} событий бесплатные или за донат.`;
  const list: ({ q: string; a: string } | null)[] = [
    { q: q1, a: a1 },
    q2 && a2 ? { q: q2, a: a2 } : null,
    { q: q3, a: a3 },
  ];
  return list.filter(Boolean) as { q: string; a: string }[];
}

/** h1 ячейки: «Вечеринки на Бали: афиша событий» / «Parties in Bali: what's on» */
export function categoryH1(cat: Category, path: CityPath, lang: 'ru' | 'en'): string {
  return lang === 'en'
    ? `${cat.name_en} in ${CITY_NAME_EN[path]}: what's on`
    : `${cat.name_ru} ${CITY_WHERE_RU[path]}: афиша событий`;
}

/** Длина строки ПОСЛЕ HTML-экранирования (esc в пре-рендере: & → &amp;,
 * ' → &#39;, " → &quot;, < > → &lt;/&gt;). Лимиты title (<=60) и description
 * (140–160) обязаны соблюдаться и в СЫРОМ HTML: в SPA те же строки уходят в
 * head без экранирования, поэтому plain-длина тоже остаётся в диапазоне. */
export function escLen(s: string): number {
  let n = s.length;
  for (const ch of s) {
    if (ch === '&' || ch === "'") n += 4;
    else if (ch === '"') n += 5;
    else if (ch === '<' || ch === '>') n += 3;
  }
  return n;
}

/** title страницы (<=60 знаков; длинное имя категории — короткий шаблон) */
export function categoryTitle(cat: Category, path: CityPath, lang: 'ru' | 'en'): string {
  if (lang === 'en') {
    const full = `${cat.name_en} in ${CITY_NAME_EN[path]}: what's on | MyPins`;
    if (escLen(full) <= 60) return full;
    return `${cat.name_en} in ${CITY_NAME_EN[path]} | MyPins`;
  }
  const full = `${cat.name_ru} ${CITY_WHERE_RU[path]}: афиша и куда сходить | MyPins`;
  if (escLen(full) <= 60) return full;
  return `${cat.name_ru} ${CITY_WHERE_RU[path]}: афиша событий | MyPins`;
}

/** Концовки и добивки description: собираем 140–160 знаков (та же логика в
 * пре-рендере — менять синхронно). Порядок: от длинных к коротким. */
const DESC_TAILS_RU = [
  ' Афиша обновляется каждый день, а события публикуют сами организаторы.',
  ' Даты, места и цены — на живой карте MyPins.',
  ' Даты и цены — в карточках событий.',
];

const DESC_FILL_RU = [
  ' Смотрите даты, места и цены в карточках.',
  ' События публикуют сами организаторы.',
  ' Выбирайте дату и место на карте.',
  ' Даты и цены в карточках.',
  ' Все события на карте.',
  ' Живая афиша MyPins.',
];

const DESC_TAILS_EN = [
  ' The map is updated every day by the organizers themselves.',
  ' Dates, venues and prices are on the live MyPins map.',
  ' Dates and prices are in the event cards.',
];

const DESC_FILL_EN = [
  ' See dates, venues and prices in the event cards.',
  ' Organizers publish their events themselves.',
  ' Pick a date and a venue on the map.',
  ' Dates and prices in the cards.',
  ' All events on the map.',
  ' The live MyPins map.',
];

/** Добивает строку до 140–160 знаков: самая длинная концовка, влезающая в
 * лимит, затем короткие доборы до нижней границы. Обе границы считаются по
 * длине ПОСЛЕ HTML-экранирования (escLen): сырой meta content тоже обязан
 * укладываться в 140–160, а plain-длина (её ставит SPA) — тем более. */
function fitDescription(lead: string, tails: string[], fills: string[]): string {
  const delta = escLen(lead) - lead.length;
  const maxLen = 160 - delta;
  let out = lead;
  for (const t of tails) {
    if ((lead + t).length <= maxLen) {
      out = lead + t;
      break;
    }
  }
  for (const f of fills) {
    if (out.length >= 140) break;
    if ((out + f).length <= maxLen) out += f;
  }
  if (out.length > maxLen) out = out.slice(0, maxLen).replace(/\s+\S*$/, '');
  return out;
}

/** description страницы ячейки (140–160 знаков) */
export function categoryDescription(
  cat: Category,
  path: CityPath,
  lang: 'ru' | 'en',
  f: CellFacts,
): string {
  if (lang === 'en') {
    const lead = `${cat.name_en} in ${CITY_NAME_EN[path]}: ${eventsWord(f.count, 'en')} and what is on this month.`;
    return fitDescription(lead, DESC_TAILS_EN, DESC_FILL_EN);
  }
  const lead = `${cat.name_ru} ${CITY_WHERE_RU[path]}: ${eventsWord(f.count, 'ru')} и афиша с датами, местами и ценами.`;
  return fitDescription(lead, DESC_TAILS_RU, DESC_FILL_RU);
}

/** Заголовок блока перелинковки на городской странице */
export function categoriesBlockTitle(path: CityPath, lang: 'ru' | 'en'): string {
  return lang === 'en'
    ? `Categories in ${CITY_NAME_EN[path]}`
    : `Категории ${CITY_WHERE_RU[path]}`;
}
