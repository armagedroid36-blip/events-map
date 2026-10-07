import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });
let rows = [];
for (let i = 0; i < 4; i++) {
  const { data, error } = await db.from('events')
    .select('id,title,city,start_date,created_at,auto_review,source_type')
    .in('status', ['moderation', 'needs_changes', 'rejected'])
    .order('created_at', { ascending: false })
    .limit(60);
  if (!error) { rows = data; break; }
  console.log('retry', error.message);
  await new Promise(r => setTimeout(r, 2500));
}
const byReason = {};
for (const r of rows) {
  const ar = r.auto_review || {};
  const key = (ar.verdict || 'нет') + ' | ' + String(ar.reason || '').slice(0, 70);
  byReason[key] = (byReason[key] || 0) + 1;
}
console.log('строк в очереди:', rows.length);
for (const [k, v] of Object.entries(byReason).sort((a, b) => b[1] - a[1])) console.log(v, k);
console.log('---');
for (const r of rows) console.log(String(r.id).slice(0, 8), (r.created_at || '').slice(0, 16), (r.city || '-'), (r.title || '').slice(0, 42));
