// Точка «События»: перепись мусорного/битого поля recurrence у живых карточек.
// Класс: recurrence = "[object Object]" (объект превратился в строку) — такая карточка
// навсегда защищена от archive-past, даже если событие давно прошло.
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
const rows = await selectAll(db, 'events', 'id,title,title_ru,status,city,start_date,start_time,end_date,recurrence,source_type,website,created_at');
const live = rows.filter((r) => r.status !== 'archived');
const today = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10); // МСК-день
const junk = live.filter((r) => r.recurrence && /\[object|undefined|null|NaN/.test(String(r.recurrence)));
const clean = live.filter((r) => r.recurrence && !/\[object|undefined|null|NaN/.test(String(r.recurrence)));
const past = live.filter((r) => r.start_date && r.start_date < today);
const pastJunk = past.filter((r) => junk.includes(r));
console.log('живых', live.length, '| с recurrence', live.filter((r) => r.recurrence).length,
  '| мусорный recurrence', junk.length, '| чистый', clean.length);
console.log('прошедших (start_date < ' + today + ')', past.length, '| из них с мусорным recurrence', pastJunk.length);
for (const r of junk) {
  console.log([r.id.slice(0, 8), r.status, r.city, r.start_date, r.start_time || '-', JSON.stringify(r.recurrence).slice(0, 60),
    (r.title_ru || r.title || '').slice(0, 40), r.source_type, r.created_at.slice(0, 16)].join(' | '));
}
console.log('--- распределение значений recurrence ---');
const dist = {};
for (const r of live) { if (r.recurrence) dist[JSON.stringify(r.recurrence).slice(0, 70)] = (dist[JSON.stringify(r.recurrence).slice(0, 70)] || 0) + 1; }
for (const [k, v] of Object.entries(dist).sort((a, b) => b[1] - a[1])) console.log(v, k);
