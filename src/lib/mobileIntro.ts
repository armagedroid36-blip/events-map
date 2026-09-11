// Мобильный интро-экран страниц с картой (главная и города, <768px) и его
// влияние на статические SEO-блоки пре-рендера (scripts/seo-prerender.mjs).
//
// ПРОБЛЕМА. Googlebot smartphone ходит в мобильном viewport (~411px) и с
// ПУСТЫМ localStorage — значит видит мобильный интро-экран (Home.tsx:
// introActive), а SPA в этом режиме НЕ рисует ни городской SEO-блок, ни
// главный: в отрендеренном DOM остаются только шапка, интро (h2 + кнопка
// «Открыть карту») и скрытая панель фильтров — без h1, городского текста и
// внутренних ссылок. Статика же этих страниц полная (блоки #seo-city-block /
// #seo-home-block кладёт пре-рендер ПОСЛЕ <div id="root">), но main.tsx при
// живом React их удалял — вместе с контентом для краулера.
//
// РЕШЕНИЕ. В мобильном интро-режиме #seo-city-block и #seo-home-block НЕ
// удаляем, а переносим в скрытый контейнер в конце <body>: контент (h1,
// интро-абзац, «Ближайшие события» со ссылками, FAQ, ссылки на категории)
// остаётся в DOM для краулера, а вёрстку и LCP не трогает — контейнер
// display:none, картинки внутри не загружаются. Как только интро закрыто
// (клик «Открыть карту» на мобильном или окно расширено до десктопа), SPA
// рисует свои блоки, а перенесённый контейнер удаляется — иначе на странице
// было бы ДВА h1.
//
// Прочие статические блоки (#seo-category-block, #seo-org-block, #seo-event-block,
// #seo-article-block, #seo-b2b-block, #seo-about-block) удаляются как раньше:
// интро-экран на этих путях не показывается (introEligiblePath в Home.tsx —
// только '/' и '/<город>'), дублей с SPA-блоками не возникает.
//
// Ключ localStorage и медиазапрос — ТОТ ЖЕ расчёт, что в Home.tsx (интро-режим
// здесь и там обязан совпадать, отсюда единый источник констант).

/** localStorage-ключ «мобильный интро-экран показан» (версионируется, чтобы
 *  сбросить показ при изменении дизайна/текстов: смена суффикса _vN) */
export const MAP_INTRO_KEY = 'map_intro_dismissed_v1';

/** Медиазапрос мобильного интро-экрана (Home.tsx) */
export const MOBILE_INTRO_QUERY = '(max-width: 767px)';

/** id контейнера, в который переезжают блоки, нужные краулеру при интро */
export const INTRO_KEEP_ID = 'seo-intro-keep';

/** Все статические SEO-блоки пре-рендера (главная, города, категории,
 *  организаторы, события, блог/статьи, B2B, «О проекте») */
export const SEO_BLOCK_SELECTOR =
  '#seo-home-block, #seo-city-block, #seo-category-block, #seo-org-block, ' +
  '#seo-event-block, #seo-article-block, #seo-b2b-block, #seo-about-block';

/** Блоки, которые остаются в DOM при активном мобильном интро-экране
 *  (страницы, где интро вообще показывается: главная и города) */
const KEEP_IDS = ['#seo-home-block', '#seo-city-block'];

/** Активен ли мобильный интро-режим (расчёт как в Home.tsx: мобильная ширина
 *  и интро ещё не закрыто). localStorage может быть недоступен (приватный
 *  режим) — тогда считаем, что интро активно (как Home при ошибке чтения) */
export function isMobileIntroActive(): boolean {
  let dismissed = false;
  try {
    dismissed = localStorage.getItem(MAP_INTRO_KEY) === '1';
  } catch {
    dismissed = false;
  }
  return window.matchMedia(MOBILE_INTRO_QUERY).matches && !dismissed;
}

/**
 * Вызывается из src/main.tsx ДО монтирования React. Удаляет статические
 * SEO-блоки (при живом React страницу рисует SPA — на ней должен остаться
 * ровно один h1), кроме блоков главной/города в мобильном интро-режиме: они
 * переезжают в скрытый контейнер в конце <body> и живут там, пока интро
 * активно (удаляет их Home через dropIntroSeoBlocks).
 */
export function keepSeoBlocksForIntro(): void {
  const keepForIntro = isMobileIntroActive();
  const kept: Element[] = [];
  document.querySelectorAll(SEO_BLOCK_SELECTOR).forEach((el) => {
    if (keepForIntro && KEEP_IDS.includes(`#${el.id}`)) {
      kept.push(el);
      return;
    }
    el.remove();
  });
  if (kept.length === 0) return;
  const holder = document.createElement('div');
  holder.id = INTRO_KEEP_ID;
  // display:none (Tailwind-класс): контент в DOM для краулера, но не в вёрстке
  // (не влияет на layout, LCP и загрузку картинок внутри блока)
  holder.className = 'hidden';
  kept.forEach((el) => holder.appendChild(el));
  document.body.appendChild(holder);
}

/** Интро закрыто (клик «Открыть карту» или десктопная ширина) — перенесённые
 *  статические блоки больше не нужны: SPA рисует свои, второй h1 недопустим */
export function dropIntroSeoBlocks(): void {
  document.getElementById(INTRO_KEEP_ID)?.remove();
}
