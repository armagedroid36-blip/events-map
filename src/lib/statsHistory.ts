// Агрегация истории счётчиков (stats_daily) для вкладки «Статистика»:
// из ежедневных строк RPC admin_stats_history строим точки графика
// по дням/месяцам/годам. Чистые функции — без React, тестируются node-ом.
import type { StatsDailyRow } from './types';

/** Точка графика: сумма счётчиков за период (день/месяц/год) */
export interface StatsPoint {
  key: string;
  label: string;
  visits: number;
  cardViews: number;
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

/** Локальная дата YYYY-MM-DD (не UTC — иначе граница дня смещается) */
function localIso(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function addSlot(
  map: Map<string, { visits: number; cardViews: number }>,
  key: string,
  name: string,
  count: number,
) {
  const slot = map.get(key);
  if (!slot) return;
  if (name === 'visits') slot.visits += count;
  else if (name === 'card_views') slot.cardViews += count;
}

/** День: последние 30 дней, пустые дни = 0 */
export function aggregateDays(rows: StatsDailyRow[]): StatsPoint[] {
  const map = new Map<string, { visits: number; cardViews: number }>();
  const now = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    map.set(localIso(d), { visits: 0, cardViews: 0 });
  }
  for (const r of rows) addSlot(map, r.day, r.name, Number(r.count) || 0);
  return [...map.entries()].map(([key, v]) => ({
    key,
    label: `${key.slice(8, 10)}.${key.slice(5, 7)}`,
    ...v,
  }));
}

/** Месяц: последние 12 месяцев, точка = YYYY-MM */
export function aggregateMonths(rows: StatsDailyRow[]): StatsPoint[] {
  const map = new Map<string, { visits: number; cardViews: number }>();
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    map.set(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`, { visits: 0, cardViews: 0 });
  }
  for (const r of rows) addSlot(map, r.day.slice(0, 7), r.name, Number(r.count) || 0);
  return [...map.entries()].map(([key, v]) => ({
    key,
    label: `${key.slice(5, 7)}.${key.slice(2, 4)}`,
    ...v,
  }));
}

/** Год: все годы, которые есть в данных */
export function aggregateYears(rows: StatsDailyRow[]): StatsPoint[] {
  const map = new Map<string, { visits: number; cardViews: number }>();
  for (const r of rows) {
    const key = r.day.slice(0, 4);
    if (!map.has(key)) map.set(key, { visits: 0, cardViews: 0 });
    addSlot(map, key, r.name, Number(r.count) || 0);
  }
  return [...map.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([key, v]) => ({ key, label: key, ...v }));
}
