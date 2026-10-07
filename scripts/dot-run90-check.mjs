// Читающий зонд запуска 90: тумблер auto_publish + очередь + число карточек, ждущих LLM
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });

const { data: st } = await db.from('app_settings').select('*');
console.log('app_settings:', JSON.stringify(st));

const rows = await selectAll(db, 'events', 'id,status,created_at,source_type,auto_review');
const by = {};
for (const r of rows) by[r.status] = (by[r.status] || 0) + 1;
console.log('всего строк:', rows.length, JSON.stringify(by));

const queue = rows.filter(r => ['moderation', 'needs_changes'].includes(r.status));
console.log('очередь (moderation+needs_changes):', queue.length);
const reasons = {};
for (const r of queue) {
  const reason = (r.auto_review && (r.auto_review.reason || r.auto_review.verdict)) || 'нет auto_review';
  reasons[String(reason).slice(0, 70)] = (reasons[String(reason).slice(0, 70)] || 0) + 1;
}
for (const [k, v] of Object.entries(reasons).sort((a, b) => b[1] - a[1])) console.log('  ', v, '×', k);
const latest = rows.map(r => r.created_at).sort().slice(-3);
console.log('последние created_at:', latest.join(' | '));
