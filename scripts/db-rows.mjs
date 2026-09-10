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
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    let query = db.from(table).select(columns);
    if (filter) query = filter(query);
    query = query.order(order, { ascending }).range(from, from + PAGE_SIZE - 1);
    const { data, error } = await query;
    if (error) throw new Error(`${table}: ${error.message}`);
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
