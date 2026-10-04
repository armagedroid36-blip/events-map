// Проверка: не заархивирована ли карточка с живым близнецом (регресс pickKeeper).
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const db = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });
const all = await selectAll(db, 'events', 'id,title,title_ru,title_en,city,address,start_date,end_date,status,website,created_at');
const t = all.find((r) => r.id.startsWith('302681b8'));
console.log('ЦЕЛЬ:', JSON.stringify(t));
const day = (s) => (s || '').slice(0, 10);
const words = (s) => (s || '').toLowerCase().replace(/[^\p{L}\p{N} ]/gu, ' ').split(/\s+/).filter((w) => w.length > 3);
const twins = all.filter((x) => x.id !== t.id && day(x.start_date) === day(t.start_date) && (day(x.end_date) === day(t.end_date)) &&
  (x.address || '') === (t.address || '') &&
  words(x.title_ru || x.title).filter((w) => words(t.title_ru || t.title).includes(w)).length >= 3);
console.log('БЛИЗНЕЦЫ по ключу dedupe:', twins.map((x) => `${x.id} ${x.status} ${x.title_ru || x.title}`).join(' | ') || 'нет');
// прошедшие активные/очередь (контроль archive-past)
const now = new Date().toISOString();
const past = all.filter((r) => r.start_date < now && ['active', 'needs_changes', 'rejected', 'moderation'].includes(r.status));
console.log('НЕ-active-архив со прошедшей start_date:', past.length, past.map((r) => `${r.id}:${r.status}`).join(','));
