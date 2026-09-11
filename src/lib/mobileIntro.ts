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
// рисует свои блоки, а перенесённый контейнер удаляется.
//
// ОДИН h1 НА СТРАНИЦУ. На главной («/» и «/en») бренд шапки (Header.tsx,
// isBrandH1) — уже h1, поэтому у переносимого #seo-home-block заголовок
// ПОНИЖАЕТСЯ до h2 (тег, классы и текст сохраняются, статика пре-рендера не
// трогается — правится только JS-копия). Иначе в DOM главной было бы два h1.
// Понижение делается и для видимой панели десктопа (см. ниже). На городских
// страницах бренд не h1, перенесённый городской h1 — единственный, понижать
// его НЕЛЬЗЯ.
//
// ВИДИМАЯ ПАНЕЛЬ ГЛАВНОЙ НА ДЕСКТОПЕ. Без мобильного интро (>=768px) SPA
// главную рисует сама: шапка + карта, а статический блок главной удалялся —
// на / и /en не оставалось ни текста о сервисе, ни ссылок на города. Теперь
// на путях главной при НЕактивном интро блок не удаляется, а переезжает в
// видимый контейнер #seo-home-panel с классами городской панели
// (#city-seo-block: стекло, правый нижний угол на lg) — показ/скрытие решает
// Home (setHomePanelHidden) тем же условием, что у городского блока
// (!selected && !listOpen && !mobileFiltersOpen && !formOpen && !authOpen) и
// только на десктопной ширине. Содержимое — СТАТИЧЕСКАЯ разметка пре-рендера
// (h2 + <p> + <a> без классов), её оформляет CSS в src/index.css по
// селектору #seo-home-panel. Статика пре-рендера (scripts/seo-prerender.mjs)
// не меняется.
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

/** id видимой панели блока главной на десктопе (Home показывает её, когда
 *  открытых карточек/панелей нет; содержимое — статический #seo-home-block) */
export const HOME_PANEL_ID = 'seo-home-panel';

/** Медиазапрос десктопного показа панели главной — тот же брейкпоинт, что у
 *  lg:-классов панели (1024px). Ниже него панель не показывается: интро-режим
 *  и планшетная вёрстка остаются как были (блок главной не удаляется только
 *  при активном интро — он живёт в #seo-intro-keep). */
export const HOME_PANEL_QUERY = '(min-width: 1024px)';

/** Классы видимой панели главной — те же, что у городского SEO-блока
 *  (#city-seo-block в Home.tsx): стекло, на lg — правый нижний угол 400px,
 *  скролл внутри. Отличие одно: bottom-32 на lg (вместо bottom-24) — на
 *  ширине 1024px панель иначе срезает центрированную кнопку «События списком»
 *  (bottom-safe = 4.5rem). Менять синхронно с Home.tsx. */
const HOME_PANEL_CLASS =
  'glass absolute inset-x-2 bottom-36 z-[1140] mx-auto max-h-[42vh] w-auto ' +
  'max-w-xl overflow-y-auto rounded-xl p-3 shadow-xl thin-scroll ' +
  'lg:inset-x-auto lg:right-4 lg:mx-0 lg:w-[400px] lg:max-w-[calc(100vw-2rem)] lg:bottom-32';

/** Все статические SEO-блоки пре-рендера (главная, города, категории,
 *  организаторы, события, блог/статьи, B2B, «О проекте») */
export const SEO_BLOCK_SELECTOR =
  '#seo-home-block, #seo-city-block, #seo-category-block, #seo-org-block, ' +
  '#seo-event-block, #seo-article-block, #seo-b2b-block, #seo-about-block';

/** Блоки, которые остаются в DOM при активном мобильном интро-экране
 *  (страницы, где интро вообще показывается: главная и города) */
const KEEP_IDS = ['#seo-home-block', '#seo-city-block'];

/** Путь главной без хвостового слэша (как cleanPath в Header.tsx: '/en/' → '/en').
 *  Только на главной бренд шапки — h1, поэтому только здесь понижается h1
 *  перенесённого блока главной. */
function isHomePath(pathname: string): boolean {
  const clean = pathname === '/index.html' ? '/' : pathname.replace(/\/+$/, '') || '/';
  return clean === '/' || clean === '/en';
}

/** Заголовок перенесённого блока главной: h1 → h2 (тег меняется, классы и
 *  содержимое сохраняются — статика пре-рендера не трогается). Других h1
 *  внутри блока главной нет; querySelectorAll — на случай будущих правок. */
function demoteHeadings(root: Element): void {
  root.querySelectorAll('h1').forEach((old) => {
    const h2 = document.createElement('h2');
    Array.from(old.attributes).forEach((attr) => h2.setAttribute(attr.name, attr.value));
    while (old.firstChild) h2.appendChild(old.firstChild);
    old.replaceWith(h2);
  });
}

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

/** Видимая панель главной: контейнер-обёртка в конце <body> (React им не
 *  управляет). Создаётся один раз, по умолчанию скрыта — показывает Home
 *  через setHomePanelHidden, когда нет открытых карточек/панелей и ширина
 *  десктопная. */
function ensureHomePanel(): HTMLElement {
  const existing = document.getElementById(HOME_PANEL_ID);
  if (existing) return existing;
  const panel = document.createElement('div');
  panel.id = HOME_PANEL_ID;
  panel.className = `${HOME_PANEL_CLASS} hidden`;
  document.body.appendChild(panel);
  return panel;
}

/**
 * Показать/скрыть видимую панель блока главной (зовёт Home при изменении
 * состояния карточки/списка/фильтров/форм и ширины окна). Панель есть только
 * на путях главной — на остальных страницах вызов ничего не делает.
 */
export function setHomePanelHidden(hidden: boolean): void {
  document.getElementById(HOME_PANEL_ID)?.classList.toggle('hidden', hidden);
}

/**
 * Вызывается из src/main.tsx ДО монтирования React. Удаляет статические
 * SEO-блоки (при живом React страницу рисует SPA — на ней должен остаться
 * ровно один h1), кроме:
 *  * блоков главной/города при мобильном интро-режиме — они переезжают в
 *    скрытый контейнер в конце <body> и живут там, пока интро активно
 *    (удаляет их Home через dropIntroSeoBlocks);
 *  * блока главной без мобильного интро (десктоп) — он переезжает в видимую
 *    панель #seo-home-panel, которую показывает Home.
 */
export function keepSeoBlocksForIntro(): void {
  const introActive = isMobileIntroActive();
  const home = isHomePath(window.location.pathname);
  // Главная без интро (любая ширина >= 768px): блок не выбрасываем — он нужен
  // панели десктопа. Показывать ли панель, решает Home (ширина + оверлеи).
  const keepVisibleHome = home && !introActive;
  const kept: Element[] = [];
  let homePanelBlock: Element | null = null;
  document.querySelectorAll(SEO_BLOCK_SELECTOR).forEach((el) => {
    if (home && el.id === 'seo-home-block') {
      // На главной бренд шапки — h1 (Header.isBrandH1): в обоих режимах
      // (интро и видимая панель) заголовок блока понижается до h2 —
      // на странице остаётся ровно один h1.
      demoteHeadings(el);
      if (introActive) kept.push(el);
      else if (keepVisibleHome) homePanelBlock = el;
      return;
    }
    if (introActive && KEEP_IDS.includes(`#${el.id}`)) {
      kept.push(el);
      return;
    }
    el.remove();
  });
  if (kept.length > 0) {
    const holder = document.createElement('div');
    holder.id = INTRO_KEEP_ID;
    // display:none (Tailwind-класс): контент в DOM для краулера, но не в вёрстке
    // (не влияет на layout, LCP и загрузку картинок внутри блока)
    holder.className = 'hidden';
    kept.forEach((el) => holder.appendChild(el));
    document.body.appendChild(holder);
  }
  if (homePanelBlock) ensureHomePanel().appendChild(homePanelBlock);
}

/** Интро закрыто (клик «Открыть карту» или десктопная ширина) — перенесённые
 *  статические блоки больше не нужны: SPA рисует свои, второй h1 недопустим.
 *  Исключение — блок главной: его контент нужен панели десктопа, поэтому он
 *  переезжает в #seo-home-panel (скрытую до решения Home). */
export function dropIntroSeoBlocks(): void {
  const holder = document.getElementById(INTRO_KEEP_ID);
  if (!holder) return;
  const homeBlock = holder.querySelector('#seo-home-block');
  if (homeBlock && isHomePath(window.location.pathname)) {
    ensureHomePanel().appendChild(homeBlock);
  }
  holder.remove();
}
