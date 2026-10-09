// Постраничное чтение строк Supabase.
//
// Зачем: PostgREST отдаёт не больше 1000 строк на один запрос (лимит проекта),
// поэтому «выбрать всю таблицу» одним select — тихая потеря данных: строки за
// пределами первой тысячи не видны. Для сборщиков это означало, что ключи
// дублей части событий не загружаются и те же карточки вставляются заново.
//
// Использование:
//   import { selectAll } from './db-rows.mjs';
//   const rows = await selectAll(db, 'events', 'title, start_date');
//   const live = await selectAll(db, 'events', 'id, title', { filter: (q) => q.in('status', ['active']) });
//
// Порядок сортировки — по указанной колонке (по умолчанию id): без стабильного
// order PostgREST может вернуть страницы в разном порядке и часть строк
// продублируется/потеряется.

const PAGE_SIZE = 1000; // серверный максимум PostgREST; больше не отдаст
const PAGE_RETRIES = 5; // обрывы ответа («terminated», ECONNRESET) транзиентны — повторяем страницу

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Обрыв сети/шлюза — повторяем; ошибка данных (схема, права) — падаем сразу. */
function isTransient(message) {
  return /terminated|fetch failed|ECONNRESET|ECONNREFUSED|socket hang up|other side closed|ETIMEDOUT|UND_ERR|50[234]|429/i.test(String(message || ''));
}

/**
 * Прочитать все строки таблицы постранично.
 * @param {import('@supabase/supabase-js').SupabaseClient} db
 * @param {string} table
 * @param {string} columns — список полей для select
 * @param {{ order?: string, ascending?: boolean, filter?: (q: any) => any, log?: (msg: string) => void }} [opts]
 * @returns {Promise<any[]>}
 */
export async function selectAll(db, table, columns, opts = {}) {
  const { order = 'id', ascending = true, filter, log } = opts;
  const build = (from) => {
    let query = db.from(table).select(columns);
    if (filter) query = filter(query);
    return query.order(order, { ascending }).range(from, from + PAGE_SIZE - 1);
  };
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    let data = null;
    let lastErr = null;
    for (let attempt = 1; attempt <= PAGE_RETRIES; attempt++) {
      // запрос пересобираем каждую попытку: билдер одноразовый, повторное await
      // того же объекта вернуло бы прежний сбой
      const res = await build(from).then((r) => r, (e) => ({ error: { message: String((e && e.message) || e) } }));
      if (!res.error) { data = res.data; lastErr = null; break; }
      lastErr = res.error.message;
      if (!isTransient(lastErr) || attempt === PAGE_RETRIES) break;
      if (log) log(`${table}: повтор ${attempt}/${PAGE_RETRIES - 1} после «${lastErr}»`);
      await sleep(1200 * attempt);
    }
    if (lastErr) throw new Error(`${table}: ${lastErr}`);
    const page = data || [];
    rows.push(...page);
    if (log) log(`${table}: загружено ${rows.length} строк`);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

/** Сколько строк в таблице (count без выгрузки данных). */
export async function countRows(db, table, filter) {
  let query = db.from(table).select('*', { count: 'exact', head: true });
  if (filter) query = filter(query);
  const { count, error } = await query;
  if (error) throw new Error(`${table}: ${error.message}`);
  return count || 0;
}
