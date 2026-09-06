// Страница «О проекте»: /about (RU-only, как блог и /for-organizers).
// Контент — единый источник src/content/about.json (его же читает
// пре-рендер scripts/seo-prerender.mjs — тексты не дублируются). Мета-теги
// head ставит сама страница (как ForOrganizers): при клиентском переходе
// App-эффект не перебивает — маршрут исключён из applyGenericMeta.
// Секции — как в статьях (p/h2/ul с md-ссылками).
import { useEffect } from 'react';
import type { ReactNode } from 'react';
import Header from '../components/Header';
import { applyAboutMeta, applyGenericMeta } from '../lib/seo';
import type { AboutContent, ArticleSection } from '../lib/types';
// Каст через unknown: resolveJsonModule выводит точный литеральный тип,
// прямой as AboutContent несовместим (readonly-поля).
import contentRaw from '../content/about.json';

const content = contentRaw as unknown as AboutContent;

const MD_LINK_RE = /\[([^\]]+)\]\(([^)]+)\)/g;

/**
 * Рендер текста секции с markdown-ссылками: «[события на Бали](/bali)» →
 * <a href="/bali">. Внутренние относительные ссылки перехватывает
 * document-обработчик App.tsx (navigate, без перезагрузки); внешние
 * (https://t.me/...) и почтовые (mailto:) — обычные ссылки браузера,
 * внешние открываются в новой вкладке.
 */
function renderMd(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  let key = 0;
  MD_LINK_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = MD_LINK_RE.exec(text))) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const href = m[2];
    const external = /^https?:\/\//i.test(href);
    nodes.push(
      <a
        key={key++}
        href={href}
        {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}
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

/** Секции страницы: абзацы/заголовки/списки (тексты дословно из about.json) */
function Sections({ sections }: { sections: ArticleSection[] }) {
  return (
    <>
      {sections.map((s, i) => {
        if (s.type === 'h2') {
          return (
            <h2 key={i} className="mt-6 text-base font-semibold text-gray-900">
              {renderMd(s.text)}
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

/** /about — E-E-A-T-страница «О проекте» (h1 + секции из about.json) */
export default function About() {
  useEffect(() => {
    applyAboutMeta(content);
    // Назад с /about: страница ставит свою мету заново
    return () => applyGenericMeta();
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <Header />
      <main className="mx-auto w-full max-w-2xl flex-1 p-4">
        <h1 className="text-xl font-semibold text-gray-900">{content.h1}</h1>
        <div className="mt-2">
          <Sections sections={content.sections} />
        </div>
      </main>
    </div>
  );
}
