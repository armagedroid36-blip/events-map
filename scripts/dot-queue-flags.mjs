// Читающий зонд: очередь модерации с флагами auto_review (для разбора «почему висит»).
import { createClient } from '@supabase/supabase-js';
const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
const { data, error } = await db.from('events')
  .select('id,status,title,created_at,auto_review')
  .in('status', ['moderation', 'needs_changes', 'rejected'])
  .order('created_at', { ascending: false }).limit(100);
if (error) { console.error('ОШИБКА:', error.message); process.exit(1); }
console.log('в очереди:', data.length);
for (const r of data) {
  const ar = r.auto_review || {};
  const infra = (Array.isArray(ar.flags) && ar.flags.includes('unchecked')) || /LLM-проверка недоступна/.test(String(ar.reason || ''));
  console.log([r.id.slice(0, 8), r.status.padEnd(13), (ar.verdict || '-').padEnd(7), (infra ? 'INFRA' : '     '), String(ar.reason || '').slice(0, 70)].join(' | '));
}
