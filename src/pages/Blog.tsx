// Блог MyPins: /blog (BlogIndex) и /blog/<slug> (ArticlePage).
// Статьи — единый источник src/content/articles.json (его же читает
// пре-рендер scripts/seo-prerender.mjs — тексты не дублируются). Статьи
// публикуются на русском (lang ru) и имеют EN-версии (/en/blog/<slug>/:
// поля *_en в articles.json); интерфейсные подписи страниц — русские
// hardcoded-строки с EN-ветками по i18n.
// Мета-теги head ставит сама страница (как Home): при клиентском переходе
// App-эффект не перебивает — блог-маршруты исключены из applyGenericMeta.
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import Header from '../components/Header';
import MapCta from '../components/MapCta';
import { navigate } from '../lib/navigate';
import { getApi } from '../lib/api';
import { applyArticleMeta, applyBlogMeta, applyGenericMeta, enDate, ruDate } from '../lib/seo';
import { eventPageHref } from '../lib/slug';
import type { Article, ArticleSection, EventItem } from '../lib/types';
// Каст через unknown: resolveJsonModule выводит точный литеральный тип,
// прямой as Article[] несовместим (readonly-поля).
import articlesRaw from '../content/articles.json';

const articles = articlesRaw as unknown as Article[];

/** Заглушка 404 для неизвестного slug (вёрстка как NotFound в App.tsx) */
function ArticleNotFound() {
  const { i18n } = useTranslation();
  const en = i18n.language.startsWith('en');
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-white px-4 text-center">
      <div className="text-lg font-semibold text-gray-900">
        {en ? '404 — page not found' : '404 — страница не найдена'}
      </div>
      <button
        onClick={() => navigate(en ? '/en' : '/')}
        className="rounded-md bg-[#72D2CF] px-4 py-2 text-sm font-semibold text-black shadow hover:bg-[#61B2B0]"
      >
        {en ? 'Back to map' : 'На главную'}
      </button>
    </div>
  );
}

/** Карта переписанных ссылок статей: путь из статьи → куда вести (null — снять).
 *  Пишется пре-рендером (scripts/seo-prerender.mjs, fixArticleLinks) по
 *  фактическим файлам сборки, чтобы SPA не вела туда, чего нет в статике. */
type ArticleLinkMap = Record<string, string | null>;
let articleLinkMapPromise: Promise<ArticleLinkMap> | null = null;
function loadArticleLinkMap(): Promise<ArticleLinkMap> {
  if (articleLinkMapPromise) return articleLinkMapPromise;
  articleLinkMapPromise = (async () => {
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}data/article-link-map.json`, {
        cache: 'no-cache',
      });
      if (!res.ok) return {};
      const body: unknown = await res.json();
      const links = (body as { links?: unknown })?.links;
      return links && typeof links === 'object' ? (links as ArticleLinkMap) : {};
    } catch {
      return {};
    }
  })();
  return articleLinkMapPromise;
}

const MD_LINK_RE = /\[([^\]]+)\]\(([^)]+)\)/g;
/** То же, но для сканирования текста (matchAll клонирует regexp — lastIndex
 *  общего MD_LINK_RE не портится). */
const MD_LINK_SCAN_RE = /\[[^\]]+\]\(([^)]+)\)/g;
/** href внутренней ссылки на событие: /event/<uuid>/… (или /en/event/<uuid>/…) */
const EVENT_HREF_RE = /^(?:\/en)?\/event\/([0-9a-f-]{36})\//i;

/** id событий, на которые ссылаются секции статьи (в нижнем регистре) */
function eventIdsInSections(sections: ArticleSection[]): Set<string> {
  const ids = new Set<string>();
  for (const s of sections) {
    const texts = s.type === 'ul' ? s.items : [s.text];
    for (const t of texts) {
      for (const m of String(t).matchAll(MD_LINK_SCAN_RE)) {
        const id = EVENT_HREF_RE.exec(m[1])?.[1];
        if (id) ids.add(id.toLowerCase());
      }
    }
  }
  return ids;
}

/**
 * Рендер текста секции с markdown-ссылками: «[события на Бали](/bali)» →
 * <a href="/bali">. Внутренние относительные ссылки перехватывает
 * document-обработчик App.tsx (navigate, без перезагрузки); внешних ссылок
 * в статьях нет.
 *
 * eventsById: карта АКТИВНЫХ событий (api.listEvents — тот же набор
 * list_active_events, что у статики). Если она передана и id из ссылки
 * /event/<uuid>/… в ней отсутствует (событие архивное/удалено) — фраза
 * рендерится текстом без <a>: слой SPA не должен вести туда, куда не ведёт
 * статика. Адрес живого события переписывается под язык статьи тем же
 * правилом, что в scripts/seo-prerender.mjs (src/lib/slug.ts, eventPageHref):
 * RU → /event/…, EN с английской версией → /en/event/…, EN без неё —
 * исходный RU-адрес.
 * undefined (данные ещё не пришли или запрос упал) — прежнее поведение.
 */
function renderMd(
  text: string,
  eventsById?: Map<string, EventItem> | null,
  lang: 'ru' | 'en' = 'ru',
  linkMap?: ArticleLinkMap | null,
): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  let key = 0;
  MD_LINK_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = MD_LINK_RE.exec(text))) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const evId = eventsById ? (EVENT_HREF_RE.exec(m[2])?.[1]?.toLowerCase() ?? null) : null;
    if (eventsById && evId && !eventsById.has(evId)) {
      nodes.push(m[1]);
    } else {
      let href = m[2];
      const ev = evId ? eventsById?.get(evId) : null;
      if (ev) href = eventPageHref(ev, lang) ?? href;
      // Ссылка на путь, которого нет в текущей сборке: карта из пре-рендера
      // уводит её на живой адрес (городской хаб) или снимает ссылку целиком.
      let drop = false;
      if (linkMap && href.startsWith('/') && Object.prototype.hasOwnProperty.call(linkMap, href)) {
        const target = linkMap[href];
        if (target) href = target;
        else drop = true;
      }
      if (drop) {
        nodes.push(m[1]);
      } else {
        nodes.push(
          <a
            key={key++}
            href={href}
            className="font-medium text-[#E66343] underline decoration-[#E66343]/40 underline-offset-2 hover:decoration-[#E66343]"
          >
            {m[1]}
          </a>,
        );
      }
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

/** Секции статьи: абзацы/заголовки/списки (тексты дословно из articles.json) */
function Sections({
  sections,
  eventsById,
  lang,
  linkMap,
}: {
  sections: ArticleSection[];
  eventsById?: Map<string, EventItem> | null;
  lang?: 'ru' | 'en';
  linkMap?: ArticleLinkMap | null;
}) {
  return (
    <>
      {sections.map((s, i) => {
        if (s.type === 'h2') {
          return (
            <h2 key={i} className="mt-6 text-base font-semibold text-gray-900">
              {s.text}
            </h2>
          );
        }
        if (s.type === 'ul') {
          return (
            <ul key={i} className="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-gray-700">
              {s.items.map((item, j) => (
                <li key={j}>{renderMd(item, eventsById, lang, linkMap)}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i} className="mt-3 text-sm leading-relaxed text-gray-700">
            {renderMd(s.text, eventsById, lang, linkMap)}
          </p>
        );
      })}
    </>
  );
}

/** /blog — список статей (карточка: заголовок-ссылка, дата, description).
 * EN-версия /en/blog: заголовки и description из *_en полей (см. 1.3),
 * ссылки карточек на /en/blog/<slug>, подпись даты на английском. */
export function BlogIndex() {
  const { i18n } = useTranslation();
  const en = i18n.language.startsWith('en');
  useEffect(() => {
    applyBlogMeta();
    // Назад с закрытой статьи: /blog ставит свою мету заново
    return () => applyGenericMeta();
    // Мета зависит от URL (/en/blog), не от i18n-переключения
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Свежие сверху; при равных датах сохраняем порядок JSON (стабильная сортировка)
  const list = [...articles].sort((a, b) => b.datePublished.localeCompare(a.datePublished));
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <Header />
      <main className="mx-auto w-full max-w-2xl flex-1 p-4">
        <h1 className="text-xl font-semibold text-gray-900">
          {en ? 'MyPins Blog: guides to events' : 'Блог MyPins: гиды по событиям'}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          {en
            ? 'What to do in Nha Trang, Bali, Da Nang and Cyprus: guides to the local event scenes.'
            : 'Куда сходить в Нячанге, на Бали, в Дананге и на Кипре: подборки и гиды по событийной жизни городов.'}
        </p>
        {/* Путь на карту: посетитель пришёл из поиска на текстовую страницу */}
        <MapCta />
        {list.map((a) => {
          const h1 = en ? a.h1_en || a.h1 : a.h1;
          const desc = en ? a.description_en || a.description : a.description;
          return (
            <article
              key={a.slug}
              className="mt-6 border-t border-gray-100 pt-4 first:border-t-0 first:pt-0"
            >
              <h2 className="text-base font-semibold text-gray-900">
                <a
                  href={`${en ? '/en' : ''}/blog/${a.slug}/`}
                  className="text-[#E66343] decoration-[#E66343]/40 underline-offset-2 hover:underline"
                >
                  {h1}
                </a>
              </h2>
              <p className="mt-1 text-xs text-gray-400">
                {en ? enDate(a.datePublished) : ruDate(a.datePublished)}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-gray-700">{desc}</p>
            </article>
          );
        })}
      </main>
    </div>
  );
}

/** /blog/<slug> — страница статьи (h1 = h1 статьи, дата и секции).
 * EN-версия /en/blog/<slug>: *_en поля (1.3), подпись «MyPins Editorial ·
 * <a href=/en/about/>», ссылка «← Blog» на /en/blog. */
export function ArticlePage({ slug }: { slug: string }) {
  const { i18n } = useTranslation();
  const en = i18n.language.startsWith('en');
  const article = articles.find((a) => a.slug === slug);
  // Статья для показа: *_en поля при EN-интерфейсе (иначе RU-контент)
  const view = article
    ? {
        ...article,
        h1: en ? article.h1_en || article.h1 : article.h1,
        sections: en ? article.sections_en || article.sections : article.sections,
      }
    : null;
  // Гард от «мёртвых» ссылок на события: если в секциях есть /event/-ссылки,
  // один раз берём АКТИВНЫЕ события (api.listEvents — тот же набор
  // list_active_events, что у статики, кэш 30 с) и отдаём карту в renderMd:
  // ссылка на событие вне набора рендерится текстом, адрес живого события
  // переписывается под язык статьи. Пока данные не пришли или запрос упал —
  // eventsById=null, ссылки рендерятся как прежде (деградация без регрессий).
  const [eventsById, setEventsById] = useState<Map<string, EventItem> | null>(null);
  // Карта ссылок статьи из пре-рендера: путь, которого нет в сборке, ведёт на
  // городской хаб или снимается — ровно как в статике (паритет слоёв).
  const [linkMap, setLinkMap] = useState<ArticleLinkMap | null>(null);
  useEffect(() => {
    let alive = true;
    loadArticleLinkMap().then((map) => {
      if (alive) setLinkMap(map);
    });
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    const sections = article
      ? en
        ? article.sections_en || article.sections
        : article.sections
      : null;
    const refIds = sections ? eventIdsInSections(sections) : null;
    if (!refIds || refIds.size === 0) return;
    let alive = true;
    getApi()
      .listEvents()
      .then((events) => {
        if (alive) setEventsById(new Map(events.map((e) => [String(e.id).toLowerCase(), e])));
      })
      .catch(() => {
        // Список событий недоступен — оставляем ссылки как есть
      });
    return () => {
      alive = false;
    };
    // Статья неизменна (JSON), язык — единственная реальная зависимость
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [article, en]);
  useEffect(() => {
    if (article) {
      applyArticleMeta(article);
    } else {
      applyGenericMeta();
    }
    return () => applyGenericMeta();
  }, [article]);
  if (!article) return <ArticleNotFound />;
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <Header />
      <main className="mx-auto w-full max-w-2xl flex-1 p-4">
        <p className="text-sm">
          <a
            href={`${en ? '/en' : ''}/blog/`}
            className="font-medium text-[#E66343] decoration-[#E66343]/40 underline-offset-2 hover:underline"
          >
            {en ? '← Blog' : '← Блог'}
          </a>
        </p>
        <h1 className="mt-2 text-xl font-semibold text-gray-900">{view!.h1}</h1>
        <p className="mt-1 text-xs text-gray-400">
          {en ? enDate(article.datePublished) : ruDate(article.datePublished)}
        </p>
        {/* Карта — сразу под заголовком: посетитель из поиска видит путь к
            событиям на первом экране, не дочитывая статью */}
        <MapCta />
        <div className="mt-4">
          <Sections
            sections={view!.sections}
            eventsById={eventsById}
            lang={en ? 'en' : 'ru'}
            linkMap={linkMap}
          />
        </div>
        {/* Повтор кнопки в конце статьи: тот, кто дочитал, тоже уходит на карту */}
        <MapCta className="mt-6" />
        {/* Подпись редакции (E-E-A-T): авторство + ссылка на страницу /about.
            Как и datePublished — текст-xs; внутренний /about перехватывает
            document-обработчик App.tsx (navigate, без перезагрузки). EN —
            «MyPins Editorial · <a href=/en/about/>About the project</a>. */}
        <p className="mt-4 border-t border-gray-100 pt-3 text-xs text-gray-400">
          {en ? 'MyPins Editorial · ' : 'Редакция MyPins · '}
          <a
            href={en ? '/en/about/' : '/about/'}
            className="font-medium text-[#E66343] decoration-[#E66343]/40 underline-offset-2 hover:underline"
          >
            {en ? 'About the project' : 'О проекте и контакты'}
          </a>
        </p>
      </main>
    </div>
  );
}
