// SEO-пререндер (beta 0.14): после `vite build` генерирует в dist/ физические
// index.html для /bali, /da-nang, /nha-trang, каждого активного
// /event/<id>/<slug>, публичных профилей /org/<id>, блога /blog и статей
// /blog/<slug>, B2B-страницы «Для организаторов» /for-organizers (в <head> — уникальные
// title/description, canonical и Open Graph со хвостовым слэшем, на событиях —
// JSON-LD Event, на организаторах — ProfilePage+Organization, на статьях —
// BlogPosting+BreadcrumbList, на /blog — Blog, на /for-organizers —
// AboutPage+BreadcrumbList+FAQPage), чтобы
// глубокие URL отдавали HTTP 200, и перезаписывает dist/sitemap.xml списком
// всех страниц. Источник данных — тот же RPC, что зовёт сайт:
// db.rpc('list_active_events') (src/lib/api.ts) — прошлые/скрытые/события
// заблокированных организаторов сюда не попадают автоматически.
// Статьи блога — src/content/articles.json, «Для организаторов» —
// src/content/forOrganizers.json (единые источники с SPA, не
// дублировать тексты здесь).
// Запуск: node scripts/seo-prerender.mjs (внутри "build" в package.json).
// Ключи: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — из process.env (GHA)
// или .env рядом с проектом (локальная сборка; подгружается сам, без
// новых зависимостей).
//
// Правила URL: canonical/og:url и loc в sitemap для городов, событий,
// организаторов и статей — СО слэшем (https://mypins.site/bali/,
// /event/<id>/<slug>/, /org/<id>/, /blog/<slug>/): физическая страница лежит
// как <path>/index.html, GitHub Pages
// отдаёт 200 только со слэшем (без слэша — 301). SPA-схему URL (pushState без
// слэша) НЕ трогаем — клиентский normPath (src/App.tsx) срезает хвостовой
// слэш сам.

import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const SITE_URL = 'https://mypins.site';
const LOGO_URL = `${SITE_URL}/logo.png`;
// «Сегодня» для startDate повторяющихся событий — фиксируется один раз на
// сборку (UTC; toISOString даёт YYYY-MM-DD, без часовых поясов)
const TODAY_ISO = new Date().toISOString().slice(0, 10);

// --- env: уже заданные (GHA) или .env проекта (локально) ---
function loadDotEnv() {
  if (process.env.VITE_SUPABASE_URL && process.env.VITE_SUPABASE_ANON_KEY) return;
  try {
    const text = readFileSync(join(ROOT, '.env'), 'utf8');
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim();
      if (!key.startsWith('VITE_')) continue;
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = value;
    }
  } catch {
    // .env нет — ключи должны быть в process.env, иначе упадём ниже
  }
}
loadDotEnv();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !ANON_KEY) {
  console.error('seo-prerender: нужны VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY (env или .env).');
  process.exit(1);
}

// --- Транслит и slugify: держать синхронно с src/lib/navigate.ts (НЕ править src/) ---
const RU_TRANSLIT = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z',
  и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
  с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh',
  щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

/** Копия src/lib/navigate.ts:15-22 — «Вечеринка у бассейна» → vecherinka-u-basseyna */
function slugify(title) {
  const s = title
    .toLowerCase()
    .replace(/[а-яё]/g, (ch) => RU_TRANSLIT[ch] ?? '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s || 'event';
}

// --- Города: те же три, что в config.quickLocations (src/config.ts:46-50),
// путь = slugify(labelEn): Bali→bali, Da Nang→da-nang, Nha Trang→nha-trang ---
const CITY_PAGES = [
  {
    path: 'bali',
    title: 'События на Бали: афиша и куда сходить | Events in Bali',
    description:
      'Концерты, вечеринки, йога, маркеты и фестивали на Бали: афиша с датами, местами и ценами. Events in Bali on the map: concerts, parties, yoga and festivals.',
  },
  {
    path: 'da-nang',
    title: 'События в Дананге: афиша и куда сходить | Da Nang Events',
    description:
      'Вечеринки, концерты и фестивали в Дананге: афиша для экспатов и туристов с датами, местами и ценами. Events in Da Nang on the map for expats and travellers.',
  },
  {
    path: 'nha-trang',
    title: 'События в Нячанге: афиша и куда сходить | Nha Trang Events',
    description:
      'Вечеринки, концерты, шоу и встречи в Нячанге: афиша с датами, местами и ценами. Events in Nha Trang on the map: concerts, shows and parties.',
  },
];

// --- Видимый SEO-текст городских страниц (h1 + интро + FAQ), RU. Эти же
// тексты живут в src/i18n/ru.ts (citySeo.<path>.*) — держать синхронно!
// Блок вставляется в <body> рядом с #root: его видит краулер без JS, а при
// живом React содержимое #root заменяется SPA (там свой локализованный блок).
const CITY_SEO = {
  bali: {
    h1: 'События на Бали',
    intro:
      'Бали — одно из самых событийных мест Юго-Восточной Азии: здесь постоянно пересекаются туристы, цифровые кочевники и экспаты. На карте MyPins собрана живая афиша Бали — вечеринки и концерты, йога и ретриты, маркеты, фестивали и встречи для экспатов. События публикуют сами организаторы, поэтому список всегда актуальный. Выбирайте дату, категорию и цену в фильтрах или приближайте карту к нужному району — Чангу, Убуду, Семиньяку, Куте — и смотрите, что проходит рядом.',
    faq: [
      {
        q: 'Какие события проходят на Бали?',
        a: 'На MyPins организаторы сами публикуют события: вечеринки, концерты, йога-классы, маркеты, фестивали и встречи для экспатов. У каждого события на карте указаны дата, место и цена.',
      },
      {
        q: 'Как найти события в Чангу, Убуде или другом районе?',
        a: 'Приблизьте карту к нужному району — список покажет события именно на видимой области. Также работают фильтры: категория, дата, цена и язык события.',
      },
      {
        q: 'Есть ли бесплатные события на Бали?',
        a: 'Да. В фильтре цены выберите «Бесплатные» или «Донат» (вход бесплатный, но можно поддержать организатора). В карточке события цена указана всегда: бесплатно, донат или сумма в нужной валюте.',
      },
    ],
  },
  'da-nang': {
    h1: 'События в Дананге',
    intro:
      'Дананг — быстрорастущий город Вьетнама, где живёт и отдыхает много экспатов и туристов. На карте MyPins — актуальные события Дананга: вечеринки и концерты, спорт и йога, маркеты и встречи для экспатов. Организаторы публикуют события сами, поэтому афиша всегда живая. Фильтры по дате, категории, цене и языку помогут найти занятие на вечер или на выходные.',
    faq: [
      {
        q: 'Какие события проходят в Дананге?',
        a: 'На MyPins события Дананга публикуют сами организаторы: концерты, вечеринки, йога, спорт, маркеты и встречи для экспатов. На карте видны дата, место и цена каждого события.',
      },
      {
        q: 'Что делать в Дананге сегодня или завтра?',
        a: 'В фильтре даты выберите «Сегодня» или «Завтра» — останутся события на эти дни. На выходные удобнее смотреть всю карту целиком: событий больше.',
      },
      {
        q: 'Сколько стоят события в Дананге?',
        a: 'В карточке события всегда указана цена: бесплатно, донат или сумма в нужной валюте. В фильтре цены можно оставить только бесплатные события.',
      },
    ],
  },
  'nha-trang': {
    h1: 'События в Нячанге',
    intro:
      'Нячанг — главный пляжный курорт Вьетнама и популярное место зимовки туристов и экспатов. На карте MyPins собраны события Нячанга: концерты и вечеринки, speaking-клубы и встречи, йога, шоу и маркеты. Афиша пополняется организаторами напрямую — вы всегда видите актуальные даты, места и цены. Фильтры по дате, категории и цене помогут выбрать, куда сходить.',
    faq: [
      {
        q: 'Какие события проходят в Нячанге?',
        a: 'Организаторы публикуют их сами: вечеринки, концерты, speaking-клубы, йога, шоу и маркеты. На карте у каждого события — дата, место и цена.',
      },
      {
        q: 'Есть ли в Нячанге встречи для экспатов и speaking-клубы?',
        a: 'Да — например, speaking-club SmallTalk, его события регулярно проходят в Нячанге и есть на карте. Чтобы не пропускать новые встречи, включите в профиле push-уведомления о новых событиях.',
      },
      {
        q: 'Сколько стоят события в Нячанге?',
        a: 'В карточке события указана цена: бесплатно, донат или сумма в нужной валюте. Фильтр цены покажет только бесплатные события, если нужно.',
      },
    ],
  },
};

// --- Блог: /blog и /blog/<slug>. Тексты статей — в src/content/articles.json
// (единый источник с SPA src/pages/Blog.tsx — здесь НЕ дублируются, только
// читаются). Title/description индекса синхронны с BLOG_META в
// src/lib/seo.ts — держать синхронно при правке.
const BLOG_META = {
  title: 'Блог MyPins: гиды по событиям и афиша | MyPins',
  description:
    'Гиды по событийной жизни Бали, Нячанга и Дананга: куда сходить, что посмотреть, сколько стоят события. Подборки от команды MyPins.',
};

/** Статьи блога из src/content/articles.json (readFileSync — единый источник) */
function loadArticles() {
  const raw = readFileSync(join(ROOT, 'src/content/articles.json'), 'utf8');
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error('articles.json: ожидался массив статей');
  return parsed;
}

/** Контент B2B-страницы «Для организаторов» из src/content/forOrganizers.json
 * (readFileSync — единый источник с SPA src/pages/ForOrganizers.tsx) */
function loadForOrganizers() {
  const raw = readFileSync(join(ROOT, 'src/content/forOrganizers.json'), 'utf8');
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('forOrganizers.json: ожидался объект');
  }
  return parsed;
}

/**
 * Markdown-ссылки «[фраза](/путь)» → <a href="/путь">фраза</a>. Части текста
 * экранируются отдельно (esc), href — тоже; внешних ссылок в статьях нет,
 * пути внутренние (в SPA их перехватывает App.tsx, в статике GitHub Pages
 * отдаёт физическую страницу).
 */
function mdLinksToHtml(text) {
  const parts = String(text).split(/\[([^\]]+)\]\(([^)]+)\)/);
  let out = esc(parts[0] ?? '');
  // split c захватывающими группами отдаёт [до, label, href, rest, label2, href2, rest2, …] —
  // каждая итерация потребляет ТРИ элемента, шаг 3 (баг i += 2 ломал 2-ю и последующие ссылки)
  for (let i = 1; i + 1 < parts.length; i += 3) {
    const label = parts[i] ?? '';
    const href = parts[i + 1] ?? '';
    const rest = parts[i + 2] ?? '';
    out += `<a href="${esc(href)}">${esc(label)}</a>${esc(rest)}`;
  }
  return out;
}

/** Секции статьи (p/h2/ul) в статический HTML — видно краулеру без JS */
function articleSectionsHtml(sections) {
  return (sections ?? [])
    .map((s) => {
      if (s.type === 'h2') return `  <h2>${esc(s.text)}</h2>`;
      if (s.type === 'ul') {
        const items = (s.items ?? [])
          .map((it) => `    <li>${mdLinksToHtml(it)}</li>`)
          .join('\n');
        return `  <ul>\n${items}\n  </ul>`;
      }
      return `  <p>${mdLinksToHtml(s.text ?? '')}</p>`;
    })
    .join('\n');
}

/**
 * Статический SEO-блок индекса блога (id=seo-article-block — как у статей:
 * main.tsx удаляет его при монтировании SPA): h1 «Блог MyPins…» + карточки
 * статей (заголовок-ссылка на /blog/<slug>/, дата, description). Ровно один
 * h1; ссылки на обе статьи видны в HTML без JS.
 */
function blogIndexSeoHtml(articles) {
  const cards = [...articles]
    .sort((a, b) => String(b.datePublished).localeCompare(String(a.datePublished)))
    .map((a) => {
      const url = `${SITE_URL}/blog/${a.slug}/`;
      return [
        '  <article>',
        `    <h2><a href="${esc(url)}">${esc(a.h1)}</a></h2>`,
        `    <p>${esc(ruDate(a.datePublished))}</p>`,
        `    <p>${esc(a.description)}</p>`,
        '  </article>',
      ].join('\n');
    })
    .join('\n');
  return ['<div id="seo-article-block">', '  <h1>Блог MyPins: гиды по событиям</h1>', cards, '</div>', ''].join('\n');
}

/** Статический SEO-блок статьи: h1 + дата публикации + секции (без JS) */
function articleSeoHtml(article) {
  return [
    '<div id="seo-article-block">',
    `  <h1>${esc(article.h1)}</h1>`,
    `  <p><time datetime="${esc(article.datePublished)}">${esc(ruDate(article.datePublished))}</time></p>`,
    articleSectionsHtml(article.sections),
    '</div>',
    '',
  ].join('\n');
}

/**
 * Статический SEO-блок страницы «Для организаторов» (id=seo-b2b-block —
 * как статьи/города: main.tsx удаляет его при монтировании SPA): h1 +
 * интро + секции + FAQ (details/summary) + финальный CTA. Ровно один h1;
 * секции рендерятся тем же кодом, что статьи (articleSectionsHtml /
 * mdLinksToHtml — md-ссылки из forOrganizers.json превращаются в <a>).
 */
function forOrganizersSeoHtml(c) {
  const faq = (c.faq ?? [])
    .map(
      (f) =>
        `  <details><summary>${mdLinksToHtml(f.q)}</summary><p>${mdLinksToHtml(f.a)}</p></details>`,
    )
    .join('\n');
  const lines = [
    '<div id="seo-b2b-block">',
    `  <h1>${esc(c.h1)}</h1>`,
    `  <p>${mdLinksToHtml(c.intro ?? '')}</p>`,
    articleSectionsHtml(c.sections),
  ];
  if (faq) lines.push(faq);
  lines.push(`  <h2>${esc(c.final?.h2 ?? '')}</h2>`);
  lines.push(`  <p>${mdLinksToHtml(c.final?.p ?? '')}</p>`);
  lines.push('  <p><a href="/">Создать событие</a></p>');
  lines.push('</div>', '');
  return lines.join('\n');
}

/** JSON-LD страницы «Для организаторов»: AboutPage + BreadcrumbList
 * («Главная > Для организаторов», как статьи) + FAQPage (4 Question/Answer
 * из forOrganizers.json) в одном @graph. */
function forOrganizersJsonLd(c, url) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'AboutPage',
        name: c.h1,
        description: c.description,
        url,
        inLanguage: 'ru',
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Главная', item: `${SITE_URL}/` },
          { '@type': 'ListItem', position: 2, name: 'Для организаторов', item: url },
        ],
      },
      {
        '@type': 'FAQPage',
        mainEntity: (c.faq ?? []).map((f) => ({
          '@type': 'Question',
          name: f.q,
          acceptedAnswer: { '@type': 'Answer', text: f.a },
        })),
      },
    ],
  };
}

/** JSON-LD индекса: Blog со списком статей (blogPost) */
function blogIndexJsonLd(articles) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Blog',
    name: 'Блог MyPins',
    url: `${SITE_URL}/blog/`,
    blogPost: articles.map((a) => ({
      '@type': 'BlogPosting',
      url: `${SITE_URL}/blog/${a.slug}/`,
      headline: a.h1,
      datePublished: a.datePublished,
    })),
  };
}

/** JSON-LD статьи: BlogPosting (автор — команда MyPins) + BreadcrumbList */
function articleJsonLd(article, url) {
  const blogUrl = `${SITE_URL}/blog/`;
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BlogPosting',
        headline: article.h1,
        description: article.description,
        datePublished: article.datePublished,
        dateModified: article.dateModified,
        inLanguage: article.lang || 'ru',
        url,
        mainEntityOfPage: url,
        author: {
          '@type': 'Organization',
          name: 'MyPins',
          url: `${SITE_URL}/`,
        },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Главная', item: `${SITE_URL}/` },
          { '@type': 'ListItem', position: 2, name: 'Блог', item: blogUrl },
          { '@type': 'ListItem', position: 3, name: article.h1, item: url },
        ],
      },
    ],
  };
}

// --- Утилиты ---

/** HTML/XML-экранирование (& < > " ') — для значений АТРИБУТОВ meta/link */
function esc(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * JSON-LD в <script type="application/ld+json">: JSON.stringify + замена
 * «<» на \u003c. JSON остаётся ВАЛИДНЫМ (парсится как есть), но строка
 * </script> внутри текста невозможна. HTML-сущностями экранировать нельзя —
 * сломает JSON (проверка приёмки парсит блок).
 */
function ldJson(obj) {
  return JSON.stringify(obj).replace(/</g, '\\u003c');
}

/** photos[i] события: полный http(s)-URL — как есть; путь в bucket → storage-URL */
function absPhoto(p) {
  const s = String(p ?? '').trim();
  if (!s) return '';
  return /^https?:\/\//i.test(s) ? s : `${SUPABASE_URL}/storage/v1/object/public/photos/${s}`;
}

const RU_MONTHS = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

/** «2026-09-05» → «5 сентября 2026» (без часовых поясов) */
function ruDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  if (!m) return iso;
  const [, y, mo, d] = m;
  const month = RU_MONTHS[Number(mo) - 1];
  return month ? `${Number(d)} ${month} ${y}` : iso;
}

/** +N дней к ISO-дате (Date.UTC нормализует переполнение месяца/года) */
function addDaysIso(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** ISO-дата (YYYY-MM-DD) -> день недели по ISO: 1=Пн … 7=Вс (UTC, без TZ) */
function isoDayOfWeek(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const js = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return js === 0 ? 7 : js;
}

/**
 * Ближайшее БУДУЩЕЕ вхождение повторяющегося события для JSON-LD startDate.
 * Семантика как в src/lib/recurrence.ts (recurrenceMatchesDate, isoDayOfWeek),
 * но ищем от max(start_date, todayIso) ВПЕРЁД: разовое событие (нет
 * recurrence) — start_date как есть; daily — первый же день; weekly — первый
 * день, чей день недели в days; горизонт — end_date (включительно) или +90
 * дней от todayIso для бессрочных серий. Вхождение не найдено (серия
 * кончилась / нужного дня недели нет) — fallback на start_date (как раньше).
 */
function nextOccurrenceDate(ev, todayIso) {
  const r = ev.recurrence && typeof ev.recurrence === 'object' ? ev.recurrence : null;
  const first = typeof ev.start_date === 'string' && ev.start_date ? ev.start_date : '';
  if (!r || !first) return first || todayIso;
  const from = first > todayIso ? first : todayIso;
  const hasEnd = typeof ev.end_date === 'string' && ev.end_date.length > 0;
  const horizon = hasEnd ? ev.end_date : addDaysIso(todayIso, 90);
  let d = from;
  let guard = 0;
  while (d <= horizon && guard < 10000) {
    if (r.freq === 'daily') return d;
    if ((r.days ?? []).includes(isoDayOfWeek(d))) return d;
    d = addDaysIso(d, 1);
    guard += 1;
  }
  return first;
}

/** Обрезка без разрыва суррогатной пары (эмодзи) */
function cutSafe(s, max) {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const code = cut.charCodeAt(cut.length - 1);
  // Высокий суррогат без низкого — отрезать, чтобы не писать U+FFFD
  return code >= 0xd800 && code <= 0xdbff ? cut.slice(0, -1) : cut;
}

/** Убрать HTML-теги и схлопнуть пробелы/переносы (описания в meta и JSON-LD) */
function cleanText(text) {
  return String(text ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Вычистить HTML/переносы, обрезать по границе слова (title ~65, desc ~140) */
function snippet(text, max) {
  const clean = cleanText(text);
  if (!clean) return '';
  if (clean.length <= max) return clean;
  const cut = cutSafe(clean, max);
  const space = cut.lastIndexOf(' ');
  const head = (space > max * 0.6 ? cut.slice(0, space) : cut)
    .replace(/[\s,.;:—–-]+$/, '')
    .trim();
  return `${head}…`;
}

/**
 * JSON-LD Event для страницы события. Данные — из ответа list_active_events
 * (как ev на сайте): название/описание на языке оригинала, координаты,
 * адрес/город, первое фото, цена. url — канонический URL события (со слэшем).
 */
function eventJsonLd(ev, url) {
  const city = typeof ev.city === 'string' ? ev.city.trim() : '';
  const address = typeof ev.address === 'string' ? ev.address.trim() : '';
  const country = typeof ev.country === 'string' ? ev.country.trim() : '';
  const lat = Number(ev.lat);
  const lng = Number(ev.lng);
  // Как isValidCoords (src/lib/coords.ts): (0,0) и |lat|>90 / |lng|>180 — нет
  const hasCoords =
    ev.lat != null &&
    ev.lng != null &&
    !Number.isNaN(lat) &&
    !Number.isNaN(lng) &&
    !(lat === 0 && lng === 0) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180;
  const price = ev.price != null ? Number(ev.price) : 0;
  const currency = (
    typeof ev.currency === 'string' && ev.currency ? ev.currency : 'usd'
  ).toUpperCase();
  const lang = Array.isArray(ev.languages) && ev.languages[0]
    ? ev.languages[0]
    : ev.language || ev.source_lang || '';
  const ruText = ev.description_ru || ev.description || ev.description_en || '';
  const orgName =
    typeof ev.org_display_name === 'string' ? ev.org_display_name.trim() : '';
  const photo = Array.isArray(ev.photos) ? absPhoto(ev.photos[0]) : '';

  // startDate повторяющихся событий — ближайшее БУДУЩЕЕ вхождение на дату
  // сборки (иначе в JSON-LD уходит первое вхождение серии, часто в прошлом,
  // и Google не показывает rich-результат). Разовые — как раньше (start_date).
  const sd = nextOccurrenceDate(ev, TODAY_ISO);

  const doc = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: String(ev.title ?? ''),
    url,
    startDate: ev.start_time ? `${sd}T${ev.start_time}` : sd,
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location: {
      '@type': 'Place',
      name: address || city,
      address: {
        '@type': 'PostalAddress',
        addressLocality: city,
        ...(address ? { streetAddress: address } : {}),
        ...(country ? { addressCountry: country } : {}),
      },
      ...(hasCoords
        ? { geo: { '@type': 'GeoCoordinates', latitude: lat, longitude: lng } }
        : {}),
    },
    offers: {
      '@type': 'Offer',
      url,
      price,
      priceCurrency: currency,
      ...(ev.donation ? { description: 'donation' } : {}),
    },
  };
  if (ruText) doc.description = cleanText(ruText);
  if (photo) doc.image = photo;
  if (orgName) doc.organizer = { '@type': 'Organization', name: orgName };
  if (lang) doc.inLanguage = lang;
  return doc;
}

/**
 * Копия dist/index.html для URL-пути: заменить <title>, meta description и
 * canonical; базовые og:/twitter:-метки главной вычистить и пересобрать
 * Open Graph для этой страницы (у события/города свои og:title/og:url/
 * og:image); JSON-LD страницы (meta.jsonLd) добавить отдельным скриптом —
 * базовый @graph WebSite/Organization из index.html остаётся на всех
 * страницах. Если meta.bodySeo задан (городские страницы) — вставить
 * видимый SEO-текст в <body> рядом с #root.
 */
function renderPage(baseHtml, meta) {
  let out = baseHtml.replace(/<title>[\s\S]*?<\/title>/i, () => `<title>${esc(meta.title)}</title>`);
  out = out.replace(/<meta\s+name=["']description["'][^>]*>/gi, '');
  out = out.replace(/<link\s+rel=["']canonical["'][^>]*\/?>/gi, '');
  out = out.replace(/<meta\s+(?:property|name)=["'](?:og|twitter):[^"']*["'][^>]*>/gi, '');
  const lines = [
    `    <meta name="description" content="${esc(meta.description)}" />`,
    `    <link rel="canonical" href="${esc(meta.canonical)}" />`,
    `    <meta property="og:site_name" content="MyPins" />`,
    `    <meta property="og:type" content="website" />`,
    `    <meta property="og:title" content="${esc(meta.ogTitle)}" />`,
    `    <meta property="og:description" content="${esc(meta.ogDescription)}" />`,
    `    <meta property="og:url" content="${esc(meta.ogUrl)}" />`,
    `    <meta property="og:image" content="${esc(meta.ogImage)}" />`,
    `    <meta name="twitter:card" content="summary_large_image" />`,
  ];
  if (meta.jsonLd) {
    lines.push(`    <script type="application/ld+json">${ldJson(meta.jsonLd)}</script>`);
  }
  out = out.replace(/<\/head>/i, `${lines.join('\n')}\n  </head>`);
  if (meta.bodySeo) {
    out = out.replace(/<div id="root"><\/div>/i, () => `<div id="root"></div>\n${meta.bodySeo}`);
  }
  return out;
}

/** Записать dist/<path>/index.html из шаблона */
function writePage(baseHtml, path, meta) {
  const dir = join(DIST, ...path.split('/'));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.html'), renderPage(baseHtml, meta));
}

/** Статический SEO-блок города (RU) для вставки в <body> рядом с #root:
 * видимый h1 + интро + FAQ. Виден краулеру без JS; при живом React SPA
 * удаляет его (main.tsx) и рисует свой локализованный блок. Контент
 * вопросов-ответов остаётся в DOM (details). */
function citySeoHtml(seo) {
  const faq = seo.faq
    .map(
      (f) =>
        `    <details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`,
    )
    .join('\n');
  return [
    '<div id="seo-city-block">',
    `  <h1>${esc(seo.h1)}</h1>`,
    `  <p>${esc(seo.intro)}</p>`,
    '  <h2>Частые вопросы</h2>',
    faq,
    '</div>',
    '',
  ].join('\n');
}

/**
 * Статический SEO-блок события (RU) для вставки в <body> рядом с #root:
 * ровно один h1 = название события (локализованное для RU — title_ru, иначе
 * title, иначе title_en — как localizedText в src/lib/translate.ts с lang='ru')
 * и под ним — дата/время, место, цена, описание и строка «Организатор:» со
 * ссылкой на профиль (по заполненности полей; без фото). Дата — ближайшее
 * БУДУЩЕЕ вхождение повторяющегося события, как в eventJsonLd
 * (nextOccurrenceDate). Блок виден краулеру без JS; при живом React SPA
 * удаляет его (main.tsx) и рисует карточку события сама — на странице
 * остаётся ровно один h1.
 */
function eventSeoHtml(ev, url) {
  const name = ev.title_ru || ev.title || ev.title_en || '';
  const sd = nextOccurrenceDate(ev, TODAY_ISO);
  const time = typeof ev.start_time === 'string' ? ev.start_time.trim() : '';
  const city = typeof ev.city === 'string' ? ev.city.trim() : '';
  const address = typeof ev.address === 'string' ? ev.address.trim() : '';
  const price = ev.price != null ? Number(ev.price) : null;
  const currency = (
    typeof ev.currency === 'string' && ev.currency ? ev.currency : 'usd'
  ).toUpperCase();
  const donation = Boolean(ev.donation);
  const ruText = ev.description_ru || ev.description || ev.description_en || '';
  const orgName =
    typeof ev.org_display_name === 'string' ? ev.org_display_name.trim() : '';
  const ownerId = typeof ev.owner_id === 'string' ? ev.owner_id.trim() : '';

  const lines = ['<div id="seo-event-block">'];
  if (name) lines.push(`  <h1>${esc(name)}</h1>`);
  if (sd) {
    const dateText = time ? `${ruDate(sd)}, ${time}` : ruDate(sd);
    const datetime = time ? `${sd}T${time}` : sd;
    lines.push(`  <p><time datetime="${esc(datetime)}">${esc(dateText)}</time></p>`);
  }
  // Место: адрес и город, если заполнены (страна в событиях — код, не
  // название). Адрес сборщика часто уже заканчивается городом
  // («Lila Coffee, Нячанг») — город не дублируем.
  let place = address;
  if (!place) {
    place = city;
  } else if (
    city &&
    !place.toLowerCase().endsWith(`, ${city.toLowerCase()}`) &&
    place.toLowerCase() !== city.toLowerCase()
  ) {
    place = `${place}, ${city}`;
  }
  if (place) lines.push(`  <address>${esc(place)}</address>`);
  // Цена: платная — «{price} {currency}»; price 0 (или не указана) + donation —
  // «Донат»; 0 — «Бесплатно»; не указана (null) — строку не выводим (в SPA
  // «Цену уточняйте у организатора» — см. card.priceUnknown в ru.ts)
  let priceText = '';
  if (price != null && price > 0) {
    priceText = `${price} ${currency}`;
  } else if (donation) {
    priceText = 'Донат';
  } else if (price === 0) {
    priceText = 'Бесплатно';
  }
  if (priceText) lines.push(`  <p>${esc(priceText)}</p>`);
  if (ruText) lines.push(`  <p>${esc(ruText)}</p>`);
  if (orgName && ownerId) {
    const orgUrl = `${SITE_URL}/org/${encodeURIComponent(ownerId)}/`;
    lines.push(`  <p>Организатор: <a href="${esc(orgUrl)}">${esc(orgName)}</a></p>`);
  }
  lines.push('</div>', '');
  return lines.join('\n');
}

// --- Главный ход ---

async function main() {
  const db = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const { data, error } = await db.rpc('list_active_events');
  if (error) {
    console.error(`seo-prerender: ошибка list_active_events: ${error.message}`);
    process.exit(1);
  }
  const events = data ?? [];
  if (!events.length) {
    console.error('seo-prerender: list_active_events вернул пустой список — не деплоим пустые страницы.');
    process.exit(1);
  }

  const baseHtml = readFileSync(join(DIST, 'index.html'), 'utf8');
  const locs = [`${SITE_URL}/`];
  // <lastmod> для sitemap: по умолчанию дата сборки (TODAY_ISO); статьи блога
  // и /blog/ перекрываются датой публикации статьи (lastmods.set ниже)
  const lastmods = new Map();

  // Города: canonical/og:url — со слэшем (GitHub Pages отдаёт 200 только
  // на /bali/, без слэша — 301). Плюс видимый SEO-блок в body (RU) — тот же
  // текст, что SPA рисует из i18n (citySeo.<path>.*) на городском виде.
  for (const c of CITY_PAGES) {
    const url = `${SITE_URL}/${c.path}/`;
    const seo = CITY_SEO[c.path];
    writePage(baseHtml, c.path, {
      title: c.title,
      description: c.description,
      canonical: url,
      ogTitle: c.title,
      ogDescription: c.description,
      ogUrl: url,
      ogImage: LOGO_URL,
      jsonLd: null,
      bodySeo: seo ? citySeoHtml(seo) : null,
    });
    locs.push(url);
    console.log(`  /${c.path}/index.html`);
  }

  // События: URL должен совпадать с тем, что строит SPA, —
  // /event/<id>/<slugify(title)> (src/pages/Home.tsx replaceState)
  const pageEvents = [];
  for (const ev of events) {
    if (!ev || typeof ev.id !== 'string' || typeof ev.title !== 'string') continue;
    const path = `event/${ev.id}/${slugify(ev.title)}`;
    const url = `${SITE_URL}/${path}/`;
    const title = snippet(`${ev.title} · ${ev.city ?? ''}`.trim(), 65) || 'Событие';
    const city = typeof ev.city === 'string' ? ev.city.trim() : '';
    // Текст, который видит русскоязычный посетитель (html lang="ru"),
    // как localizedText(description, description_ru, …): перевод или оригинал
    const ruText = ev.description_ru || ev.description || ev.description_en || '';
    const date = ruDate(ev.start_date);
    const prefix = [city, date].filter(Boolean).join(', ');
    const description = snippet(prefix ? `${prefix}. ${ruText}` : ruText, 160);
    const photo = Array.isArray(ev.photos) ? absPhoto(ev.photos[0]) : '';
    writePage(baseHtml, path, {
      title,
      description,
      canonical: url,
      ogTitle: title,
      ogDescription: description,
      ogUrl: url,
      ogImage: photo || LOGO_URL,
      jsonLd: eventJsonLd(ev, url),
      bodySeo: eventSeoHtml(ev, url),
    });
    locs.push(url);
    pageEvents.push(path);
  }
  console.log(`  событий: ${pageEvents.length}, страниц всего: ${locs.length}`);

  // Организаторы: /org/<id> — публичные профили организаторов, у которых в
  // списке событий выше есть owner_id. Профиль — из публичного RPC
  // get_org_profile (как src/lib/api.ts:443-451). Страница пишется только
  // если display_name непустой И (у org есть активные события || bio
  // непустой) — пустышки остаются 404 и в sitemap не попадают.
  // КОНТАКТЫ (телефон/email/telegram/instagram и пр.) в статический HTML и
  // JSON-LD не выводятся НИКОГДА — даже при contacts_public=true: индексация
  // профиля не должна публиковать личные данные, их покажет живой React.
  const orgIds = [
    ...new Set(
      events.map((ev) => ev.owner_id).filter((id) => typeof id === 'string' && id.length > 0),
    ),
  ];
  let pageOrgs = 0;
  for (const id of orgIds) {
    const { data, error } = await db
      .rpc('get_org_profile', { p_org_id: id })
      .maybeSingle();
    if (error) {
      console.log(`  /org/${id}: пропущен (${error.message})`);
      continue;
    }
    const profile = data ?? null;
    const name = typeof profile?.display_name === 'string' ? profile.display_name.trim() : '';
    const bio = typeof profile?.bio === 'string' ? profile.bio.trim() : '';
    const hasEvents = events.some((ev) => ev.owner_id === id);
    if (!name || (!hasEvents && !bio)) continue;
    const url = `${SITE_URL}/org/${encodeURIComponent(id)}/`;
    const title = `${snippet(name, 40)}: события и афиша | MyPins`;
    const description = bio
      ? snippet(bio, 155)
      : `${name} — организатор событий. Актуальная афиша на карте MyPins: даты, места и цены.`;
    const avatar =
      typeof profile.avatar_url === 'string' && profile.avatar_url.trim()
        ? profile.avatar_url.trim()
        : '';
    const image = avatar ? absPhoto(avatar) : LOGO_URL;
    const bodySeo = `<div id="seo-org-block">\n  <h1>${esc(name)}</h1>${
      bio ? `\n  <p>${esc(bio)}</p>` : ''
    }\n</div>`;
    writePage(baseHtml, `org/${encodeURIComponent(id)}`, {
      title,
      description,
      canonical: url,
      ogTitle: title,
      ogDescription: description,
      ogUrl: url,
      ogImage: image,
      jsonLd: {
        '@context': 'https://schema.org',
        '@type': 'ProfilePage',
        url,
        mainEntity: {
          '@type': 'Organization',
          name,
          url,
          logo: image,
          ...(bio ? { description: bio } : {}),
        },
      },
      bodySeo,
    });
    locs.push(url);
    pageOrgs += 1;
    console.log(`  /org/${id}/index.html`);
  }
  console.log(`  организаторов: ${pageOrgs}, страниц всего: ${locs.length}`);

  // Блог: /blog/ + /blog/<slug>/ — статьи из src/content/articles.json
  // (единый источник с SPA src/pages/Blog.tsx; тексты дословно, здесь не
  // дублируются). URL со слэшем, как у городов/событий. <lastmod> статей в
  // sitemap = datePublished, у /blog/ — дата свежей статьи.
  const blogArticles = loadArticles();
  if (!blogArticles.length) {
    console.error('seo-prerender: articles.json пуст — блог не публикуем.');
    process.exit(1);
  }
  const blogUrl = `${SITE_URL}/blog/`;
  const blogLastmod = [...blogArticles]
    .map((a) => a.datePublished)
    .filter(Boolean)
    .sort()
    .at(-1);
  writePage(baseHtml, 'blog', {
    title: BLOG_META.title,
    description: BLOG_META.description,
    canonical: blogUrl,
    ogTitle: BLOG_META.title,
    ogDescription: BLOG_META.description,
    ogUrl: blogUrl,
    ogImage: LOGO_URL,
    jsonLd: blogIndexJsonLd(blogArticles),
    bodySeo: blogIndexSeoHtml(blogArticles),
  });
  locs.push(blogUrl);
  if (blogLastmod) lastmods.set(blogUrl, blogLastmod);
  console.log('  /blog/index.html');
  for (const a of blogArticles) {
    if (!a || typeof a.slug !== 'string' || !a.slug) continue;
    const url = `${SITE_URL}/blog/${a.slug}/`;
    writePage(baseHtml, `blog/${a.slug}`, {
      title: String(a.title ?? ''),
      description: String(a.description ?? ''),
      canonical: url,
      ogTitle: String(a.title ?? ''),
      ogDescription: String(a.description ?? ''),
      ogUrl: url,
      ogImage: LOGO_URL,
      jsonLd: articleJsonLd(a, url),
      bodySeo: articleSeoHtml(a),
    });
    locs.push(url);
    if (a.datePublished) lastmods.set(url, a.datePublished);
    console.log(`  /blog/${a.slug}/index.html`);
  }
  console.log(`  статей: ${blogArticles.length}, страниц всего: ${locs.length}`);

  // B2B-страница «Для организаторов»: /for-organizers/ — контент из
  // src/content/forOrganizers.json (единый источник с SPA, тексты здесь не
  // дублируются). JSON-LD: AboutPage + BreadcrumbList + FAQPage.
  const organizers = loadForOrganizers();
  const organizersUrl = `${SITE_URL}/for-organizers/`;
  writePage(baseHtml, 'for-organizers', {
    title: String(organizers.title ?? ''),
    description: String(organizers.description ?? ''),
    canonical: organizersUrl,
    ogTitle: String(organizers.title ?? ''),
    ogDescription: String(organizers.description ?? ''),
    ogUrl: organizersUrl,
    ogImage: LOGO_URL,
    jsonLd: forOrganizersJsonLd(organizers, organizersUrl),
    bodySeo: forOrganizersSeoHtml(organizers),
  });
  locs.push(organizersUrl);
  lastmods.set(organizersUrl, TODAY_ISO);
  console.log('  /for-organizers/index.html');

  // sitemap.xml (перезапись). <lastmod> = дата сборки (TODAY_ISO) — сигнал
  // поисковикам, что контент страницы мог измениться; статьи блога несут
  // <lastmod> = datePublished (см. lastmods)
  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...locs
      .slice()
      .sort((a, b) => a.localeCompare(b))
      .map((u) => `  <url><loc>${esc(u)}</loc><lastmod>${lastmods.get(u) ?? TODAY_ISO}</lastmod></url>`),
    '</urlset>',
    '',
  ].join('\n');
  writeFileSync(join(DIST, 'sitemap.xml'), xml);
  console.log(`  dist/sitemap.xml: ${locs.length} URL`);
}

main().catch((e) => {
  console.error(`seo-prerender: критическая ошибка: ${e.message}`);
  process.exit(1);
});
