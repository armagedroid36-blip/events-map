// SEO-пререндер (beta 0.14): после `vite build` генерирует в dist/ физические
// index.html для /bali, /da-nang, /nha-trang, каждого активного
// /event/<id>/<slug>, публичных профилей /org/<id>, блога /blog и статей
// /blog/<slug>, B2B-страницы «Для организаторов» /for-organizers и страницы
// «О проекте» /about (в <head> — уникальные
// title/description, canonical и Open Graph со хвостовым слэшем, на событиях —
// JSON-LD Event+BreadcrumbList, на организаторах — ProfilePage+Organization+
// BreadcrumbList, на статьях — BlogPosting+BreadcrumbList, на /blog — Blog,
// на /for-organizers и /about — AboutPage+BreadcrumbList (на B2B ещё FAQPage,
// на /about — Organization с контактами)), чтобы
// глубокие URL отдавали HTTP 200, и перезаписывает dist/sitemap.xml списком
// всех страниц. Источник данных — тот же RPC, что зовёт сайт:
// db.rpc('list_active_events') (src/lib/api.ts) — прошлые/скрытые/события
// заблокированных организаторов сюда не попадают автоматически.
// Статьи блога — src/content/articles.json, «Для организаторов» —
// src/content/forOrganizers.json, «О проекте» — src/content/about.json
// (единые источники с SPA, не
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
// Сколько ближайших событий города показывать в статическом блоке городской
// страницы (план SEO п.4.1.2 «5–15»; на карте сейчас событий мало — до 8)
const MAX_CITY_EVENTS = 8;
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

// --- EN-версии городских SEO-текстов: держать синхронно с en.ts:574-633
// (citySeo.bali/da-nang/nha-trang: h1/intro/faq), как CITY_SEO~ru.ts.
const CITY_SEO_EN = {
  bali: {
    h1: 'Events in Bali',
    intro:
      "Bali is one of the most event-packed places in Southeast Asia — travellers, digital nomads and expats cross paths here all year round. MyPins is a live map of Bali events: parties and concerts, yoga and retreats, markets, festivals and expat meetups. Organizers publish their own events, so the list stays fresh. Filter by date, category or price, or zoom the map to your area — Canggu, Ubud, Seminyak, Kuta — to see what is happening nearby.",
    faq: [
      {
        q: 'What events are happening in Bali?',
        a: "On MyPins, organizers publish their own events: parties, concerts, yoga classes, markets, festivals and expat meetups. Every pin on the map shows the date, venue and price.",
      },
      {
        q: 'How do I find events in Canggu, Ubud or another area?',
        a: "Zoom the map to the area you need — the list shows events on the visible part of the map. You can also filter by category, date, price and event language.",
      },
      {
        q: 'Are there free events in Bali?',
        a: 'Yes. Use the price filter and choose “Free” or “Donation” — free entry with an optional contribution. Every event card shows the price: free, donation or an amount in the event’s currency.',
      },
    ],
  },
  'da-nang': {
    h1: 'Events in Da Nang',
    intro:
      "Da Nang is one of Vietnam's fastest-growing cities, home to a large community of expats and travellers. MyPins shows what is on in Da Nang right now: parties and concerts, sports and yoga, markets and expat meetups. Organizers publish events themselves, so the listings stay fresh. Use filters for date, category, price and language to plan your evening or weekend.",
    faq: [
      {
        q: 'What events are happening in Da Nang?',
        a: "On MyPins, Da Nang events are published by organizers themselves: concerts, parties, yoga, sports, markets and expat meetups. The map shows the date, venue and price of every event.",
      },
      {
        q: 'What to do in Da Nang today or tomorrow?',
        a: 'In the date filter choose “Today” or “Tomorrow” to see events for those days. For the weekend, browse the whole map — there are more events to choose from.',
      },
      {
        q: 'How much do events in Da Nang cost?',
        a: "Every event card shows the price: free, donation or an amount in the event's currency. The price filter can show only free events.",
      },
    ],
  },
  'nha-trang': {
    h1: 'Events in Nha Trang',
    intro:
      "Nha Trang is Vietnam's main beach resort and a popular winter spot for travellers and expats. MyPins maps what is happening in Nha Trang: concerts and parties, speaking clubs and meetups, yoga, shows and markets. Organizers add events directly, so you always see current dates, venues and prices. Filter by date, category or price to decide where to go.",
    faq: [
      {
        q: 'What events are happening in Nha Trang?',
        a: 'Organizers publish them themselves: parties, concerts, speaking clubs, yoga, shows and markets. Every event on the map has a date, venue and price.',
      },
      {
        q: 'Are there expat meetups or speaking clubs in Nha Trang?',
        a: "Yes — for example, the SmallTalk speaking club, whose events happen regularly in Nha Trang and are on the map. To stay updated, enable push notifications about new events in your profile.",
      },
      {
        q: 'How much do events in Nha Trang cost?',
        a: "The event card shows the price: free, donation or an amount in the event's currency. The price filter can show only free events if you need.",
      },
    ],
  },
};

// EN-версии title/description городских страниц (для /en/<city>/).
const CITY_PAGES_EN = [
  {
    path: 'bali',
    title: 'Events in Bali: concerts, parties and festivals | MyPins',
    description:
      'Bali events map for travellers and expats: concerts, parties, yoga, markets and festivals with dates, venues and prices.',
  },
  {
    path: 'da-nang',
    title: 'Events in Da Nang: parties, concerts and meetups | MyPins',
    description:
      'Da Nang events map for expats and travellers: parties, concerts, yoga and meetups with dates, venues and prices.',
  },
  {
    path: 'nha-trang',
    title: 'Events in Nha Trang: concerts, shows and parties | MyPins',
    description:
      'Nha Trang events map for travellers and expats: concerts, shows, parties and speaking clubs with dates, venues and prices.',
  },
];

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

/** Контент страницы «О проекте» из src/content/about.json (readFileSync —
 * единый источник с SPA src/pages/About.tsx) */
function loadAbout() {
  const raw = readFileSync(join(ROOT, 'src/content/about.json'), 'utf8');
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('about.json: ожидался объект');
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
 * lang='en' (для /en/blog/): h1 «MyPins Blog…», карточки из *_en полей,
 * даты английские, ссылки SITE_URL/en/blog/<slug>/.
 */
function blogIndexSeoHtml(articles, lang = 'ru') {
  const en = lang === 'en';
  const cards = [...articles]
    .sort((a, b) => String(b.datePublished).localeCompare(String(a.datePublished)))
    .map((a) => {
      const h1 = en ? a.h1_en || a.h1 : a.h1;
      const desc = en ? a.description_en || a.description : a.description;
      const url = `${SITE_URL}${en ? '/en' : ''}/blog/${a.slug}/`;
      return [
        '  <article>',
        `    <h2><a href="${esc(url)}">${esc(h1)}</a></h2>`,
        `    <p>${esc(en ? enDate(a.datePublished) : ruDate(a.datePublished))}</p>`,
        `    <p>${esc(desc)}</p>`,
        '  </article>',
      ].join('\n');
    })
    .join('\n');
  const h1 = en ? 'MyPins Blog: guides to events and listings' : 'Блог MyPins: гиды по событиям';
  return ['<div id="seo-article-block">', `  <h1>${h1}</h1>`, cards, '</div>', ''].join('\n');
}

/** Подпись редакции (E-E-A-T) в конце блока статьи — по языку страницы */
function articleBylineHtml(lang = 'ru') {
  if (lang === 'en') {
    return `  <p class="article-byline">MyPins Editorial · <a href="${SITE_URL}/en/about/">About the project</a></p>`;
  }
  return `  <p class="article-byline">Редакция MyPins · <a href="${SITE_URL}/about/">О проекте и контакты</a></p>`;
}

/**
 * Статический SEO-блок статьи: h1 + дата публикации + секции + подпись
 * редакции (E-E-A-T: авторство «Редакция MyPins» со ссылкой на /about/).
 * lang='en' — h1/description/секции из *_en полей статьи.
 */
function articleSeoHtml(article, lang = 'ru') {
  const en = lang === 'en';
  const h1 = en ? article.h1_en || article.h1 : article.h1;
  const sections = en ? article.sections_en || article.sections : article.sections;
  return [
    '<div id="seo-article-block">',
    `  <h1>${esc(h1)}</h1>`,
    `  <p><time datetime="${esc(article.datePublished)}">${esc(
      en ? enDate(article.datePublished) : ruDate(article.datePublished),
    )}</time></p>`,
    articleSectionsHtml(sections),
    articleBylineHtml(lang),
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
 * lang='en' (для /en/for-organizers/) — из *_en полей (заголовки, intro,
 * sections_en, faq_en, final_en; CTA «Create event»).
 */
function forOrganizersSeoHtml(c, lang = 'ru') {
  const en = lang === 'en';
  const pick = (field, fieldEn) => (en ? c[fieldEn] || c[field] : c[field]);
  const faq = (en ? c.faq_en || c.faq : c.faq ?? [])
    .map(
      (f) =>
        `  <details><summary>${mdLinksToHtml(f.q)}</summary><p>${mdLinksToHtml(f.a)}</p></details>`,
    )
    .join('\n');
  const finalH2 = pick('final', 'final_en')?.h2 ?? '';
  const finalP = pick('final', 'final_en')?.p ?? '';
  const cta = en ? 'Create event' : 'Создать событие';
  const lines = [
    '<div id="seo-b2b-block">',
    `  <h1>${esc(pick('h1', 'h1_en'))}</h1>`,
    `  <p>${mdLinksToHtml(pick('intro', 'intro_en') ?? '')}</p>`,
    articleSectionsHtml(en ? c.sections_en || c.sections : c.sections),
  ];
  if (faq) lines.push(faq);
  lines.push(`  <h2>${esc(finalH2)}</h2>`);
  lines.push(`  <p>${mdLinksToHtml(finalP)}</p>`);
  lines.push(`  <p><a href="${en ? SITE_URL + '/en/' : '/'}">${cta}</a></p>`);
  lines.push('</div>', '');
  return lines.join('\n');
}

/** JSON-LD страницы «Для организаторов»: AboutPage + BreadcrumbList
 * («Главная > Для организаторов», как статьи) + FAQPage (4 Question/Answer
 * из forOrganizers.json) в одном @graph. lang='en' — имена/описание и
 * FAQ из *_en полей, Breadcrumb Home > For organizers. */
function forOrganizersJsonLd(c, url, lang = 'ru') {
  const en = lang === 'en';
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'AboutPage',
        name: en ? c.h1_en || c.h1 : c.h1,
        description: en ? c.description_en || c.description : c.description,
        url,
        inLanguage: en ? 'en' : 'ru',
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: en ? 'Home' : 'Главная', item: `${SITE_URL}${en ? '/en' : ''}/` },
          { '@type': 'ListItem', position: 2, name: en ? 'For organizers' : 'Для организаторов', item: url },
        ],
      },
      {
        '@type': 'FAQPage',
        mainEntity: (en ? c.faq_en || c.faq : c.faq ?? []).map((f) => ({
          '@type': 'Question',
          name: f.q,
          acceptedAnswer: { '@type': 'Answer', text: f.a },
        })),
      },
    ],
  };
}

/**
 * Статический SEO-блок страницы «О проекте» (id=seo-about-block — как
 * b2b/статьи: main.tsx удаляет его при монтировании SPA): h1 + секции
 * (articleSectionsHtml / mdLinksToHtml — md-ссылки из about.json на города,
 * блог, /for-organizers, почту и Telegram-бот превращаются в <a>).
 * lang='en' (для /en/about/) — секции из sections_en.
 */
function aboutSeoHtml(c, lang = 'ru') {
  const en = lang === 'en';
  return [
    '<div id="seo-about-block">',
    `  <h1>${esc(en ? c.h1_en || c.h1 : c.h1)}</h1>`,
    articleSectionsHtml(en ? c.sections_en || c.sections : c.sections),
    '</div>',
    '',
  ].join('\n');
}

/**
 * JSON-LD страницы «О проекте»: AboutPage + Organization (команда MyPins —
 * только реальные факты из about.json: url сайта и email редакции, который
 * показан в видимом блоке) + BreadcrumbList («Главная > О проекте») в одном
 * @graph. Базовый @graph WebSite/Organization из index.html остаётся первым
 * скриптом — на странице /about два ld+json блока (как на остальных).
 * lang='en' (для /en/about/) — name/description из *_en, Breadcrumb Home.
 */
function aboutJsonLd(c, url, lang = 'ru') {
  const en = lang === 'en';
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'AboutPage',
        name: en ? c.h1_en || c.h1 : c.h1,
        description: en ? c.description_en || c.description : c.description,
        url,
        inLanguage: en ? 'en' : 'ru',
      },
      {
        '@type': 'Organization',
        name: 'MyPins',
        url: `${SITE_URL}${en ? '/en' : ''}/`,
        logo: LOGO_URL,
        email: typeof c.email === 'string' && c.email ? c.email : '',
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: en ? 'Home' : 'Главная', item: `${SITE_URL}${en ? '/en' : ''}/` },
          { '@type': 'ListItem', position: 2, name: en ? 'About' : 'О проекте', item: url },
        ],
      },
    ],
  };
}

/** JSON-LD индекса: Blog со списком статей (blogPost). lang='en' — из *_en. */
function blogIndexJsonLd(articles, lang = 'ru') {
  const en = lang === 'en';
  return {
    '@context': 'https://schema.org',
    '@type': 'Blog',
    name: en ? 'MyPins Blog' : 'Блог MyPins',
    url: `${SITE_URL}${en ? '/en' : ''}/blog/`,
    blogPost: articles.map((a) => ({
      '@type': 'BlogPosting',
      url: `${SITE_URL}${en ? '/en' : ''}/blog/${a.slug}/`,
      headline: en ? a.h1_en || a.h1 : a.h1,
      datePublished: a.datePublished,
    })),
  };
}

/** JSON-LD статьи: BlogPosting (автор — команда MyPins) + BreadcrumbList.
 * lang='en' (для /en/blog/<slug>) — headline/description из *_en полей,
 * inLanguage 'en', Breadcrumb Home > Blog. */
function articleJsonLd(article, url, lang = 'ru') {
  const en = lang === 'en';
  const blogUrl = `${SITE_URL}${en ? '/en' : ''}/blog/`;
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BlogPosting',
        headline: en ? article.h1_en || article.h1 : article.h1,
        description: en ? article.description_en || article.description : article.description,
        datePublished: article.datePublished,
        dateModified: article.dateModified,
        inLanguage: en ? 'en' : article.lang || 'ru',
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
          { '@type': 'ListItem', position: 1, name: en ? 'Home' : 'Главная', item: `${SITE_URL}${en ? '/en' : ''}/` },
          { '@type': 'ListItem', position: 2, name: en ? 'Blog' : 'Блог', item: blogUrl },
          { '@type': 'ListItem', position: 3, name: en ? article.h1_en || article.h1 : article.h1, item: url },
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

const EN_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** «2026-09-05» → «5 сентября 2026» (без часовых поясов) */
function ruDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  if (!m) return iso;
  const [, y, mo, d] = m;
  const month = RU_MONTHS[Number(mo) - 1];
  return month ? `${Number(d)} ${month} ${y}` : iso;
}

/** «2026-09-05» → «September 5, 2026» (EN, без часовых поясов) */
function enDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  if (!m) return iso;
  const [, y, mo, d] = m;
  const month = EN_MONTHS[Number(mo) - 1];
  return month ? `${month} ${Number(d)}, ${y}` : iso;
}

/** Дата+время на языке страницы: «5 сентября 2026, 17:00» / «September 5, 2026, 5:00 PM» */
function localizedDateTime(iso, time, lang) {
  const date = lang === 'en' ? enDate(iso) : ruDate(iso);
  if (!time) return date;
  if (lang !== 'en') return `${date}, ${time}`;
  // 24-часовое время из БД → 12-часовое для EN (как в SPA en.ts)
  const m = /^(\d{1,2}):(\d{2})/.exec(time);
  if (!m) return `${date}, ${time}`;
  let h = Number(m[1]);
  const min = m[2];
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${date}, ${h}:${min} ${ap}`;
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
 * Распознавание города события по ev.city → русское имя и путь городской
 * страницы для хлебной крошки. Регистронезависимо, поиск подстроки в
 * lowercase-строке. Районы Бали (Убуд, Чангу, Семиньяк, Кута, Денпасар,
 * Гианьяр) и «Bali»/«бали» → Бали. Не распознано → null (крошка из 2 звеньев).
 */
function cityCrumb(rawCity) {
  const city = String(rawCity ?? '').toLowerCase();
  if (!city) return null;
  if (city.includes('нячанг') || city.includes('nha trang')) {
    return { name: 'Нячанг', path: 'nha-trang' };
  }
  if (city.includes('дананг') || city.includes('da nang') || city.includes('danang')) {
    return { name: 'Дананг', path: 'da-nang' };
  }
  const baliKeys = [
    'бали', 'bali', 'ubud', 'убуд', 'canggu', 'чангу',
    'seminyak', 'семиньяк', 'kuta', 'кута', 'denpasar', 'gianyar',
  ];
  if (baliKeys.some((k) => city.includes(k))) {
    return { name: 'Бали', path: 'bali' };
  }
  return null;
}

/** EN-имя города для EN-версий (крошка, title/description событий): ключ =
 * path городской страницы cityCrumb, значение — как labelEn в config. */
const CITY_NAME_EN = {
  bali: 'Bali',
  'da-nang': 'Da Nang',
  'nha-trang': 'Nha Trang',
};

/**
 * JSON-LD Event для страницы события: @graph из Event (поля как раньше) и
 * BreadcrumbList (Главная > город, если распознан > название события как в
 * h1 статического блока). Данные — из ответа list_active_events
 * (как ev на сайте): название/описание на языке оригинала, координаты,
 * адрес/город, первое фото, цена. url — канонический URL события (со слэшем).
 * lang='en' (для /en/event/...): name = title_en||title, описание =
 * description_en||description, Breadcrumb Home > <City EN> > title_en.
 */
function eventJsonLd(ev, url, lang = 'ru') {
  const en = lang === 'en';
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
  const langField = Array.isArray(ev.languages) && ev.languages[0]
    ? ev.languages[0]
    : ev.language || ev.source_lang || '';
  // Текст и имя версии страницы (как eventSeoHtml/localizedText)
  const name = en
    ? ev.title_en || ev.title || ''
    : ev.title_ru || ev.title || ev.title_en || '';
  const text = en
    ? ev.description_en || ev.description || ev.description_ru || ''
    : ev.description_ru || ev.description || ev.description_en || '';
  const orgName =
    typeof ev.org_display_name === 'string' ? ev.org_display_name.trim() : '';
  const photo = Array.isArray(ev.photos) ? absPhoto(ev.photos[0]) : '';

  // startDate повторяющихся событий — ближайшее БУДУЩЕЕ вхождение на дату
  // сборки (иначе в JSON-LD уходит первое вхождение серии, часто в прошлом,
  // и Google не показывает rich-результат). Разовые — как раньше (start_date).
  const sd = nextOccurrenceDate(ev, TODAY_ISO);

  const doc = {
    '@type': 'Event',
    name,
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
  if (text) doc.description = cleanText(text);
  if (photo) doc.image = photo;
  if (orgName) doc.organizer = { '@type': 'Organization', name: orgName };
  // inLanguage = язык СТРАНИЦЫ, а не источника события: EN-версия
  // (/en/event/*, name/description уже EN) всегда 'en', даже если оригинал
  // события RU. RU-страницы — как раньше (languages[0] || language ||
  // source_lang).
  if (en) doc.inLanguage = 'en';
  else if (langField) doc.inLanguage = langField;

  // Хлебная крошка: Главная/Home > город (если распознан по ev.city) >
  // название события как в h1 статического блока. @graph — как у статей
  // (articleJsonLd), чтобы ld+json остался одним блоком на странице.
  const homeName = en ? 'Home' : 'Главная';
  const items = [
    { '@type': 'ListItem', position: 1, name: homeName, item: `${SITE_URL}${en ? '/en' : ''}/` },
  ];
  const crumb = cityCrumb(ev.city);
  if (crumb) {
    // EN-имя города для крошки: Bali/Da Nang/Nha Trang (CITY_NAME_EN)
    const cityNameEn = CITY_NAME_EN[crumb.path] || crumb.name;
    items.push({
      '@type': 'ListItem',
      position: 2,
      name: en ? cityNameEn : crumb.name,
      item: `${SITE_URL}${en ? '/en' : ''}/${crumb.path}/`,
    });
  }
  items.push({
    '@type': 'ListItem',
    position: items.length + 1,
    name,
    item: url,
  });
  return {
    '@context': 'https://schema.org',
    '@graph': [
      doc,
      { '@type': 'BreadcrumbList', itemListElement: items },
    ],
  };
}

/**
 * Копия dist/index.html для URL-пути: заменить <title>, meta description и
 * canonical; базовые og:/twitter:-метки главной вычистить и пересобрать
 * Open Graph для этой страницы (у события/города свои og:title/og:url/
 * og:image); JSON-LD страницы (meta.jsonLd) добавить отдельным скриптом —
 * базовый @graph WebSite/Organization из index.html остаётся на всех
 * страницах. Если meta.bodySeo задан (городские страницы) — вставить
 * видимый SEO-текст в <body> рядом с #root.
 *
 * Локализация (EN-версии /en/*): meta.lang ('ru'|'en') — заменяет
 * <html lang="ru"> на язык страницы и добавляет og:locale
 * (ru_RU|en_US); meta.hreflang — массив {hreflang, href} парных страниц:
 * <link rel="alternate" hreflang=... /> вставляется в head. Без hreflang
 * старые hreflang-теги вычищаются (страница без пары). meta.canonical/
 * ogUrl уже должны указывать на версию языка (SITE_URL + /en для EN).
 */
function renderPage(baseHtml, meta) {
  const lang = meta.lang === 'en' ? 'en' : 'ru';
  const locale = lang === 'en' ? 'en_US' : 'ru_RU';
  let out = baseHtml
    .replace(/<title>[\s\S]*?<\/title>/i, () => `<title>${esc(meta.title)}</title>`)
    .replace(/<html\s+lang=["'][^"']*["']/i, `<html lang="${lang}"`);
  out = out.replace(/<meta\s+name=["']description["'][^>]*>/gi, '');
  out = out.replace(/<link\s+rel=["']canonical["'][^>]*\/?>/gi, '');
  out = out.replace(/<link\s+rel=["']alternate["'][^>]*\/?>/gi, '');
  out = out.replace(/<meta\s+(?:property|name)=["'](?:og|twitter):[^"']*["'][^>]*>/gi, '');
  const lines = [
    `    <meta name="description" content="${esc(meta.description)}" />`,
    `    <link rel="canonical" href="${esc(meta.canonical)}" />`,
    `    <meta property="og:site_name" content="MyPins" />`,
    `    <meta property="og:locale" content="${locale}" />`,
    `    <meta property="og:type" content="website" />`,
    `    <meta property="og:title" content="${esc(meta.ogTitle)}" />`,
    `    <meta property="og:description" content="${esc(meta.ogDescription)}" />`,
    `    <meta property="og:url" content="${esc(meta.ogUrl)}" />`,
    `    <meta property="og:image" content="${esc(meta.ogImage)}" />`,
    `    <meta name="twitter:card" content="summary_large_image" />`,
  ];
  // Парные страницы: <link rel="alternate" hreflang="ru|en|..."> (взаимные
  // ссылки на версии языка) — перед canonical-тегом, как рекомендует Google.
  for (const h of meta.hreflang ?? []) {
    lines.push(
      `    <link rel="alternate" hreflang="${esc(String(h.hreflang))}" href="${esc(h.href)}" />`,
    );
  }
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
 * видимый h1 + интро + блок ближайших событий (до MAX_CITY_EVENTS,
 * дата ближайшего вхождения + RU-название ссылкой /event/<id>/<slug>/ +
 * цена; сортировка по дате) + FAQ. Виден краулеру без JS; при живом React
 * SPA удаляет его (main.tsx) и рисует свой локализованный блок. Контент
 * вопросов-ответов остаётся в DOM (details). evs — уже отфильтрованные и
 * отсортированные события города; пусто → секции событий нет. */
function citySeoHtml(seo, evs) {
  const faq = seo.faq
    .map(
      (f) =>
        `    <details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`,
    )
    .join('\n');
  const lines = [
    '<div id="seo-city-block">',
    `  <h1>${esc(seo.h1)}</h1>`,
    `  <p>${esc(seo.intro)}</p>`,
    // Свежесть афиши (E-E-A-T): видимая дата обновления на дату сборки.
    // Только статика — живое SPA приложение обновляется само.
    `  <p class="seo-updated">Афиша обновлена: <time datetime="${TODAY_ISO}">${ruDate(TODAY_ISO)}</time></p>`,
  ];
  if (Array.isArray(evs) && evs.length) {
    // «События на Бали» → «Ближайшие события на Бали», «События в Дананге»
    // → «Ближайшие события в Дананге» (падежная часть h1 переиспользуется)
    const where = seo.h1.replace(/^События\s+/, '');
    lines.push(`  <h2>Ближайшие события ${esc(where)}</h2>`, '  <ul>');
    for (const ev of evs) {
      const sd = nextOccurrenceDate(ev, TODAY_ISO);
      const url = `${SITE_URL}/event/${ev.id}/${slugify(ev.title)}/`;
      // RU-название: как в h1 статического блока события (eventSeoHtml)
      const name = ev.title_ru || ev.title || ev.title_en || '';
      // Цена — те же правила, что в eventSeoHtml (764-772)
      const price = ev.price != null ? Number(ev.price) : null;
      const currency = (
        typeof ev.currency === 'string' && ev.currency ? ev.currency : 'usd'
      ).toUpperCase();
      let priceText = '';
      if (price != null && price > 0) {
        priceText = `${price} ${currency}`;
      } else if (Boolean(ev.donation)) {
        priceText = 'Донат';
      } else if (price === 0) {
        priceText = 'Бесплатно';
      }
      const parts = [];
      if (sd) parts.push(`<time datetime="${esc(sd)}">${esc(ruDate(sd))}</time>`);
      if (name) parts.push(`<a href="${esc(url)}">${esc(name)}</a>`);
      if (priceText) parts.push(`<span>${esc(priceText)}</span>`);
      lines.push(`    <li>${parts.join(' — ')}</li>`);
    }
    lines.push('  </ul>');
  }
  lines.push('  <h2>Частые вопросы</h2>', faq, '</div>', '');
  return lines.join('\n');
}

/** Статический SEO-блок главной (id=seo-home-block, RU) для вставки в
 * <body> рядом с #root: видимый h1 + абзацы (~120–160 слов; прямой ответ —
 * «MyPins — это карта событий…» — в первых 40–60 словах) + ссылки на
 * городские страницы и блог. Виден краулеру без JS; при живом React SPA
 * удаляет его (main.tsx) и рисует свою главную (у неё свой h1 — бренд).
 * Формулировки — предложение SEO-плана (п.4.1.2); владелец может править
 * текст без изменения структуры (h1 / прямой ответ в начале / ссылки). */
function homeSeoHtml() {
  const link = (path, label) => `<a href="${SITE_URL}/${path}/">${esc(label)}</a>`;
  return [
    '<div id="seo-home-block">',
    '  <h1>События на карте: Бали, Дананг и Нячанг</h1>',
    '  <p>MyPins — это карта событий для туристов и экспатов в Юго-Восточной Азии: концерты, вечеринки, йога, маркеты и speaking-клубы, которые публикуют сами организаторы.</p>',
    '  <p>Каждое событие показано на карте с датой, местом и ценой — от бесплатных встреч и донат-вечеринок до крупных концертов. Фильтры по категории, дате и цене и поиск по городу помогут найти занятие на сегодня или на выходные, а приближение карты покажет события в нужном районе: Чангу, Убуде или Семиньяке на Бали, в центре Дананга или на набережной Нячанга.</p>',
    '  <p>Афиша живая: организаторы публикуют события сами, а карта обновляется каждый день, поэтому здесь всегда есть что посмотреть сегодня или на выходных.</p>',
    `  <p>Смотреть события: ${link('bali', 'на Бали')}, ${link('da-nang', 'в Дананге')}, ${link('nha-trang', 'в Нячанге')}. Подборки и гиды по событиям — ${link('blog', 'в блоге MyPins')}.</p>`,
    '</div>',
    '',
  ].join('\n');
}

/** EN-версия статического SEO-блока главной для /en/ (id=seo-home-block):
 * тот же смысл и прямые ответы, что в RU homeSeoHtml (п. 1.1 промпта R):
 * h1 «Events on the Map: Bali, Da Nang, Nha Trang», 4 абзаца + ссылки на
 * EN-версии /en/bali/ /en/da-nang/ /en/nha-trang/ /en/blog/. */
function homeSeoHtmlEn() {
  const link = (path, label) => `<a href="${SITE_URL}/en/${path}/">${esc(label)}</a>`;
  return [
    '<div id="seo-home-block">',
    '  <h1>Events on the Map: Bali, Da Nang, Nha Trang</h1>',
    '  <p>MyPins is an events map for travellers and expats in Southeast Asia: concerts, parties, yoga, markets and speaking clubs, published by the organizers themselves.</p>',
    '  <p>Every event is shown on the map with its date, venue and price — from free meetups and donation parties to big concerts. Filters by category, date and price plus a city search help you find something for today or for the weekend, and zooming the map shows events in the area you need: Canggu, Ubud or Seminyak in Bali, central Da Nang or the Nha Trang promenade.</p>',
    '  <p>The listings are live: organizers publish events themselves and the map updates every day, so there is always something to check out today or on the weekend.</p>',
    `  <p>Browse events ${link('bali', 'in Bali')}, ${link('da-nang', 'in Da Nang')}, ${link('nha-trang', 'in Nha Trang')}. Guides and event round-ups — ${link('blog', 'on the MyPins blog')}.</p>`,
    '</div>',
    '',
  ].join('\n');
}

/**
 * EN-версия статического SEO-блока города для /en/<city>/ (тот же id,
 * что у RU — SPA удаляет оба): h1/intro/FAQ EN (CITY_SEO_EN — синхронно
 * с en.ts:574-633), строка «Updated: …» (аналог «Афиша обновлена»), блок
 * ближайших событий — только события с EN-версией (title_en непуст ИЛИ
 * source_lang='en'): имя = title_en||title, ссылка на ЖИВУЮ EN-страницу
 * события /en/event/<id>/<slugify(title_en||title)>/ (п. 2.3: страницы
 * сгенерированы пре-рендером — битых ссылок нет).
 */
function citySeoHtmlEn(seo, evs) {
  const faq = seo.faq
    .map(
      (f) =>
        `    <details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`,
    )
    .join('\n');
  const lines = [
    '<div id="seo-city-block">',
    `  <h1>${esc(seo.h1)}</h1>`,
    `  <p>${esc(seo.intro)}</p>`,
    `  <p class="seo-updated">Updated: <time datetime="${TODAY_ISO}">${enDate(TODAY_ISO)}</time></p>`,
  ];
  if (Array.isArray(evs) && evs.length) {
    // «Events in Bali» → «Upcoming events in Bali» (суффикс h1 переиспользуется)
    const where = seo.h1.replace(/^Events in\s+/, '');
    lines.push(`  <h2>Upcoming events in ${esc(where)}</h2>`, '  <ul>');
    for (const ev of evs) {
      const sd = nextOccurrenceDate(ev, TODAY_ISO);
      // EN-версия события (Фаза 2: страница /en/event/<id>/<slugify(title_en||title)>/
      // сгенерирована пре-рендером — ссылка живая)
      const url = `${SITE_URL}/en/event/${ev.id}/${slugify(ev.title_en || ev.title)}/`;
      const name = ev.title_en || ev.title || '';
      const price = ev.price != null ? Number(ev.price) : null;
      const currency = (
        typeof ev.currency === 'string' && ev.currency ? ev.currency : 'usd'
      ).toUpperCase();
      let priceText = '';
      if (price != null && price > 0) {
        priceText = `${price} ${currency}`;
      } else if (Boolean(ev.donation)) {
        priceText = 'Donation';
      } else if (price === 0) {
        priceText = 'Free';
      }
      const parts = [];
      if (sd) parts.push(`<time datetime="${esc(sd)}">${esc(enDate(sd))}</time>`);
      if (name) parts.push(`<a href="${esc(url)}">${esc(name)}</a>`);
      if (priceText) parts.push(`<span>${esc(priceText)}</span>`);
      lines.push(`    <li>${parts.join(' — ')}</li>`);
    }
    lines.push('  </ul>');
  }
  lines.push('  <h2>FAQ</h2>', faq, '</div>', '');
  return lines.join('\n');
}

/** JSON-LD FAQPage городской страницы: те же вопросы и ответы, что в
 * видимом блоке <details><summary> (citySeoHtml). Отдельный ld+json-скрипт —
 * базовый @graph WebSite/Organization из index.html остаётся первым. */
function faqPageJsonLd(faq) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faq.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };
}

/**
 * Статический SEO-блок события для вставки в <body> рядом с #root: ровно
 * один h1 = название события (локализованное для RU — title_ru, иначе title,
 * иначе title_en; для EN — title_en, иначе title — как localizedText в
 * src/lib/translate.ts) и под ним — дата/время, место, цена, описание и
 * строка «Организатор:»/«Organizer:» со ссылкой на профиль (по заполненности
 * полей; без фото). Дата — ближайшее БУДУЩЕЕ вхождение повторяющегося
 * события, как в eventJsonLd (nextOccurrenceDate). Блок виден краулеру без
 * JS; при живом React SPA удаляет его (main.tsx) и рисует карточку события
 * сама — на странице остаётся ровно один h1.
 * lang='en' (для /en/event/...): EN-имя/описание, EN-даты (12-часовое время),
 * «Free»/«Donation», «Organizer:», ссылка на RU-профиль /org/<id>/.
 */
function eventSeoHtml(ev, url, lang = 'ru') {
  const en = lang === 'en';
  const name = en
    ? ev.title_en || ev.title || ''
    : ev.title_ru || ev.title || ev.title_en || '';
  const sd = nextOccurrenceDate(ev, TODAY_ISO);
  const time = typeof ev.start_time === 'string' ? ev.start_time.trim() : '';
  const city = typeof ev.city === 'string' ? ev.city.trim() : '';
  const address = typeof ev.address === 'string' ? ev.address.trim() : '';
  const price = ev.price != null ? Number(ev.price) : null;
  const currency = (
    typeof ev.currency === 'string' && ev.currency ? ev.currency : 'usd'
  ).toUpperCase();
  const donation = Boolean(ev.donation);
  const text = en
    ? ev.description_en || ev.description || ev.description_ru || ''
    : ev.description_ru || ev.description || ev.description_en || '';
  const orgName =
    typeof ev.org_display_name === 'string' ? ev.org_display_name.trim() : '';
  const ownerId = typeof ev.owner_id === 'string' ? ev.owner_id.trim() : '';

  const lines = ['<div id="seo-event-block">'];
  if (name) lines.push(`  <h1>${esc(name)}</h1>`);
  if (sd) {
    const dateText = time ? localizedDateTime(sd, time, lang) : (en ? enDate(sd) : ruDate(sd));
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
  // «Донат»/«Donation»; 0 — «Бесплатно»/«Free»; не указана (null) — строку не
  // выводим (в SPA «Цену уточняйте у организатора» — см. card.priceUnknown)
  let priceText = '';
  if (price != null && price > 0) {
    priceText = `${price} ${currency}`;
  } else if (donation) {
    priceText = en ? 'Donation' : 'Донат';
  } else if (price === 0) {
    priceText = en ? 'Free' : 'Бесплатно';
  }
  if (priceText) lines.push(`  <p>${esc(priceText)}</p>`);
  if (text) lines.push(`  <p>${esc(text)}</p>`);
  if (orgName && ownerId) {
    const orgUrl = `${SITE_URL}/org/${encodeURIComponent(ownerId)}/`;
    lines.push(
      `  <p>${en ? 'Organizer:' : 'Организатор:'} <a href="${esc(orgUrl)}">${esc(orgName)}</a></p>`,
    );
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
  // В блоке — ближайшие события города (до MAX_CITY_EVENTS): город события
  // распознаётся cityCrumb(ev.city) (тот же путь, что у городской страницы,
  // не распознано → событие в блоки не попадает), сортировка по дате
  // ближайшего вхождения (nextOccurrenceDate, как в JSON-LD).
  // Парные страницы (RU↔EN) получают hreflang-блок (п. 1.1 промпта R):
  // RU-версия → <link hreflang="en" href="/en/<path>/"> + x-default /en/.
  const enRoot = `${SITE_URL}/en/`;
  // Пары для sitemap-xhtml: ruUrl -> enUrl (заполняются по ходу)
  const hreflangPairs = new Map();
  for (const c of CITY_PAGES) {
    const url = `${SITE_URL}/${c.path}/`;
    const enUrl = `${SITE_URL}/en/${c.path}/`;
    const seo = CITY_SEO[c.path];
    const cityEvs = events
      .filter(
        (ev) =>
          ev &&
          typeof ev.id === 'string' &&
          typeof ev.title === 'string' &&
          ev.title &&
          cityCrumb(ev.city)?.path === c.path,
      )
      .sort((a, b) =>
        String(nextOccurrenceDate(a, TODAY_ISO)).localeCompare(
          String(nextOccurrenceDate(b, TODAY_ISO)),
        ),
      )
      .slice(0, MAX_CITY_EVENTS);
    // FAQPage (отдельным ld+json-скриптом) — только если у города есть faq
    const faqLd = seo?.faq?.length ? faqPageJsonLd(seo.faq) : null;
    writePage(baseHtml, c.path, {
      lang: 'ru',
      title: c.title,
      description: c.description,
      canonical: url,
      ogTitle: c.title,
      ogDescription: c.description,
      ogUrl: url,
      ogImage: LOGO_URL,
      jsonLd: faqLd,
      hreflang: [
        { hreflang: 'en', href: enUrl },
        { hreflang: 'x-default', href: enRoot },
      ],
      bodySeo: seo ? citySeoHtml(seo, cityEvs) : null,
    });
    locs.push(url);
    hreflangPairs.set(url, enUrl);
    console.log(`  /${c.path}/index.html (событий в блоке: ${cityEvs.length})`);
  }

  // EN-версии городов: /en/<path>/ — lang="en", EN-тексты (CITY_SEO_EN
  // синхронно с en.ts:574-633), EN-блок ближайших событий (только события
  // с EN-версией: title_en непуст ИЛИ source_lang='en'; ссылки в Фазе 1 —
  // на живые RU-страницы события, см. citySeoHtmlEn). hreflang: ru → RU-версия.
  for (const c of CITY_PAGES_EN) {
    const url = `${SITE_URL}/en/${c.path}/`;
    const ruUrl = `${SITE_URL}/${c.path}/`;
    const seo = CITY_SEO_EN[c.path];
    const cityEvs = events
      .filter(
        (ev) =>
          ev &&
          typeof ev.id === 'string' &&
          typeof ev.title === 'string' &&
          ev.title &&
          cityCrumb(ev.city)?.path === c.path &&
          ((typeof ev.title_en === 'string' && ev.title_en) || ev.source_lang === 'en'),
      )
      .sort((a, b) =>
        String(nextOccurrenceDate(a, TODAY_ISO)).localeCompare(
          String(nextOccurrenceDate(b, TODAY_ISO)),
        ),
      )
      .slice(0, MAX_CITY_EVENTS);
    const faqLd = seo?.faq?.length ? faqPageJsonLd(seo.faq) : null;
    writePage(baseHtml, `en/${c.path}`, {
      lang: 'en',
      title: c.title,
      description: c.description,
      canonical: url,
      ogTitle: c.title,
      ogDescription: c.description,
      ogUrl: url,
      ogImage: LOGO_URL,
      jsonLd: faqLd,
      hreflang: [
        { hreflang: 'ru', href: ruUrl },
        { hreflang: 'x-default', href: enRoot },
      ],
      bodySeo: seo ? citySeoHtmlEn(seo, cityEvs) : null,
    });
    locs.push(url);
    console.log(`  /en/${c.path}/index.html (EN-событий в блоке: ${cityEvs.length})`);
  }

  // События: URL должен совпадать с тем, что строит SPA, —
  // /event/<id>/<slugify(title)> (src/pages/Home.tsx replaceState).
  // События с EN-версией (title_en непуст ИЛИ source_lang='en') получают
  // пару /en/event/<id>/<slugify(title_en||title)>/ (п. 2.3): RU-страница —
  // hreflang на EN, EN-страница — свой h1/описание/JSON-LD и hreflang на RU.
  const pageEvents = [];
  let pageEnEvents = 0;
  for (const ev of events) {
    if (!ev || typeof ev.id !== 'string' || typeof ev.title !== 'string') continue;
    const hasEn = Boolean(ev.title_en) || ev.source_lang === 'en';
    const path = `event/${ev.id}/${slugify(ev.title)}`;
    const url = `${SITE_URL}/${path}/`;
    const enPath = `en/event/${ev.id}/${slugify(hasEn ? ev.title_en || ev.title : ev.title)}`;
    const enUrl = `${SITE_URL}/${enPath}/`;
    const title = snippet(`${ev.title} · ${ev.city ?? ''}`.trim(), 65) || 'Событие';
    const city = typeof ev.city === 'string' ? ev.city.trim() : '';
    // Текст, который видит русскоязычный посетитель (html lang="ru"),
    // как localizedText(description, description_ru, …): перевод или оригинал
    const ruText = ev.description_ru || ev.description || ev.description_en || '';
    const date = ruDate(ev.start_date);
    const prefix = [city, date].filter(Boolean).join(', ');
    const description = snippet(prefix ? `${prefix}. ${ruText}` : ruText, 160);
    const photo = Array.isArray(ev.photos) ? absPhoto(ev.photos[0]) : '';
    const hreflangRu = hasEn
      ? [
          { hreflang: 'en', href: enUrl },
          { hreflang: 'x-default', href: enRoot },
        ]
      : undefined;
    writePage(baseHtml, path, {
      title,
      description,
      canonical: url,
      ogTitle: title,
      ogDescription: description,
      ogUrl: url,
      ogImage: photo || LOGO_URL,
      jsonLd: eventJsonLd(ev, url),
      ...(hasEn ? { hreflang: hreflangRu } : {}),
      bodySeo: eventSeoHtml(ev, url),
    });
    locs.push(url);
    pageEvents.push(path);
    // EN-версия события — только если у события есть перевод/англ. оригинал
    if (hasEn) {
      const nameEn = ev.title_en || ev.title || '';
      // EN-имя города той же логикой, что в крошке (crumb выше): распознан —
      // CITY_NAME_EN (Нячанг→Nha Trang, Дананг→Da Nang, Бали/районы→Bali),
      // не распознан — суффикса города нет (prefixEn = только дата)
      const crumb = cityCrumb(ev.city);
      const cityEn = crumb ? CITY_NAME_EN[crumb.path] || crumb.name : '';
      const enText = ev.description_en || ev.description || ev.description_ru || '';
      const dateEn = enDate(ev.start_date);
      const prefixEn = [cityEn, dateEn].filter(Boolean).join(', ');
      const descriptionEn = snippet(prefixEn ? `${prefixEn}. ${enText}` : enText, 160);
      const titleEn = snippet(cityEn ? `${nameEn} · ${cityEn}` : nameEn, 65) || 'Event';
      writePage(baseHtml, enPath, {
        lang: 'en',
        title: titleEn,
        description: descriptionEn,
        canonical: enUrl,
        ogTitle: titleEn,
        ogDescription: descriptionEn,
        ogUrl: enUrl,
        ogImage: photo || LOGO_URL,
        jsonLd: eventJsonLd(ev, enUrl, 'en'),
        hreflang: [
          { hreflang: 'ru', href: url },
          { hreflang: 'x-default', href: enRoot },
        ],
        bodySeo: eventSeoHtml(ev, enUrl, 'en'),
      });
      locs.push(enUrl);
      hreflangPairs.set(url, enUrl);
      pageEnEvents += 1;
    }
  }
  console.log(
    `  событий: ${pageEvents.length}, EN-событий: ${pageEnEvents}, страниц всего: ${locs.length}`,
  );

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
        '@graph': [
          {
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
          {
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: 'Главная', item: `${SITE_URL}/` },
              { '@type': 'ListItem', position: 2, name, item: url },
            ],
          },
        ],
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
  const enBlogUrl = `${SITE_URL}/en/blog/`;
  const blogLastmod = [...blogArticles]
    .map((a) => a.datePublished)
    .filter(Boolean)
    .sort()
    .at(-1);
  // Индекс блога RU (hreflang-пара на /en/blog/) + EN (контент из *_en полей)
  writePage(baseHtml, 'blog', {
    title: BLOG_META.title,
    description: BLOG_META.description,
    canonical: blogUrl,
    ogTitle: BLOG_META.title,
    ogDescription: BLOG_META.description,
    ogUrl: blogUrl,
    ogImage: LOGO_URL,
    jsonLd: blogIndexJsonLd(blogArticles),
    hreflang: [
      { hreflang: 'en', href: enBlogUrl },
      { hreflang: 'x-default', href: enRoot },
    ],
    bodySeo: blogIndexSeoHtml(blogArticles),
  });
  locs.push(blogUrl);
  hreflangPairs.set(blogUrl, enBlogUrl);
  if (blogLastmod) lastmods.set(blogUrl, blogLastmod);
  console.log('  /blog/index.html');
  writePage(baseHtml, 'en/blog', {
    lang: 'en',
    title: 'MyPins Blog: event guides for Bali, Da Nang and Nha Trang | MyPins',
    description:
      'Guides to the event scenes of Nha Trang, Bali and Da Nang: where to go, what to see and how much events cost. Round-ups by the MyPins team.',
    canonical: enBlogUrl,
    ogTitle: 'MyPins Blog: event guides for Bali, Da Nang and Nha Trang | MyPins',
    ogDescription:
      'Guides to the event scenes of Nha Trang, Bali and Da Nang: where to go, what to see and how much events cost. Round-ups by the MyPins team.',
    ogUrl: enBlogUrl,
    ogImage: LOGO_URL,
    jsonLd: blogIndexJsonLd(blogArticles, 'en'),
    hreflang: [
      { hreflang: 'ru', href: blogUrl },
      { hreflang: 'x-default', href: enRoot },
    ],
    bodySeo: blogIndexSeoHtml(blogArticles, 'en'),
  });
  locs.push(enBlogUrl);
  if (blogLastmod) lastmods.set(enBlogUrl, blogLastmod);
  console.log('  /en/blog/index.html');
  for (const a of blogArticles) {
    if (!a || typeof a.slug !== 'string' || !a.slug) continue;
    const url = `${SITE_URL}/blog/${a.slug}/`;
    const enUrl = `${SITE_URL}/en/blog/${a.slug}/`;
    writePage(baseHtml, `blog/${a.slug}`, {
      title: String(a.title ?? ''),
      description: String(a.description ?? ''),
      canonical: url,
      ogTitle: String(a.title ?? ''),
      ogDescription: String(a.description ?? ''),
      ogUrl: url,
      ogImage: LOGO_URL,
      jsonLd: articleJsonLd(a, url),
      hreflang: [
        { hreflang: 'en', href: enUrl },
        { hreflang: 'x-default', href: enRoot },
      ],
      bodySeo: articleSeoHtml(a),
    });
    locs.push(url);
    hreflangPairs.set(url, enUrl);
    // EN-версия статьи — только если есть *_en контент (иначе 404, SPA
    // покажет RU-статью с переводом UI — см. 1.3 промпта R)
    if (a.h1_en || a.sections_en) {
      const titleEn = a.title_en || a.title;
      const descEn = a.description_en || a.description;
      writePage(baseHtml, `en/blog/${a.slug}`, {
        lang: 'en',
        title: String(titleEn ?? ''),
        description: String(descEn ?? ''),
        canonical: enUrl,
        ogTitle: String(titleEn ?? ''),
        ogDescription: String(descEn ?? ''),
        ogUrl: enUrl,
        ogImage: LOGO_URL,
        jsonLd: articleJsonLd(a, enUrl, 'en'),
        hreflang: [
          { hreflang: 'ru', href: url },
          { hreflang: 'x-default', href: enRoot },
        ],
        bodySeo: articleSeoHtml(a, 'en'),
      });
      locs.push(enUrl);
      if (a.datePublished) lastmods.set(enUrl, a.datePublished);
      console.log(`  /en/blog/${a.slug}/index.html`);
    }
    if (a.datePublished) lastmods.set(url, a.datePublished);
    console.log(`  /blog/${a.slug}/index.html`);
  }
  console.log(`  статей: ${blogArticles.length}, страниц всего: ${locs.length}`);

  // B2B-страница «Для организаторов»: /for-organizers/ — контент из
  // src/content/forOrganizers.json (единый источник с SPA, тексты здесь не
  // дублируются). JSON-LD: AboutPage + BreadcrumbList + FAQPage.
  // EN-версия /en/for-organizers/ — из *_en полей (заголовки, intro_en,
  // sections_en, faq_en, final_en).
  const organizers = loadForOrganizers();
  const organizersUrl = `${SITE_URL}/for-organizers/`;
  const enOrganizersUrl = `${SITE_URL}/en/for-organizers/`;
  writePage(baseHtml, 'for-organizers', {
    title: String(organizers.title ?? ''),
    description: String(organizers.description ?? ''),
    canonical: organizersUrl,
    ogTitle: String(organizers.title ?? ''),
    ogDescription: String(organizers.description ?? ''),
    ogUrl: organizersUrl,
    ogImage: LOGO_URL,
    jsonLd: forOrganizersJsonLd(organizers, organizersUrl),
    hreflang: [
      { hreflang: 'en', href: enOrganizersUrl },
      { hreflang: 'x-default', href: enRoot },
    ],
    bodySeo: forOrganizersSeoHtml(organizers),
  });
  locs.push(organizersUrl);
  hreflangPairs.set(organizersUrl, enOrganizersUrl);
  lastmods.set(organizersUrl, TODAY_ISO);
  console.log('  /for-organizers/index.html');
  writePage(baseHtml, 'en/for-organizers', {
    lang: 'en',
    title: String((organizers.title_en || organizers.title) ?? ''),
    description: String((organizers.description_en || organizers.description) ?? ''),
    canonical: enOrganizersUrl,
    ogTitle: String((organizers.title_en || organizers.title) ?? ''),
    ogDescription: String((organizers.description_en || organizers.description) ?? ''),
    ogUrl: enOrganizersUrl,
    ogImage: LOGO_URL,
    jsonLd: forOrganizersJsonLd(organizers, enOrganizersUrl, 'en'),
    hreflang: [
      { hreflang: 'ru', href: organizersUrl },
      { hreflang: 'x-default', href: enRoot },
    ],
    bodySeo: forOrganizersSeoHtml(organizers, 'en'),
  });
  locs.push(enOrganizersUrl);
  lastmods.set(enOrganizersUrl, TODAY_ISO);
  console.log('  /en/for-organizers/index.html');

  // Страница «О проекте»: /about/ — контент из src/content/about.json (единый
  // источник с SPA, тексты здесь не дублируются). JSON-LD: AboutPage +
  // Organization (контакт редакции) + BreadcrumbList. EN — /en/about/ из *_en.
  const about = loadAbout();
  const aboutUrl = `${SITE_URL}/about/`;
  const enAboutUrl = `${SITE_URL}/en/about/`;
  writePage(baseHtml, 'about', {
    title: String(about.title ?? ''),
    description: String(about.description ?? ''),
    canonical: aboutUrl,
    ogTitle: String(about.title ?? ''),
    ogDescription: String(about.description ?? ''),
    ogUrl: aboutUrl,
    ogImage: LOGO_URL,
    jsonLd: aboutJsonLd(about, aboutUrl),
    hreflang: [
      { hreflang: 'en', href: enAboutUrl },
      { hreflang: 'x-default', href: enRoot },
    ],
    bodySeo: aboutSeoHtml(about),
  });
  locs.push(aboutUrl);
  hreflangPairs.set(aboutUrl, enAboutUrl);
  lastmods.set(aboutUrl, TODAY_ISO);
  console.log('  /about/index.html');
  writePage(baseHtml, 'en/about', {
    lang: 'en',
    title: String((about.title_en || about.title) ?? ''),
    description: String((about.description_en || about.description) ?? ''),
    canonical: enAboutUrl,
    ogTitle: String((about.title_en || about.title) ?? ''),
    ogDescription: String((about.description_en || about.description) ?? ''),
    ogUrl: enAboutUrl,
    ogImage: LOGO_URL,
    jsonLd: aboutJsonLd(about, enAboutUrl, 'en'),
    hreflang: [
      { hreflang: 'ru', href: aboutUrl },
      { hreflang: 'x-default', href: enRoot },
    ],
    bodySeo: aboutSeoHtml(about, 'en'),
  });
  locs.push(enAboutUrl);
  lastmods.set(enAboutUrl, TODAY_ISO);
  console.log('  /en/about/index.html');

  // Главная (RU / + EN /en/) регистрируется в sitemap ЗДЕСЬ (до его записи);
  // сами файлы пишутся в самом конце main() из baseHtml (см. ниже).
  hreflangPairs.set(`${SITE_URL}/`, enRoot);
  locs.push(enRoot);

  // sitemap.xml (перезапись). <lastmod> = дата сборки (TODAY_ISO) — сигнал
  // поисковикам, что контент страницы мог измениться; статьи блога несут
  // <lastmod> = datePublished (см. lastmods). У парных <url> (RU↔EN) — по два
  // <xhtml:link rel="alternate" hreflang="ru|en"> + x-default на главную /en/
  // (один urlset, xmlns:xhtml объявлен).
  const pairLinks = (u) => {
    const isEn = u.startsWith(`${SITE_URL}/en/`);
    // RU-версия: прямая пара из map; EN-версия: ищем RU по значению
    let ruUrl = hreflangPairs.get(u) ? u : null;
    if (isEn) {
      ruUrl = [...hreflangPairs.entries()].find(([, v]) => v === u)?.[0] ?? null;
    } else if (!hreflangPairs.has(u)) {
      return ''; // непарная страница (событие без перевода, org и т.п.)
    }
    if (!ruUrl) return '';
    const enUrl = isEn ? u : hreflangPairs.get(u);
    const selfRu = `    <xhtml:link rel="alternate" hreflang="ru" href="${esc(ruUrl)}" />\n`;
    const selfEn = `    <xhtml:link rel="alternate" hreflang="en" href="${esc(enUrl)}" />\n`;
    return `\n${selfRu}${selfEn}    <xhtml:link rel="alternate" hreflang="x-default" href="${esc(enRoot)}" />`;
  };
  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ...locs
      .slice()
      .sort((a, b) => a.localeCompare(b))
      .map(
        (u) =>
          `  <url><loc>${esc(u)}</loc><lastmod>${lastmods.get(u) ?? TODAY_ISO}</lastmod>${pairLinks(u)}\n  </url>`,
      ),
    '</urlset>',
    '',
  ].join('\n');
  writeFileSync(join(DIST, 'sitemap.xml'), xml);
  console.log(`  dist/sitemap.xml: ${locs.length} URL`);

  // Главная — в САМУЮ ПОСЛЕДНЮЮ очередь и из того же baseHtml (он не
  // менялся: renderPage возвращает новую строку, а dist/index.html
  // перезаписывается только здесь): в body добавляется статический видимый
  // блок #seo-home-block, в head — canonical https://mypins.site/
  // (в базовом index.html canonical не было). Остальные страницы уже
  // отрендерены, поэтому блок главной на них не попадает. Писать главную
  // раньше — значит отдать renderPage index.html с блоком на все страницы.
  // writePage не подходит: пустой path не создаст файл.
  const homeTitle = /<title>([\s\S]*?)<\/title>/i.exec(baseHtml)?.[1] ?? '';
  const homeDescription =
    /<meta\s+name=["']description["'][^>]*content=["']([^"']*)["']/i.exec(baseHtml)?.[1] ?? '';
  writeFileSync(
    join(DIST, 'index.html'),
    renderPage(baseHtml, {
      lang: 'ru',
      title: homeTitle,
      description: homeDescription,
      canonical: `${SITE_URL}/`,
      ogTitle: homeTitle,
      ogDescription: homeDescription,
      ogUrl: `${SITE_URL}/`,
      ogImage: LOGO_URL,
      hreflang: [
        { hreflang: 'en', href: enRoot },
        { hreflang: 'x-default', href: enRoot },
      ],
      bodySeo: homeSeoHtml(),
    }),
  );
  hreflangPairs.set(`${SITE_URL}/`, enRoot);
  console.log('  dist/index.html: seo-home-block (главная)');

  // EN-главная /en/: dist/en/index.html — из того же baseHtml, lang="en",
  // EN-title/description, canonical/og:url /en/, hreflang-пара на / + x-default
  // (на себя — x-default /en/ — как у всех EN-страниц), EN-блок #seo-home-block.
  const homeTitleEn = 'Events on the Map: Bali, Da Nang, Nha Trang | MyPins';
  const homeDescriptionEn =
    'MyPins is an events map for travellers and expats in Southeast Asia: concerts, parties, yoga, markets and speaking clubs in Bali, Da Nang and Nha Trang with dates, venues and prices.';
  writeFileSync(
    join(DIST, 'en/index.html'),
    renderPage(baseHtml, {
      lang: 'en',
      title: homeTitleEn,
      description: homeDescriptionEn,
      canonical: enRoot,
      ogTitle: homeTitleEn,
      ogDescription: homeDescriptionEn,
      ogUrl: enRoot,
      ogImage: LOGO_URL,
      hreflang: [
        { hreflang: 'ru', href: `${SITE_URL}/` },
        { hreflang: 'x-default', href: enRoot },
      ],
      bodySeo: homeSeoHtmlEn(),
    }),
  );
  console.log('  dist/en/index.html: seo-home-block EN (главная /en/)');
}

main().catch((e) => {
  console.error(`seo-prerender: критическая ошибка: ${e.message}`);
  process.exit(1);
});
