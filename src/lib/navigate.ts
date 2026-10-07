// Чистые URL через History API (без внешнего роутера).
// navigate() — SPA-переход (pushState + событие popstate, App слушает его).
// Личные разделы остаются на hash: переход к ним с чистого пути делается
// navigate('/#/profile') — путь '/', hash разбирает прежняя логика App.
//
// Транслит и слаги живут в src/lib/slug.ts — ОДНА реализация на клиент и на
// пре-рендер (scripts/seo-prerender.mjs импортирует тот же файл): разъехавшиеся
// копии давали canonical не на тот URL, что открыт у посетителя. Здесь только
// реэкспорт для прежних импортов (`import { slugify } from '../lib/navigate'`).

export { slugify } from './slug';

/** SPA-переход: pushState + popstate (App перечитывает pathname и hash) */
export function navigate(path: string): void {
  window.history.pushState(null, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}
