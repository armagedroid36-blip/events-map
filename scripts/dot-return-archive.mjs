// Возврат конкретных ложно-архивированных карточек в moderation (по префиксу id).
// Страховки: карточка должна быть archived и с будущей датой; статус не «active» не трогаем.
// Запуск: node --env-file=.env scripts/dot-return-archive.mjs <префикс...> [--apply]
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const APPLY = process.argv.includes('--apply');
const db = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });
const TODAY = new Date().toISOString().slice(0, 10);
const rows = await selectAll(db, 'events', 'id,title,title_ru,status,start_date,city');
const want = process.argv.slice(2).filter((s) => !s.startsWith('--')).map((s) => s.toLowerCase());
const ids = [];
for (const r of rows) {
  if (!want.some((w) => String(r.id).toLowerCase().startsWith(w))) continue;
  const ok = r.status === 'archived' && (r.start_date || '') >= TODAY;
  console.log(`${ok ? 'OK ' : 'ПРОПУСК'} ${String(r.id).slice(0, 8)} ${r.status} ${(r.start_date || '').slice(0, 10)} «${(r.title_ru || r.title || '').slice(0, 55)}»`);
  if (ok) ids.push(r.id);
}
if (!APPLY) { console.log(`\nDRY: к возврату ${ids.length} (--apply для записи)`); process.exit(0); }
let done = 0;
for (let i = 0; i < ids.length; i += 50) {
  const { data, error } = await db.from('events').update({ status: 'moderation' }).in('id', ids.slice(i, i + 50)).select('id');
  if (error) { console.error('ошибка:', error.message); continue; }
  done += (data || []).length;
}
console.log(`возвращено в moderation: ${done}`);
