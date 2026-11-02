// Настройка i18next: два языка (русский/английский).
// ЕДИНЫЙ источник языка ПУБЛИЧНЫХ страниц — URL: путь /en/* → 'en',
// корневые пути → 'ru' (Googlebot ходит с en-US — язык браузера на
// публичных путях НЕ используется, иначе EN-контент отрендерился бы на
// RU-URL и получились бы дубли). Язык браузера/localStorage используется
// только на '/' с hash-разделами (личные кабинеты #/profile и пр.);
// переключатель в шапке меняет URL (navigate) и перезаписывает localStorage.
//
// beta 1.21: словари грузятся ЛЕНИВО и по одному. Раньше оба (ru.ts 48 КБ +
// en.ts 32 КБ) импортировались статически в entry-бандл и парсились на КАЖДОЙ
// странице, хотя нужен ровно один язык. Теперь в бандл входит только словарь
// языка текущего URL, второй догружается в простое (переключатель языка
// продолжает работать). main.tsx ждёт loadI18n() перед монтированием —
// первый рендер по-прежнему сразу на нужном языке.
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

function initialLang(): string {
  const path = window.location.pathname;
  if (path === '/en' || path.startsWith('/en/') || path.startsWith('/en')) return 'en';
  // Личные hash-разделы на '/' и старые ссылки: прежнее поведение —
  // сохранённый выбор или язык браузера.
  if (path === '/' || path === '/index.html') {
    const saved = localStorage.getItem('events-map-lang');
    if (saved === 'ru' || saved === 'en') return saved;
    const nav = navigator.language?.toLowerCase() ?? '';
    return nav.startsWith('ru') ? 'ru' : 'en';
  }
  return 'ru';
}

/** Простое исполнение после первого кадра: requestIdleCallback, иначе таймер */
function idleRun(cb: () => void): void {
  if (typeof window.requestIdleCallback === 'function') {
    // timeout 8000, а не 3000: окно TBT в Lighthouse заканчивается на TTI ~5-6 с,
    // и разбор второго словаря (25-40 КБ) не должен попадать в измерение.
    window.requestIdleCallback(cb, { timeout: 8000 });
  } else {
    window.setTimeout(cb, 6000);
  }
}

/** Догрузить словарь языка (если его ещё нет) */
function importBundle(lng: string): Promise<{ default: Record<string, unknown> }> {
  return lng === 'en' ? import('./en') : import('./ru');
}

/** Переключение языка в шапке: словаря может не быть в бандле (beta 1.21) —
 *  подгружаем по требованию и повторно сообщаем компонентам о смене языка,
 *  чтобы react-i18next перерисовал строки. */
function ensureBundle(lng: string): void {
  if (i18n.hasResourceBundle(lng, 'translation')) return;
  void importBundle(lng)
    .then((m) => {
      i18n.addResourceBundle(lng, 'translation', m.default);
      i18n.emit('languageChanged', lng);
    })
    .catch(() => {});
}

let ready: Promise<void> | null = null;

/**
 * Загрузить словарь языка текущей страницы и инициализировать i18next.
 * Повторные вызовы возвращают тот же промис. Второй словарь подтягивается
 * в простое — чтобы переключатель языка в шапке работал без ожидания.
 */
export function loadI18n(): Promise<void> {
  if (ready) return ready;
  const lng = initialLang();
  ready = (lng === 'en' ? import('./en') : import('./ru'))
    .then((mod) =>
      i18n.use(initReactI18next).init({
        resources: { [lng]: { translation: mod.default } },
        lng,
        fallbackLng: 'en',
        interpolation: { escapeValue: false },
      }),
    )
    .then(() => {
      // Переключатель языка: если словаря ещё нет в бандле — подгружаем сразу.
      i18n.on('languageChanged', (next: string) => ensureBundle(next));
      // Второй словарь — в простое (не в окне TBT), чтобы переключение языка
      // в SPA-сессии было мгновенным.
      const other = lng === 'en' ? 'ru' : 'en';
      idleRun(() => ensureBundle(other));
    })
    .then(() => undefined);
  return ready;
}

export default i18n;
