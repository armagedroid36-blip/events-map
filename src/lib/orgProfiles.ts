// Публичные профили организаторов: список id, для которых сборка записала
// страницу /org/<id>/ (scripts/seo-prerender.mjs → PUBLISHED_ORG_IDS).
//
// Зачем: карточка события раньше всегда уводила на /org/<id>/ по клику, и при
// отсутствии страницы профиля пользователь попадал на заглушку «не найдено».
// Теперь переход есть только для id из манифеста — решение ровно то же, что
// приняла сборка (включая исключения тестовых записей и дублей).
//
// Манифест — статический файл dist/published-orgs.json (уезжает вместе с
// сайтом). Запрос один на сессию; ошибка сети или старый деплой без файла →
// пустой список: ссылку не показываем (лучше текст, чем 404).
import { useEffect, useState } from 'react';

let cache: Promise<Set<string>> | null = null;

/** Список id владельцев, у которых есть собранная страница профиля */
export function loadPublishedOrgIds(): Promise<Set<string>> {
  if (!cache) {
    cache = fetch('/published-orgs.json', { cache: 'no-cache' })
      .then((r) => (r.ok ? (r.json() as Promise<unknown>) : null))
      .then((data) => {
        const ids = (data as { ids?: unknown } | null)?.ids;
        return new Set(
          Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string') : [],
        );
      })
      .catch(() => new Set<string>());
  }
  return cache;
}

/** Опубликованный профиль с подписями для хаба /for-organizers/ */
export type PublishedOrg = { id: string; name: string; nameEn: string };

let orgsCache: Promise<PublishedOrg[]> | null = null;

/**
 * Публичные профили с именами (хаб «Организаторы на MyPins»).
 * Источник — тот же манифест dist/published-orgs.json, что пишет сборка:
 * подписи и состав совпадают со статикой, без запросов к БД на клиенте.
 * Нет файла/поля orgs (старый деплой) → пустой список, блок не рисуется.
 */
export function loadPublishedOrgs(): Promise<PublishedOrg[]> {
  if (!orgsCache) {
    orgsCache = fetch('/published-orgs.json', { cache: 'no-cache' })
      .then((r) => (r.ok ? (r.json() as Promise<unknown>) : null))
      .then((data) => {
        const raw = (data as { orgs?: unknown } | null)?.orgs;
        if (!Array.isArray(raw)) return [] as PublishedOrg[];
        return raw
          .map((x) => x as Partial<PublishedOrg> | null)
          .filter(
            (x): x is Partial<PublishedOrg> & { id: string; name: string } =>
              !!x && typeof x.id === 'string' && typeof x.name === 'string' && x.name.length > 0,
          )
          .map((x) => ({
            id: x.id,
            name: x.name,
            nameEn: typeof x.nameEn === 'string' && x.nameEn ? x.nameEn : x.name,
          }));
      })
      .catch(() => [] as PublishedOrg[]);
  }
  return orgsCache;
}

/** Опубликована ли страница профиля у этого владельца (false, пока не узнали) */
export function useOrgProfilePublished(ownerId?: string | null): boolean {
  const [published, setPublished] = useState(false);
  useEffect(() => {
    let alive = true;
    if (!ownerId) {
      setPublished(false);
      return () => {
        alive = false;
      };
    }
    loadPublishedOrgIds().then((ids) => {
      if (alive) setPublished(ids.has(ownerId));
    });
    return () => {
      alive = false;
    };
  }, [ownerId]);
  return published;
}
