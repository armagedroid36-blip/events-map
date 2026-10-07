// Точка «События»: перепись end_date у живых карточек — есть ли «выдуманная» дата окончания
// (источник её не даёт) и расхождения с началом.
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
const rows = await selectAll(db, 'events', 'id,title,status,city,start_date,start_time,end_date,end_time,recurrence,source_type,website,created_at');
const live = rows.filter((r) => r.status !== 'archived');
const withEnd = live.filter((r) => r.end_date);
const endNoTime = withEnd.filter((r) => !r.end_time);
const diff = withEnd.filter((r) => r.end_date !== r.start_date);
const bad = withEnd.filter((r) => r.end_date < r.start_date);
console.log('живых', live.length, '| с end_date', withEnd.length, '| end без end_time', endNoTime.length,
  '| end_date != start_date', diff.length, '| end < start', bad.length);
for (const r of diff) {
  console.log([r.id.slice(0, 8), r.status, r.city, r.start_date, r.start_time || '-', '..', r.end_date, r.end_time || '-',
    (r.title || '').slice(0, 38), (r.source_type || '').slice(0, 9), (r.website || '-').slice(0, 58)].join(' | '));
}
