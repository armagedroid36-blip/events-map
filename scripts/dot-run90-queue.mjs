// Зонд очереди запуска 90: только счётчики (head+count), чтобы не тянуть jsonb-поля
import { createClient } from '@supabase/supabase-js';

const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });

async function cnt(filter) {
  let lastErr = '';
  for (let i = 0; i < 5; i++) {
    let q = db.from('events').select('id', { count: 'exact', head: true });
    if (filter) q = filter(q);
    const { count, error } = await q;
    if (!error) return count;
    lastErr = error.message;
    await new Promise(r => setTimeout(r, 2000));
  }
  return `ОШИБКА (${lastErr})`;
}

console.log('total      :', await cnt());
console.log('active     :', await cnt(q => q.eq('status', 'active')));
console.log('moderation :', await cnt(q => q.eq('status', 'moderation')));
console.log('needs_chg  :', await cnt(q => q.eq('status', 'needs_changes')));
console.log('rejected   :', await cnt(q => q.eq('status', 'rejected')));

const { data, error } = await db.from('events')
  .select('id,title,status,created_at')
  .eq('status', 'moderation')
  .order('created_at', { ascending: false })
  .limit(5);
if (error) console.log('хвост очереди: ошибка', error.message);
else console.log('последние в очереди:', data.map(r => `${r.id.slice(0, 8)} ${r.created_at} ${String(r.title).slice(0, 30)}`).join(' | '));
