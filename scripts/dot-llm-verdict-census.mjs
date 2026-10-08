// Класс «LLM-судья вернул инфраструктурный отказ»: сколько карточек, какие причины, где именно.
import { createClient } from '@supabase/supabase-js';
const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE;
const db = createClient(url, key, { auth: { persistSession: false } });

const { data, error } = await db.from('events')
  .select('id,status,created_at,title,city,website,auto_review')
  .not('auto_review', 'is', null)
  .order('created_at', { ascending: false })
  .limit(1000);
if (error) { console.error('ошибка:', error.message); process.exit(1); }

const byReason = new Map();
const with400 = [];
for (const r of data || []) {
  const ar = r.auto_review;
  const reason = typeof ar === 'object' && ar ? String(ar.reason || '') : String(ar || '');
  const key = reason.slice(0, 45);
  byReason.set(key, (byReason.get(key) || 0) + 1);
  if (/400/.test(reason)) with400.push({ id: r.id, st: r.status, created: r.created_at, title: String(r.title).slice(0, 40), reason, verdict: ar?.verdict, unchecked: ar?.unchecked });
}
console.log('Всего с auto_review:', data.length);
console.log('\nТоп причин:');
[...byReason.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).forEach(([k, v]) => console.log(`  ${v}\t${k}`));

console.log('\nКарточки с HTTP 400 в причине:', with400.length);
for (const c of with400) {
  console.log(`  ${c.id.slice(0, 8)} [${c.st}] ${c.created} verdict=${c.verdict} unchecked=${c.unchecked} | ${c.title}`);
  console.log('    ', c.reason.slice(0, 220));
}
