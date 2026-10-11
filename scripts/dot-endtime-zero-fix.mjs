// Ремонт данных: у живых карточек заглушка «окончание 00:00» в тот же день, что и начало
// (end_time 00:00 при end_date = start_date, начало позже 00:00) означает «окончание
// неизвестно» — источник отдаёт endDate = началу дня (Cyprus Now, cyprus.bz, Балифорум).
// Такая пара печаталась на карточке как «16:00 – 00:00» и делала событие «прошедшим»
// с полуночи. Скрипт обнуляет ТОЛЬКО end_time; end_date, время начала, пин и адрес не трогает.
// DRY по умолчанию, APPLY=1 — запись.
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const APPLY = process.env.APPLY === '1';
const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
const rows = await selectAll(db, 'events', 'id,title,title_ru,city,start_date,start_time,end_date,end_time,status,website');
const live = rows.filter((r) => ['active', 'moderation'].includes(r.status));
const targets = live.filter((r) => r.end_time === '00:00:00'
  && (r.end_date ?? r.start_date) === r.start_date
  && r.start_time && r.start_time > '00:00:00');

console.log('живых', live.length, '| кандидатов', targets.length);
let ok = 0, bad = 0;
for (const r of targets) {
  const label = [r.id.slice(0, 8), r.start_date, r.start_time, '→', r.end_time, r.city,
    (r.title_ru || r.title || '').slice(0, 40), r.website || '-'].join(' | ');
  if (!r.website && !r.city) { console.log('ОТКЛОНЕНО (нет источника):', label); bad++; continue; }
  if (!APPLY) { console.log('DRY', label); continue; }
  const { data, error } = await db.from('events').update({ end_time: null }).eq('id', r.id).select('id,start_date,start_time,end_time,end_date,status');
  if (error || !data?.length) { console.log('ОШИБКА', label, error?.message || 'нет строк'); bad++; continue; }
  const row = data[0];
  if (row.end_time !== null || row.status !== r.status || row.start_date !== r.start_date || row.start_time !== r.start_time) {
    console.log('ОТКЛОНЕНО (контроль чтением не совпал):', label, JSON.stringify(row)); bad++; continue;
  }
  console.log('ОК', label, '→ end_time', row.end_time, '| status', row.status, '| start', row.start_date, row.start_time);
  ok++;
}
console.log(APPLY ? `Итог: обнулено ${ok}, ошибок ${bad}` : `DRY: к правке ${targets.length}, проверить ${bad}`);
