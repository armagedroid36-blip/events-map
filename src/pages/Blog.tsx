// Блог MyPins: /blog (BlogIndex) и /blog/<slug> (ArticlePage).
// Статьи — единый источник src/content/articles.json (его же читает
// пре-рендер scripts/seo-prerender.mjs — тексты не дублируются). Статьи
// публикуются на русском (lang ru); интерфейсные подписи страниц — также
// русские hardcoded-строки (блог RU-only, решение по EN — позже).
// Мета-теги head ставит сама страница (как Home): при клиентском переходе
// App-эффект не перебивает — блог-маршруты исключены из applyGenericMeta.
import { useEffect } from 'react';
import type { ReactNode } from 'react';
import Header from '../components/Header';
import { navigate } from '../lib/navigate';
import { applyArticleMeta, applyBlogMeta, applyGenericMeta, ruDate } from '../lib/seo';
import type { Article, ArticleSection } from '../lib/types';
// Каст через unknown: resolveJsonModule выводит точный литеральный тип,
// прямой as Article[] несовместим (readonly-поля).
import articlesRaw from '../content/articles.json';

const articles = articlesRaw as unknown as Article[];

/** Заглушка 404 для неизвестного slug (вёрстка как NotFound в App.tsx) */
function ArticleNotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-white px-4 text-center">
      <div className="text-lg font-semibold text-gray-900">404 — страница не найдена</div>
      <button
        onClick={() => navigate('/')}
        className="rounded-md bg-[#72D2CF] px-4 py-2 text-sm font-semibold text-black shadow hover:bg-[#61B2B0]"
      >
        На главную
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

/** /blog — список статей (карточка: заголовок-ссылка, дата, description) */
export function BlogIndex() {
  useEffect(() => {
    applyBlogMeta();
    // Назад с закрытой статьи: /blog ставит свою мету заново
    return () => applyGenericMeta();
  }, []);
  // Свежие сверху; при равных датах сохраняем порядок JSON (стабильная сортировка)
  const list = [...articles].sort((a, b) => b.datePublished.localeCompare(a.datePublished));
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <Header />
      <main className="mx-auto w-full max-w-2xl flex-1 p-4">
        <h1 className="text-xl font-semibold text-gray-900">Блог MyPins: гиды по событиям</h1>
        <p className="mt-1 text-sm text-gray-500">
          Куда сходить в Нячанге, на Бали и в Дананге: подборки и гиды по событийной жизни городов.
        </p>
        {list.map((a) => (
          <article key={a.slug} className="mt-6 border-t border-gray-100 pt-4 first:border-t-0 first:pt-0">
            <h2 className="text-base font-semibold text-gray-900">
              <a
                href={`/blog/${a.slug}`}
                className="text-[#E66343] decoration-[#E66343]/40 underline-offset-2 hover:underline"
              >
                {a.h1}
              </a>
            </h2>
            <p className="mt-1 text-xs text-gray-400">{ruDate(a.datePublished)}</p>
            <p className="mt-2 text-sm leading-relaxed text-gray-700">{a.description}</p>
          </article>
        ))}
      </main>
    </div>
  );
}

/** /blog/<slug> — страница статьи (h1 = h1 статьи, дата и секции) */
export function ArticlePage({ slug }: { slug: string }) {
  const article = articles.find((a) => a.slug === slug);
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
            href="/blog"
            className="font-medium text-[#E66343] decoration-[#E66343]/40 underline-offset-2 hover:underline"
          >
            ← Блог
          </a>
        </p>
        <h1 className="mt-2 text-xl font-semibold text-gray-900">{article.h1}</h1>
        <p className="mt-1 text-xs text-gray-400">{ruDate(article.datePublished)}</p>
        <div className="mt-4">
          <Sections sections={article.sections} />
        </div>
        {/* Подпись редакции (E-E-A-T): авторство + ссылка на страницу /about.
            Как и datePublished — текст-xs; внутренний /about перехватывает
            document-обработчик App.tsx (navigate, без перезагрузки) */}
        <p className="mt-4 border-t border-gray-100 pt-3 text-xs text-gray-400">
          Редакция MyPins ·{' '}
          <a href="/about" className="font-medium text-[#E66343] decoration-[#E66343]/40 underline-offset-2 hover:underline">
            О проекте и контакты
          </a>
        </p>
      </main>
    </div>
  );
}
