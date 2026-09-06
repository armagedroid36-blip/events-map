// Живые мета-теги в SPA (SEO, промпт B): при клиентских переходах head
// отражает открытую страницу — title, meta description, link canonical и
// Open Graph. Шаблоны строк СИНХРОННЫ со статическим пре-рендером
// scripts/seo-prerender.mjs (титулы/описания городов — CITY_PAGES там же,
// логика описания события — функции snippet/ruDate/cutSafe ниже, копия из
// скрипта). При правке шаблонов менять оба места.
//
// ЯЗЫК ПУБЛИЧНОЙ СТРАНИЦЫ = язык из URL (промпт R): /en/* — 'en', корневые
// пути — 'ru'. Все apply* определяют его сами (isEnPath) и строят
// canonical/og:url с префиксом /en; на парных страницах (главная, города,
// blog/статьи, for-organizers, about) выставляется link rel=alternate
// hreflang (ru/en + x-default = https://mypins.site/en/), на непарных
// (событие без перевода, 404, /org/<id>, личные hash-разделы) hreflang-теги
// удаляются.
//
// Маршруты:
//   '/' / '/en'           — базовые (RU/EN), canonical https://mypins.site(/en)/
//   /bali, /da-nang, ...  — CITY_PAGES, canonical https://mypins.site/<city>/ (со слэшем)
//   /event/<id>/<slug>    — «<title> · <city>», описание «Город, дата. текст»,
//                           canonical https://mypins.site/event/<id>/<slug>/ + og:*;
//                           EN-версия (title_en) — canonical /en/event/...
//   вне списка (404, /org/<id>, hash-разделы) — базовые title/description,
//                           canonical и og:url УДАЛЯЮТСЯ (как в статике, где
//                           их в index.html нет)
import { config } from '../config';
import { photoUrl } from './api';
import { slugify } from './navigate';
import type {
  AboutContent,
  Article,
  EventItem,
  ForOrganizersContent,
  OrgProfile,
} from './types';

/** Адрес сайта без хвостового слэша (config.siteUrl = 'https://mypins.site/') */
const SITE_URL = config.siteUrl.replace(/\/+$/, '');

/** Публичный путь начинается с /en → EN-версия страницы (единственный
 * источник языка публичных путей — URL; браузер/localStorage не учитываем) */
export function isEnPath(p: string): boolean {
  return p === '/en' || p.startsWith('/en/');
}

/** Путь БЕЗ языкового префикса: '/en/bali' → '/bali', '/en' → '/' */
export function stripLangPrefix(p: string): string {
  if (!isEnPath(p)) return p;
  const s = p.replace(/^\/en/, '');
  return s === '' ? '/' : s;
}

// Базовые title/description главной — синхронно с index.html (RU) и с
// EN-версией пре-рендера dist/en/index.html (EN). НЕ читать из DOM при
// загрузке модуля: SPA может стартовать на /en (document.title уже EN),
// и RU-версия '/' получила бы чужие EN-значения. Константы обеих версий.
const BASE_TITLE =
  'События на карте — Events on the Map';
const BASE_DESCRIPTION =
  'Конференции, концерты, выставки и вечеринки на карте Бали и Юго-Восточной Азии. Conferences, concerts, exhibitions and parties on the map of Bali and Southeast Asia.';

// EN-версия главной /en/ — синхронно с пре-рендером (homeTitleEn в main()).
const BASE_TITLE_EN = 'Events on the Map: Bali, Da Nang, Nha Trang | MyPins';
const BASE_DESCRIPTION_EN =
  'MyPins is an events map for travellers and expats in Southeast Asia: concerts, parties, yoga, markets and speaking clubs in Bali, Da Nang and Nha Trang with dates, venues and prices.';

// Города — ровно те, что в CITY_PAGES (scripts/seo-prerender.mjs:76-95);
// путь = slugify(labelEn) из config.quickLocations. EN-версии — CITY_PAGES_EN.
const CITY_META: Record<string, { title: string; description: string }> = {
  bali: {
    title: 'События на Бали: афиша и куда сходить | Events in Bali',
    description:
      'Концерты, вечеринки, йога, маркеты и фестивали на Бали: афиша с датами, местами и ценами. Events in Bali on the map: concerts, parties, yoga and festivals.',
  },
  'da-nang': {
    title: 'События в Дананге: афиша и куда сходить | Da Nang Events',
    description:
      'Вечеринки, концерты и фестивали в Дананге: афиша для экспатов и туристов с датами, местами и ценами. Events in Da Nang on the map for expats and travellers.',
  },
  'nha-trang': {
    title: 'События в Нячанге: афиша и куда сходить | Nha Trang Events',
    description:
      'Вечеринки, концерты, шоу и встречи в Нячанге: афиша с датами, местами и ценами. Events in Nha Trang on the map: concerts, shows and parties.',
  },
};

// EN-версии title/description городов — синхронно с CITY_PAGES_EN пре-рендера.
const CITY_META_EN: Record<string, { title: string; description: string }> = {
  bali: {
    title: 'Events in Bali: concerts, parties and festivals | MyPins',
    description:
      'Bali events map for travellers and expats: concerts, parties, yoga, markets and festivals with dates, venues and prices.',
  },
  'da-nang': {
    title: 'Events in Da Nang: parties, concerts and meetups | MyPins',
    description:
      'Da Nang events map for expats and travellers: parties, concerts, yoga and meetups with dates, venues and prices.',
  },
  'nha-trang': {
    title: 'Events in Nha Trang: concerts, shows and parties | MyPins',
    description:
      'Nha Trang events map for travellers and expats: concerts, shows, parties and speaking clubs with dates, venues and prices.',
  },
};

const RU_MONTHS = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

const EN_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** «2026-09-05» → «5 сентября 2026» (русские месяцы вручную, без TZ-сюрпризов Intl) */
export function ruDate(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  if (!m) return iso ?? '';
  const month = RU_MONTHS[Number(m[2]) - 1];
  return month ? `${Number(m[3])} ${month} ${m[1]}` : (iso ?? '');
}

/** «2026-09-05» → «September 5, 2026» (EN, без TZ-сюрпризов Intl) */
export function enDate(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  if (!m) return iso ?? '';
  const month = EN_MONTHS[Number(m[2]) - 1];
  return month ? `${month} ${Number(m[3])}, ${m[1]}` : (iso ?? '');
}

/** Дата на языке интерфейса (страницы): для публичных страниц язык = из URL */
export function lDate(iso: string | null | undefined, lang: 'ru' | 'en'): string {
  return lang === 'en' ? enDate(iso) : ruDate(iso);
}

/** Обрезка без разрыва суррогатной пары (эмодзи) — иначе в строке U+FFFD */
function cutSafe(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const code = cut.charCodeAt(cut.length - 1);
  // Высокий суррогат без низкого — отрезать, чтобы не писать U+FFFD
  return code >= 0xd800 && code <= 0xdbff ? cut.slice(0, -1) : cut;
}

/** Вычистить HTML/переносы, обрезать по границе слова (title ~65, desc ~160) */
function snippet(text: string | null | undefined, max: number): string {
  const clean = String(text ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) return '';
  if (clean.length <= max) return clean;
  const cut = cutSafe(clean, max);
  const space = cut.lastIndexOf(' ');
  const head = (space > max * 0.6 ? cut.slice(0, space) : cut)
    .replace(/[\s,.;:—–-]+$/, '')
    .trim();
  return `${head}…`;
}

interface HeadMeta {
  title: string;
  description: string;
  /** 'en' для /en/* (язык публичной страницы = язык из URL) */
  lang?: 'ru' | 'en';
  /** null — canonical удаляется (маршрут вне списка/404) */
  canonical: string | null;
  /** null — og-теги удаляются; на обычных страницах их нет (как в index.html) */
  og: Record<string, string> | null;
  /**
   * hreflang-пары парной страницы (RU↔EN). null/undefined — hreflang-теги
   * удаляются (страница без пары: org, RU-событие без перевода, 404 и пр.).
   * На EN-версиях пары ВКЛЮЧАЮТ и саму EN-ссылку? Нет: Google рекомендует
   * каждой версии ссылаться на все версии, включая себя, поэтому обе версии
   * несут полный список (ru + en + x-default); пре-рендер ставит на RU-версии
   * en+x-default, а здесь SPA выставляет тот же набор для обеих.
   */
  hreflang: { hreflang: string; href: string }[] | null;
}

const OG_PROPS = ['og:title', 'og:description', 'og:url', 'og:image'] as const;

/** hreflang на парной странице: ru/en + x-default = /en/. Вызывается во всех
 * apply*: парные страницы передают пары, непарные — null (теги удаляются). */
function setHreflang(pairs: { hreflang: string; href: string }[] | null): void {
  document.head
    .querySelectorAll('link[rel="alternate"][hreflang]')
    .forEach((el) => el.remove());
  for (const p of pairs ?? []) {
    const link = document.createElement('link');
    link.rel = 'alternate';
    link.hreflang = p.hreflang;
    link.href = p.href;
    document.head.appendChild(link);
  }
}

/** Хвост URL события по языку: slug по имени на языке UI */
function eventTail(ev: EventItem, en: boolean): string {
  const name = en && (ev.title_en || ev.source_lang === 'en') ? ev.title_en || ev.title : ev.title;
  return slugify(name);
}

/** Полный URL события на языке страницы (en → /en/event/... при EN-версии) */
function eventUrl(ev: EventItem, en: boolean): string {
  const tail = eventTail(ev, en);
  return `${SITE_URL}${en ? '/en' : ''}/event/${encodeURIComponent(ev.id)}/${tail}/`;
}

function setMetaDescription(content: string): void {
  let el = document.head.querySelector<HTMLMetaElement>('meta[name="description"]');
  if (!el) {
    el = document.createElement('meta');
    el.name = 'description';
    document.head.appendChild(el);
  }
  el.content = content;
}

function setCanonical(href: string | null): void {
  const el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!href) {
    el?.remove();
    return;
  }
  if (el) {
    el.href = href;
    return;
  }
  const link = document.createElement('link');
  link.rel = 'canonical';
  link.href = href;
  document.head.appendChild(link);
}

function setOgTags(og: Record<string, string> | null): void {
  for (const prop of OG_PROPS) {
    const value = og?.[prop];
    const el = document.head.querySelector<HTMLMetaElement>(`meta[property="${prop}"]`);
    if (!value) {
      el?.remove();
      continue;
    }
    if (el) {
      el.content = value;
      continue;
    }
    const meta = document.createElement('meta');
    meta.setAttribute('property', prop);
    meta.content = value;
    document.head.appendChild(meta);
  }
}

function apply(meta: HeadMeta): void {
  document.title = meta.title;
  // Язык публичной страницы отражается и в <html lang> (SPA-переходы
  // между /en/* и корневыми путями не перезагружают документ)
  document.documentElement.lang = meta.lang ?? 'ru';
  setMetaDescription(meta.description);
  setCanonical(meta.canonical);
  setOgTags(meta.og);
  setHreflang(meta.hreflang ?? null);
}

/** hreflang-пары пары (главная/город/статья/…): полный набор для обеих версий */
function hreflangPairsFor(ruUrl: string, enUrl: string): { hreflang: string; href: string }[] {
  return [
    { hreflang: 'ru', href: ruUrl },
    { hreflang: 'en', href: enUrl },
    { hreflang: 'x-default', href: `${SITE_URL}/en/` },
  ];
}

/** Главная карта '/': базовые title/description, canonical https://mypins.site/.
 * EN-версия (/en): EN-title/description, canonical https://mypins.site/en/. */
export function applyHomeMeta(): void {
  const en = isEnPath(window.location.pathname);
  const url = `${SITE_URL}${en ? '/en' : ''}/`;
  apply({
    title: en ? BASE_TITLE_EN : BASE_TITLE,
    description: en ? BASE_DESCRIPTION_EN : BASE_DESCRIPTION,
    lang: en ? 'en' : 'ru',
    canonical: url,
    og: null,
    hreflang: hreflangPairsFor(`${SITE_URL}/`, `${SITE_URL}/en/`),
  });
}

/**
 * Маршруты вне списка (404-заглушка, /org/<id>, hash-разделы #/profile и пр.):
 * базовые title/description, canonical и og-теги удаляются — нельзя оставлять
 * canonical/og предыдущей страницы на 404 или чужом маршруте. hreflang тоже
 * удаляется (у этих страниц нет EN-версии).
 */
export function applyGenericMeta(): void {
  const en = isEnPath(window.location.pathname);
  apply({
    title: en ? BASE_TITLE_EN : BASE_TITLE,
    description: en ? BASE_DESCRIPTION_EN : BASE_DESCRIPTION,
    lang: en ? 'en' : 'ru',
    canonical: null,
    og: null,
    hreflang: null,
  });
}

/** Город (/bali и т.п.): title/description как в CITY_PAGES, canonical со слэшем.
 * EN-версия (/en/bali): CITY_META_EN, canonical https://mypins.site/en/<city>/. */
export function applyCityMeta(path: string): void {
  const en = isEnPath(window.location.pathname);
  const city = en ? CITY_META_EN[path] : CITY_META[path];
  if (!city) {
    applyGenericMeta();
    return;
  }
  apply({
    title: city.title,
    description: city.description,
    lang: en ? 'en' : 'ru',
    canonical: `${SITE_URL}${en ? '/en' : ''}/${path}/`,
    og: null,
    hreflang: hreflangPairsFor(`${SITE_URL}/${path}/`, `${SITE_URL}/en/${path}/`),
  });
}

/** Событие (карточка открыта / /event/<id>/<slug>): title/description как в
 * пре-рендере (seo-prerender.mjs), canonical и og со слэшем; og:image — первое
 * фото (абсолютный URL) или логотип сайта. Данные только из объекта события —
 * никаких новых запросов. EN-версия (/en/event/... с переводом события):
 * имя/текст = title_en/description_en, canonical на /en/...; событие без
 * EN-перевода, открытое по /en/event/... — мета RU-версии с canonical на RU
 * URL (как ТЗ 2.4: показать как есть, canonical на RU URL). */
export function applyEventMeta(ev: EventItem): void {
  const p = window.location.pathname;
  // EN-версия реально существует, только когда открыт /en/event/... У
  // события с переводом. Карточка поверх городской EN-карты URL не меняет —
  // canonical остаётся на RU-версии события (живой URL).
  const en = p.startsWith('/en/event/');
  const hasEn = Boolean(ev.title_en) || ev.source_lang === 'en';
  const useEn = en && hasEn;
  const title = snippet(
    `${useEn ? ev.title_en || ev.title : ev.title} · ${ev.city ?? ''}`.trim(),
    65,
  ) || 'Событие';
  const city = typeof ev.city === 'string' ? ev.city.trim() : '';
  // Текст, который видит посетитель этой версии (как localizedText)
  const text = useEn
    ? ev.description_en || ev.description
    : ev.description_ru || ev.description || ev.description_en || '';
  const date = useEn ? enDate(ev.start_date) : ruDate(ev.start_date);
  const prefix = [city, date].filter(Boolean).join(', ');
  const description = snippet(prefix ? `${prefix}. ${text}` : text, 160);
  const canonical = eventUrl(ev, useEn);
  const photo = ev.photos?.[0];
  const image = photo
    ? photo.startsWith('http')
      ? photo
      : photoUrl(photo)
    : `${SITE_URL}/logo.png`;
  apply({
    title,
    description,
    lang: useEn ? 'en' : 'ru',
    canonical,
    og: {
      'og:title': title,
      'og:description': description,
      'og:url': canonical,
      'og:image': image,
    },
    // hreflang-пара только если у события есть обе версии (после Фазы 2)
    hreflang: hasEn
      ? hreflangPairsFor(eventUrl(ev, false), eventUrl(ev, true))
      : null,
  });
}

/**
 * Организатор (/org/<id>): title/description/OG как в пре-рендере
 * (seo-prerender.mjs, блок /org/<id>), canonical со слэшем. og:image —
 * аватарка (абсолютный URL через photoUrl) или логотип сайта. Контакты
 * (телефон/email/telegram и пр.) в мету и og НЕ попадают никогда — даже при
 * contacts_public=true (их показывает только живая страница).
 */
export function applyOrgMeta(profile: OrgProfile): void {
  const name = (profile.display_name ?? '').trim();
  // Профиль-пустышка без названия: как 404 — базовые title/description без
  // canonical/og (статической страницы у такого org нет, индексировать нечего).
  if (!name) {
    applyGenericMeta();
    return;
  }
  const bio = (profile.bio ?? '').trim();
  const title = `${snippet(name, 40)}: события и афиша | MyPins`;
  const description = bio
    ? snippet(bio, 155)
    : `${name} — организатор событий. Актуальная афиша на карте MyPins: даты, места и цены.`;
  const canonical = `${SITE_URL}/org/${encodeURIComponent(profile.id)}/`;
  const avatar = (profile.avatar_url ?? '').trim();
  const image = avatar
    ? avatar.startsWith('http')
      ? avatar
      : photoUrl(avatar)
    : `${SITE_URL}/logo.png`;
  apply({
    title,
    description,
    canonical,
    og: {
      'og:title': title,
      'og:description': description,
      'og:url': canonical,
      'og:image': image,
    },
    // У /org/<id> нет EN-версии (в этот промпт /en/org/* не входит)
    lang: 'ru',
    hreflang: null,
  });
}

// --- Блог: /blog и /blog/<slug> ---
// Title/description — как в пре-рендере (scripts/seo-prerender.mjs, блок
// «Блог» ниже main()): держать синхронно при правке текстов.

const BLOG_META = {
  title: 'Блог MyPins: гиды по событиям и афиша | MyPins',
  description:
    'Гиды по событийной жизни Бали, Нячанга и Дананга: куда сходить, что посмотреть, сколько стоят события. Подборки от команды MyPins.',
};

// EN-версия /en/blog/ — синхронно с пре-рендером (main()).
const BLOG_META_EN = {
  title: 'MyPins Blog: event guides for Bali, Da Nang and Nha Trang | MyPins',
  description:
    'Guides to the event scenes of Nha Trang, Bali and Da Nang: where to go, what to see and how much events cost. Round-ups by the MyPins team.',
};

/** /blog: список статей. canonical со слэшем, og — логотип сайта.
 * EN-версия (/en/blog): EN-title/description, canonical /en/blog/. */
export function applyBlogMeta(): void {
  const en = isEnPath(window.location.pathname);
  const meta = en ? BLOG_META_EN : BLOG_META;
  const canonical = `${SITE_URL}${en ? '/en' : ''}/blog/`;
  apply({
    title: meta.title,
    description: meta.description,
    lang: en ? 'en' : 'ru',
    canonical,
    og: {
      'og:title': meta.title,
      'og:description': meta.description,
      'og:url': canonical,
      'og:image': `${SITE_URL}/logo.png`,
    },
    hreflang: hreflangPairsFor(`${SITE_URL}/blog/`, `${SITE_URL}/en/blog/`),
  });
}

/** /blog/<slug>: мета статьи из articles.json (как статический пре-рендер).
 * EN-версия (/en/blog/<slug>): *_en поля, canonical /en/blog/<slug>/. */
export function applyArticleMeta(article: Article): void {
  const en = isEnPath(window.location.pathname);
  const title = en ? article.title_en || article.title : article.title;
  const description = en ? article.description_en || article.description : article.description;
  const canonical = `${SITE_URL}${en ? '/en' : ''}/blog/${article.slug}/`;
  apply({
    title,
    description,
    lang: en ? 'en' : 'ru',
    canonical,
    og: {
      'og:title': title,
      'og:description': description,
      'og:url': canonical,
      'og:image': `${SITE_URL}/logo.png`,
    },
    hreflang: hreflangPairsFor(
      `${SITE_URL}/blog/${article.slug}/`,
      `${SITE_URL}/en/blog/${article.slug}/`,
    ),
  });
}

/**
 * Страница «Для организаторов» (/for-organizers): title/description из
 * forOrganizers.json (единый источник — как статьи из articles.json),
 * canonical и og со слэшем, og:image — логотип сайта. EN (/en/for-organizers):
 * *_en поля контента, canonical /en/for-organizers/.
 */
export function applyForOrganizersMeta(content: ForOrganizersContent): void {
  const en = isEnPath(window.location.pathname);
  const title = en ? content.title_en || content.title : content.title;
  const description = en
    ? content.description_en || content.description
    : content.description;
  const canonical = `${SITE_URL}${en ? '/en' : ''}/for-organizers/`;
  apply({
    title,
    description,
    lang: en ? 'en' : 'ru',
    canonical,
    og: {
      'og:title': title,
      'og:description': description,
      'og:url': canonical,
      'og:image': `${SITE_URL}/logo.png`,
    },
    hreflang: hreflangPairsFor(
      `${SITE_URL}/for-organizers/`,
      `${SITE_URL}/en/for-organizers/`,
    ),
  });
}

/**
 * Страница «О проекте» (/about): title/description из about.json (единый
 * источник — как статьи из articles.json), canonical и og со слэшем,
 * og:image — логотип сайта. EN (/en/about): *_en поля, canonical /en/about/.
 */
export function applyAboutMeta(content: AboutContent): void {
  const en = isEnPath(window.location.pathname);
  const title = en ? content.title_en || content.title : content.title;
  const description = en
    ? content.description_en || content.description
    : content.description;
  const canonical = `${SITE_URL}${en ? '/en' : ''}/about/`;
  apply({
    title,
    description,
    lang: en ? 'en' : 'ru',
    canonical,
    og: {
      'og:title': title,
      'og:description': description,
      'og:url': canonical,
      'og:image': `${SITE_URL}/logo.png`,
    },
    hreflang: hreflangPairsFor(`${SITE_URL}/about/`, `${SITE_URL}/en/about/`),
  });
}
