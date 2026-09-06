// Блог MyPins: /blog (BlogIndex) и /blog/<slug> (ArticlePage).
// Статьи — единый источник src/content/articles.json (его же читает
// пре-рендер scripts/seo-prerender.mjs — тексты не дублируются). Статьи
// публикуются на русском (lang ru); интерфейсные подписи страниц — также
// русские hardcoded-строки (блог RU-only, решение по EN — позже).
// Мета-теги head ставит сама страница (как Home): при клиентском переходе
// App-эффект не перебивает — блог-маршруты исключены из applyGenericMeta.
import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import Header from '../components/Header';
import { navigate } from '../lib/navigate';
import { applyArticleMeta, applyBlogMeta, applyGenericMeta, enDate, ruDate } from '../lib/seo';
import type { Article, ArticleSection } from '../lib/types';
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

const MD_LINK_RE = /\[([^\]]+)\]\(([^)]+)\)/g;

/**
 * Рендер текста секции с markdown-ссылками: «[события на Бали](/bali)» →
 * <a href="/bali">. Внутренние относительные ссылки перехватывает
 * document-обработчик App.tsx (navigate, без перезагрузки); внешних ссылок
 * в статьях нет.
 */
function renderMd(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  let key = 0;
  MD_LINK_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = MD_LINK_RE.exec(text))) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    nodes.push(
      <a
        key={key++}
        href={m[2]}
        className="font-medium text-[#E66343] underline decoration-[#E66343]/40 underline-offset-2 hover:decoration-[#E66343]"
      >
        {m[1]}
      </a>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

/** Секции статьи: абзацы/заголовки/списки (тексты дословно из articles.json) */
function Sections({ sections }: { sections: ArticleSection[] }) {
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
                <li key={j}>{renderMd(item)}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i} className="mt-3 text-sm leading-relaxed text-gray-700">
            {renderMd(s.text)}
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
            ? 'What to do in Nha Trang, Bali and Da Nang: guides to the local event scenes.'
            : 'Куда сходить в Нячанге, на Бали и в Дананге: подборки и гиды по событийной жизни городов.'}
        </p>
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
                  href={`${en ? '/en' : ''}/blog/${a.slug}`}
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
            href={`${en ? '/en' : ''}/blog`}
            className="font-medium text-[#E66343] decoration-[#E66343]/40 underline-offset-2 hover:underline"
          >
            {en ? '← Blog' : '← Блог'}
          </a>
        </p>
        <h1 className="mt-2 text-xl font-semibold text-gray-900">{view!.h1}</h1>
        <p className="mt-1 text-xs text-gray-400">
          {en ? enDate(article.datePublished) : ruDate(article.datePublished)}
        </p>
        <div className="mt-4">
          <Sections sections={view!.sections} />
        </div>
        {/* Подпись редакции (E-E-A-T): авторство + ссылка на страницу /about.
            Как и datePublished — текст-xs; внутренний /about перехватывает
            document-обработчик App.tsx (navigate, без перезагрузки). EN —
            «MyPins Editorial · <a href=/en/about/>About the project</a>. */}
        <p className="mt-4 border-t border-gray-100 pt-3 text-xs text-gray-400">
          {en ? 'MyPins Editorial · ' : 'Редакция MyPins · '}
          <a
            href={en ? '/en/about' : '/about'}
            className="font-medium text-[#E66343] decoration-[#E66343]/40 underline-offset-2 hover:underline"
          >
            {en ? 'About the project' : 'О проекте и контакты'}
          </a>
        </p>
      </main>
    </div>
  );
}
