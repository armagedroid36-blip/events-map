/**
 * dot-past-interval-census.mjs — постоянный зонд двух «просроченных» классов
 * живых карточек (active+moderation). Читающий, ничего не меняет.
 *
 * Секция A «интервал у записи ленты»: CN-карточка с end_date > start_date (≥1 дня)
 *   и началом в прошлом — кандидат в класс «окно серии/тура вместо даты показа».
 *   Признак дефекта (см. STATE 222–228, 238): у записи ленты series_count = 1 и
 *   series_first = series_last = start_at, т.е. запись = ОДИН показ, а end_at — окно.
 *   Законные интервалы (фестивали, выставки, курсы, ярмарки) в списке остаются —
 *   их закрывает арбитр (страница записи CN / visitcyprus / описание источника).
 *
 * Секция B «последняя дата в прошлом без recurrence»: карточки, которые обязана
 *   забрать штатная архивация (scripts/archive-past.mjs). Ориентир её отсечки —
 *   сегодняшняя дата в UTC (там `new Date().toISOString().slice(0,10)`), поэтому
 *   норма ≠ 0 сразу после фикса: карточка, правленная ПОСЛЕ шага архивации, уйдёт
 *   в архив на следующем прогоне. Норма — только такие «хвосты последнего фикса»,
 *   свежих прогонов не старше 12 ч.
 *
 * Запуск: node --env-file=.env scripts/dot-past-interval-census.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });
const FIELDS = 'id,title,start_date,end_date,start_time,city,address,website,status,source_type,recurrence';
const rows = await selectAll(db, 'events', FIELDS, { filter: q => q.in('status', ['active', 'moderation']) });
const utcToday = new Date().toISOString().slice(0, 10);

const days = (a, b) => (new Date(b) - new Date(a)) / 86400000;
const live = rows;
console.log(`живых карточек: ${live.length} | отсечка UTC: ${utcToday}`);

// --- Секция A ---
const a = live.filter(r => (r.website || '').includes('cyprusnow.app')
  && r.start_date && r.end_date && r.start_date < utcToday
  && days(r.start_date, r.end_date) >= 1);
console.log(`\nA. CN с интервалом ≥1 дня и началом в прошлом: ${a.length}`);
for (const r of a.sort((x, y) => x.start_date.localeCompare(y.start_date))) {
  console.log(`  ${r.id.slice(0, 8)} | ${r.start_date} ${(r.start_time || '--:--').slice(0, 5)} -> ${r.end_date} (${days(r.start_date, r.end_date)}д) | ${r.city} | ${r.title.slice(0, 55)}`);
}

// --- Секция B ---
const overdue = live.filter(r => {
  const last = r.end_date || r.start_date;
  return last && last < utcToday && !r.recurrence;
});
console.log(`\nB. последняя дата < ${utcToday} без recurrence: ${overdue.length}`);
for (const r of overdue.sort((x, y) => (x.end_date || x.start_date).localeCompare(y.end_date || y.start_date))) {
  console.log(`  ${r.id.slice(0, 8)} | ${r.start_date} -> ${r.end_date || '—'} | ${r.source_type} | ${r.city} | ${r.title.slice(0, 50)}`);
}
const recurring = live.filter(r => r.recurrence && ((r.end_date || r.start_date) || '') < utcToday).length;
console.log(`   (с recurrence и прошедшей датой — законно, не считаются: ${recurring})`);
