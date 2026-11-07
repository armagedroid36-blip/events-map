// Адрес превью для карточки события.
//
// Фото события приходят из БД ссылками на внешние CDN. У cyprus.bz (и
// подобных) в query стоит ?w=516&h=516&q=80 — превью слота 80×112 CSS-px
// получает картинку в 5–7 раз больше нужного. Хуже того, resize-сервис
// отвечает мгновенно только на «пресетные» размеры (112/224/256), а на
// остальных (320, 400, 448, 516, 800) запрос висит десятками секунд —
// замер на живом фото: 38–40 с, transferSize 0. Три варианта одного фото
// (?w=516/688/800) — это три таких запроса на одну карточку.
//
// Поэтому для хостов из config.previewResizeHosts ширина И высота
// переписываются в квадрат previewThumbSize: три варианта одного фото
// превращаются в один и тот же URL (браузер берёт его из кэша), а размер
// попадает в пресет, который сервис отдаёт за 0,1–0,5 с.
//
// Высоту правим вместе с шириной намеренно: w=224 при исходном h=516 —
// это НЕ пресет, и такой запрос висит так же, как исходный.
//
// Хост не из списка — URL возвращается как есть (supabase storage,
// static.baliforum.ru отдают быстро сами). Ссылка без параметра w не
// трогается: сервис такого хоста о размерах не догадывается.
import { config } from '../config';

/** Совпадает ли хост с записью списка (сам хост или любой поддомен) */
function hostMatches(hostname: string, host: string): boolean {
  const h = hostname.toLowerCase();
  return h === host || h.endsWith(`.${host}`);
}

/** Base для relative-ссылок: в браузере — текущий origin (prerender/SSR не
 *  вызывает эту функцию: фото в статике рисует только React) */
function baseUrl(): string {
  return typeof window !== 'undefined' ? window.location.origin : config.siteUrl;
}

/**
 * Размер превью по умолчанию — квадрат (например 224×224).
 * Возвращает исходную строку, если хост не в списке или в URL нет w.
 */
export function previewSrc(
  src: string,
  hosts: string[] = config.previewResizeHosts,
  size: number = config.previewThumbSize,
): string {
  if (!src) return src;

  let url: URL;
  try {
    url = new URL(src, baseUrl());
  } catch {
    return src;
  }

  if (!hosts.some((h) => hostMatches(url.hostname, h))) return src;
  if (!url.searchParams.has('w')) return src;

  url.searchParams.set('w', String(size));
  if (url.searchParams.has('h')) url.searchParams.set('h', String(size));
  return url.toString();
}
