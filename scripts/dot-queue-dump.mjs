// Точка «События»: дамп очереди модерации с причинами (auto_review) — только чтение.
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const SUPA_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const db = createClient(SUPA_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });

const rows = await selectAll(db, 'events', 'id,status,title,title_ru,start_date,city,source_type,website,auto_review,created_at');
const today = new Date().toISOString().slice(0, 10);
const queue = rows.filter(r => ['moderation', 'needs_changes', 'rejected'].includes(r.status));
console.log('ОЧЕРЕДЬ', queue.length, '| всего', rows.length);
for (const r of queue.sort((a, b) => (a.start_date || '').localeCompare(b.start_date || ''))) {
  const ar = r.auto_review || {};
  const verdict = ar.verdict || ar.status || ar.decision || '';
  const reason = (ar.reason || ar.notes || ar.message || '').toString().slice(0, 160);
  console.log('---', r.id.slice(0, 8), r.status, r.start_date, '|', r.city, '|', r.source_type, '| прошло:', r.start_date < today ? 'ДА' : 'нет');
  console.log('    ', (r.title_ru || r.title || '').slice(0, 90));
  console.log('    вердикт:', verdict, '| причина:', reason);
  console.log('    site:', (r.website || '').slice(0, 110));
  if (ar && Object.keys(ar).length && !verdict && !reason) console.log('    auto_review:', JSON.stringify(ar).slice(0, 300));
}
