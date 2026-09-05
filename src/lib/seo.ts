// Живые мета-теги в SPA (SEO, промпт B): при клиентских переходах head
// отражает открытую страницу — title, meta description, link canonical и
// Open Graph. Шаблоны строк СИНХРОННЫ со статическим пре-рендером
// scripts/seo-prerender.mjs (титулы/описания городов — CITY_PAGES там же,
// логика описания события — функции snippet/ruDate/cutSafe ниже, копия из
// скрипта). При правке шаблонов менять оба места.
//
// Маршруты:
//   '/'                     — базовые (как в index.html), canonical https://mypins.site/
//   /bali, /da-nang, ...    — CITY_PAGES, canonical https://mypins.site/<city>/ (со слэшем)
//   /event/<id>/<slug>      — «<title> · <city>», описание «Город, дата. текст»,
//                             canonical https://mypins.site/event/<id>/<slug>/ + og:*
//   вне списка (404, /org/<id>, hash-разделы) — базовые title/description,
//                             canonical и og:url УДАЛЯЮТСЯ (как в статике, где
//                             их в index.html нет)
import { config } from '../config';
import { photoUrl } from './api';
import { slugify } from './navigate';
import type { EventItem } from './types';

/** Адрес сайта без хвостового слэша (config.siteUrl = 'https://mypins.site/') */
const SITE_URL = config.siteUrl.replace(/\/+$/, '');

// Базовые title/description — как в index.html (статическая версия главной
// и 404). Держать синхронно с index.html.
const BASE_TITLE = document.title;
const BASE_DESCRIPTION =
  document.querySelector<HTMLMetaElement>('meta[name="description"]')?.content ?? '';

// Города — ровно те, что в CITY_PAGES (scripts/seo-prerender.mjs:76-95);
// путь = slugify(labelEn) из config.quickLocations.
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

const RU_MONTHS = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

/** «2026-09-05» → «5 сентября 2026» (русские месяцы вручную, без TZ-сюрпризов Intl) */
function ruDate(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  if (!m) return iso ?? '';
  const month = RU_MONTHS[Number(m[2]) - 1];
  return month ? `${Number(m[3])} ${month} ${m[1]}` : (iso ?? '');
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
  /** null — canonical удаляется (маршрут вне списка/404) */
  canonical: string | null;
  /** null — og-теги удаляются; на обычных страницах их нет (как в index.html) */
  og: Record<string, string> | null;
}

const OG_PROPS = ['og:title', 'og:description', 'og:url', 'og:image'] as const;

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
  setMetaDescription(meta.description);
  setCanonical(meta.canonical);
  setOgTags(meta.og);
}

/** Главная карта '/': базовые title/description, canonical https://mypins.site/ */
export function applyHomeMeta(): void {
  apply({ title: BASE_TITLE, description: BASE_DESCRIPTION, canonical: `${SITE_URL}/`, og: null });
}

/**
 * Маршруты вне списка (404-заглушка, /org/<id>, hash-разделы #/profile и пр.):
 * базовые title/description, canonical и og-теги удаляются — нельзя оставлять
 * canonical/og предыдущей страницы на 404 или чужом маршруте.
 */
export function applyGenericMeta(): void {
  apply({ title: BASE_TITLE, description: BASE_DESCRIPTION, canonical: null, og: null });
}

/** Город (/bali и т.п.): title/description как в CITY_PAGES, canonical со слэшем */
export function applyCityMeta(path: string): void {
  const city = CITY_META[path];
  if (!city) {
    applyGenericMeta();
    return;
  }
  apply({
    title: city.title,
    description: city.description,
    canonical: `${SITE_URL}/${path}/`,
    og: null,
  });
}

/** Событие (карточка открыта / /event/<id>/<slug>): title/description как в
 * пре-рендере (seo-prerender.mjs), canonical и og со слэшем; og:image — первое
 * фото (абсолютный URL) или логотип сайта. Данные только из объекта события —
 * никаких новых запросов. */
export function applyEventMeta(ev: EventItem): void {
  const title = snippet(`${ev.title} · ${ev.city ?? ''}`.trim(), 65) || 'Событие';
  const city = typeof ev.city === 'string' ? ev.city.trim() : '';
  // Текст русскоязычного посетителя (index.html lang="ru"), как localizedText:
  // перевод или оригинал
  const ruText = ev.description_ru || ev.description || ev.description_en || '';
  const date = ruDate(ev.start_date);
  const prefix = [city, date].filter(Boolean).join(', ');
  const description = snippet(prefix ? `${prefix}. ${ruText}` : ruText, 160);
  const canonical = `${SITE_URL}/event/${encodeURIComponent(ev.id)}/${slugify(ev.title)}/`;
  const photo = ev.photos?.[0];
  const image = photo
    ? photo.startsWith('http')
      ? photo
      : photoUrl(photo)
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
  });
}
