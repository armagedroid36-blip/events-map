// dot479d: восстановление событий, потерянных взаимной архивацией (обе копии ушли в archived, живых нет)
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const APPLY = process.argv.includes('--apply');
const db = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });
const TODAY = new Date().toISOString().slice(0, 10);

// группы: событие -> все архивные копии (будущие), выбор одной карточки
const GROUPS = {
  'Джон Клиз 10.11': ['0883d956', '6f07b75c'],
  'Lefkara Classic 15.11': ['3a8400bb', '3bab2698', 'd80057bd'],
  'Kambos Mountain Race 17.01': ['3b72a4df', '3eb19ab3', 'e3ca9a17'],
  'Leptos 4-day challenge 25.11': ['4a8ae5ce', '57d775cb', 'de6b73d6'],
};
const all = await selectAll(db, 'events', 'id,title,title_ru,city,start_date,status,website,description,photos,source_type', { filter: (q) => q.in('status', ['active', 'moderation', 'archived']) });
const byId = new Map(all.map((r) => [r.id, r]));
const find = (p) => all.find((r) => r.id.startsWith(p));

for (const [name, prefixes] of Object.entries(GROUPS)) {
  const rows = prefixes.map(find).filter(Boolean);
  console.log(`\n${name}: живых ${rows.filter((r) => r.status !== 'archived').length}`);
  for (const r of rows) console.log(`  ${r.id.slice(0, 8)} ${r.status} ${r.start_date} desc ${(r.description || '').length} photos ${(r.photos || []).length} «${(r.title_ru || r.title).slice(0, 45)}»`);
  const liveRow = rows.find((r) => r.status !== 'archived');
  if (liveRow) { console.log('  уже есть живая — не трогаю'); continue; }
  const pick = [...rows].sort((a, b) => ((b.description || '').length + (b.photos || []).length * 100) - ((a.description || '').length + (a.photos || []).length * 100))[0];
  console.log(`  ВЫБРАН ${pick.id.slice(0, 8)}`);
  if (!APPLY) continue;
  const { data, error } = await db.from('events').update({ status: 'moderation' }).eq('id', pick.id).eq('status', 'archived').select('id,status,title,start_date');
  console.log(error ? `  ОШИБКА ${error.message}` : `  restored: ${data.length} ${data[0]?.status} ${data[0]?.start_date}`);
}
if (APPLY) {
  const counts = {};
  const fresh = await selectAll(db, 'events', 'id,status', { filter: (q) => q.gte('start_date', TODAY) });
  for (const r of fresh) counts[r.status] = (counts[r.status] || 0) + 1;
  console.log('\nстатусы будущих:', JSON.stringify(counts));
}
