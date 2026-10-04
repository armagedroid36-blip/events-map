// Контроль двух вещей: (1) прошедшие неархивные карточки после archive-past,
// (2) кто остался в живых по слоту Никосия 10.10 (не архивирован ли живой близнец).
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const db = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });
const all = await selectAll(db, 'events', 'id,title,title_ru,city,address,start_date,end_date,status,website,created_at,auto_review');
const now = new Date().toISOString();
const past = all.filter((r) => r.start_date < now && r.status !== 'archived');
console.log('ПРОШЕДШИХ НЕАРХИВНЫХ:', past.length);
for (const r of past) console.log('  ', r.id, r.status, r.start_date, r.title_ru || r.title, '| end', r.end_date);

console.log('--- Никосия 2026-10-10 ---');
for (const r of all.filter((r) => (r.start_date || '').startsWith('2026-10-10') && (r.city || '').includes('Никос'))) {
  console.log('  ', r.id, r.status, r.start_date, '->', r.end_date, (r.title_ru || r.title || '').slice(0, 60), '|', (r.address || '').slice(0, 40), '|', (r.website || '').slice(0, 60), '| созд', r.created_at);
}
