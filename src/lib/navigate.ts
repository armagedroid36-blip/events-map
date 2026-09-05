// Чистые URL через History API (без внешнего роутера).
// navigate() — SPA-переход (pushState + событие popstate, App слушает его);
// slugify() — человекопонятный хвост URL события из названия.
// Личные разделы остаются на hash: переход к ним с чистого пути делается
// navigate('/#/profile') — путь '/', hash разбирает прежняя логика App.

const RU_TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z',
  и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
  с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh',
  щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

/** «Вечеринка у бассейна» → vecherinka-u-basseyna; «Da Nang night market» → da-nang-night-market */
export function slugify(title: string): string {
  const s = title
    .toLowerCase()
    .replace(/[а-яё]/g, (ch) => RU_TRANSLIT[ch] ?? '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s || 'event';
}

/** SPA-переход: pushState + popstate (App перечитывает pathname и hash) */
export function navigate(path: string): void {
  window.history.pushState(null, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}
