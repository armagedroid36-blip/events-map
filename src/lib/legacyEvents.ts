// Снимки УДАЛЁННЫХ событий для SPA: /data/legacy-events.json
//
// Источник истины — scripts/data/legacy-events.json; на сборке он копируется в
// public/data/legacy-events.json (scripts/build-legacy-snapshot.mjs) и
// публикуется рядом с сайтом. Пре-рендер (scripts/seo-prerender.mjs) пишет по
// этим записям страницы 200, а SPA рисовала «Событие не найдено или уже
// завершено»: для Google (он рендерит JS) страница выглядела как Soft 404,
// хотя отдавала 200. Теперь SPA читает тот же набор и рисует ту же карточку.
//
// Загрузка НЕ блокирует первый рендер: модуль отдаёт промис, его стартует
// эффект загрузки данных параллельно с основным набором событий. Любая ошибка
// (нет файла, битый JSON, офлайн) — пустой набор, и поведение прежнее
// («событие не найдено»), без падения приложения.

import type { EventItem } from './types';

let inflight: Promise<Record<string, EventItem>> | null = null;

function normalize(raw: unknown): EventItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const rec = raw as Partial<EventItem>;
  if (typeof rec.id !== 'string' || !rec.id) return null;
  // Запись снимка — событие, которого в базе нет: считаем архивным (та же
  // плашка и та же формула даты в title, что у статической страницы),
  // координаты пустые — карта на этой странице не монтируется.
  return { lat: null, lng: null, status: 'archived', ...rec } as EventItem;
}

/** Промис загрузки набора снимков (кэшируется на время жизни страницы). */
export function loadLegacyEvents(): Promise<Record<string, EventItem>> {
  if (inflight) return inflight;
  inflight = (async () => {
    const map: Record<string, EventItem> = {};
    try {
      // Путь относительный (BASE_URL) — работает и на mypins.site, и в preview,
      // и в dev (public/ отдаётся как есть).
      const res = await fetch(`${import.meta.env.BASE_URL}data/legacy-events.json`, {
        cache: 'no-cache',
      });
      if (!res.ok) return map;
      const body: unknown = await res.json();
      const list = Array.isArray(body) ? body : [];
      for (const raw of list) {
        const ev = normalize(raw);
        if (ev) map[ev.id] = ev;
      }
    } catch {
      // Снимков нет — работаем как раньше (см. заголовок файла)
    }
    return map;
  })();
  return inflight;
}
