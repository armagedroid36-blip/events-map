// Читающий зонд: живые карточки source_type=theatre (и карточки без start_time) — полный дамп полей.
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
const rows = await selectAll(db, 'events', 'id,title,title_en,title_ru,city,start_date,end_date,start_time,end_time,status,website,source_type,address,recurrence,photos');
const today = new Date().toISOString().slice(0, 10);
const live = rows.filter((r) => ['active', 'moderation'].includes(r.status));
const th = live.filter((r) => r.source_type === 'theatre');
console.log('живых', live.length, '| theatre', th.length, '| сегодня', today);
for (const r of th) {
  const host = (() => { try { return new URL(r.website).host; } catch { return '-'; } })();
  console.log([r.id.slice(0, 8), r.status, r.start_date, r.end_date || '-', r.start_time ? String(r.start_time).slice(0, 5) : 'нет', (r.end_time ? String(r.end_time).slice(0, 5) : '-'), r.city, host, (r.recurrence ? 'REC:' + JSON.stringify(r.recurrence).slice(0, 30) : ''), (r.title || '').slice(0, 45)].join(' | '));
}
const past = live.filter((r) => r.start_date < today && !r.recurrence && (!r.end_date || r.end_date < today));
console.log('== active/mod с датой в прошлом и БЕЗ будущего конца (кандидаты на архив):', past.length);
for (const r of past) console.log([r.id.slice(0, 8), r.status, r.start_date, r.end_date || '-', r.city, (r.title || '').slice(0, 45)].join(' | '));
