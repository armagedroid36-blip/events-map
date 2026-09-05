// Страница «Для организаторов»: /for-organizers (RU-only, как блог).
// Контент — единый источник src/content/forOrganizers.json (его же читает
// пре-рендер scripts/seo-prerender.mjs — тексты не дублируются). Мета-теги
// head ставит сама страница (как BlogIndex/ArticlePage): при клиентском
// переходе App-эффект не перебивает — маршрут исключён из applyGenericMeta.
// Секции — как в статьях (p/h2/ul с md-ссылками), FAQ — <details><summary>
// как в городских страницах (Home.tsx, citySeo).
import { useEffect } from 'react';
import type { ReactNode } from 'react';
import Header from '../components/Header';
import { navigate } from '../lib/navigate';
import { applyForOrganizersMeta, applyGenericMeta } from '../lib/seo';
import type { ArticleSection, ForOrganizersContent } from '../lib/types';
// Каст через unknown: resolveJsonModule выводит точный литеральный тип,
// прямой as ForOrganizersContent несовместим (readonly-поля).
import contentRaw from '../content/forOrganizers.json';

const content = contentRaw as unknown as ForOrganizersContent;

const MD_LINK_RE = /\[([^\]]+)\]\(([^)]+)\)/g;

/**
 * Рендер текста секции с markdown-ссылками: «[события на Бали](/bali)» →
 * <a href="/bali">. Внутренние относительные ссылки перехватывает
 * document-обработчик App.tsx (navigate, без перезагрузки).
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

/** Секции страницы: абзацы/заголовки/списки (тексты дословно из forOrganizers.json) */
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

/** /for-organizers — B2B-страница «Для организаторов» (h1 + intro + секции + FAQ + CTA) */
export default function ForOrganizers() {
  useEffect(() => {
    applyForOrganizersMeta(content);
    // Назад с B2B-страницы: /for-organizers ставит свою мету заново
    return () => applyGenericMeta();
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <Header />
      <main className="mx-auto w-full max-w-2xl flex-1 p-4">
        <h1 className="text-xl font-semibold text-gray-900">{content.h1}</h1>
        <p className="mt-3 text-sm leading-relaxed text-gray-700">{renderMd(content.intro)}</p>
        <div className="mt-2">
          <Sections sections={content.sections} />
        </div>

        {/* FAQ — <details><summary>: вопросы видны, ответы раскрываются по клику */}
        {content.faq.map((f) => (
          <details key={f.q} className="mt-3">
            <summary className="cursor-pointer text-sm font-semibold text-gray-800 hover:text-gray-900">
              {f.q}
            </summary>
            <p className="mt-1 text-sm leading-relaxed text-gray-600">{renderMd(f.a)}</p>
          </details>
        ))}

        {/* Финальный CTA-блок: h2 + подводка + кнопка «Создать событие» → главная,
            где гость увидит вход/регистрацию (форма создания — после входа) */}
        <div className="mt-6 border-t border-gray-100 pt-4">
          <h2 className="text-base font-semibold text-gray-900">{content.final.h2}</h2>
          <p className="mt-2 text-sm leading-relaxed text-gray-700">{renderMd(content.final.p)}</p>
          <a
            href="/"
            onClick={(e) => {
              e.preventDefault();
              navigate('/');
            }}
            className="mt-3 inline-block rounded-md bg-[#72D2CF] px-4 py-2 text-sm font-semibold text-black shadow hover:bg-[#61B2B0]"
          >
            Создать событие
          </a>
        </div>
      </main>
    </div>
  );
}
