// Точка «События»: живые карточки с прошедшей датой начала — без правила повтора
// (те, что должен был снять archive-past). Печатает дату, end_date, город, статус.
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
const rows = await selectAll(db, 'events', 'id,title,title_ru,status,city,start_date,start_time,end_date,recurrence,source_type,website,created_at');
const live = rows.filter((r) => r.status !== 'archived');
const today = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
const past = live.filter((r) => r.start_date && r.start_date < today);
const pastNoRec = past.filter((r) => !r.recurrence);
const pastEndFuture = pastNoRec.filter((r) => r.end_date && r.end_date >= today);
console.log('today(МСК)', today, '| живых', live.length, '| прошедших', past.length,
  '| прошедших без recurrence', pastNoRec.length, '| из них с end_date в будущем', pastEndFuture.length);
console.log('--- прошедшие без recurrence');
for (const r of pastNoRec) {
  console.log([r.id.slice(0, 8), r.status, r.city, r.start_date, r.start_time || '-', '..', r.end_date || '-',
    (r.title_ru || r.title || '').slice(0, 40), r.source_type, r.created_at.slice(0, 16)].join(' | '));
}
