// Запуск 696: снять CN-копии пар «bz ↔ CN» найденные зондом dot-cross-source-dupe-probe.
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE;
const db = createClient(url, key, { auth: { persistSession: false } });

// prefix -> [ожидаемый фрагмент названия, канон (prefix)]
const TARGETS = {
  f3f4c909: ['', '68c7ceea'],
  '198c0b95': ['', 'da769dd8'],
  '54c144ad': ['', '2afe8b03'],
  c205eb21: ['', '69eebb9d'],
  '42e79128': ['', '9ace52c9'],
  '1cb96478': ['', 'b68b6637'],
  dc31c6e7: ['', 'c942c368'],
};

const rows = await selectAll(db, 'events', 'id,title,city,start_date,start_time,website,status', { filter: (q) => q.eq('status', 'active') });
console.log('живых', rows.length);
const byPrefix = new Map(rows.map((r) => [String(r.id).slice(0, 8), r]));

const ids = [];
for (const [p, [frag, canon]] of Object.entries(TARGETS)) {
  const r = byPrefix.get(p);
  const c = byPrefix.get(canon);
  if (!r) { console.log('MISS', p); continue; }
  if (!c) { console.log('MISS-CANON', canon, 'для', p); continue; }
  if (!String(r.title).toLowerCase().includes(frag.toLowerCase())) { console.log('SKIP title не совпал', p, r.title); continue; }
  if (!String(r.website || '').includes('cyprusnow.app')) { console.log('SKIP нет CN-ссылки', p, r.website); continue; }
  console.log('ДУБЛЬ', p, '|', r.title, '|', r.start_date, r.start_time, '-> archived; канон', canon, '|', c.title);
  ids.push(r.id);
}

if (!ids.length) { console.log('нечего снимать'); process.exit(0); }

const { data, error } = await db.from('events').update({
  status: 'archived',
  auto_review: { engine: 'dot-manual', verdict: 'reject', reason: 'duplicate: та же запись события у второго источника (одна дата/время/площадка)', at: new Date().toISOString() },
}).in('id', ids).eq('status', 'active').select('id,title,status,website');
if (error) { console.log('ОШИБКА PATCH', error.message); process.exit(1); }
console.log('обновлено', data.length);
for (const d of data) console.log(' archived', String(d.id).slice(0, 8), d.title);

const left = await selectAll(db, 'events', 'id,status', { filter: (q) => q.eq('status', 'active') });
console.log('живых после', left.length);
