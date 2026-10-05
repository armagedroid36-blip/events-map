// Свод живых копий одной страницы Cyprus.BZ (одна страница — два слага ru/en).
// keep — карточка с фото и пин от площадки; drop — копия-дубль (архив, не удаление).
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const APPLY = process.env.APPLY === '1';
const PAIRS = [
  { keep: '05c07b5e', drop: '5abadaf6', why: 'Grinchmas 19.12 10:30 Лимасол: одна страница cyprus.bz/event/3604 под двумя слагами (/ru/... и /...), названия — разные переводы; keep с фото и пином площадки, drop без фото на центровой точке' },
];

const db = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });
const all = { data: await selectAll(db, 'events', 'id,status,title,city,start_date,start_time,lat,lng,photos,website'), error: null };
const rows = all.data || [];
const find = (p) => rows.find((r) => (r.id || '').startsWith(p));

let ok = 0, err = 0;
for (const { keep, drop, why } of PAIRS) {
  const k = find(keep), d = find(drop);
  if (!k || !d) { console.log(`  НЕ НАЙДЕНО: ${keep} / ${drop}`); err++; continue; }
  console.log(`  keep ${k.id.slice(0, 8)} [${k.status}] фото ${(k.photos || []).length} ${k.lat},${k.lng} | drop ${d.id.slice(0, 8)} [${d.status}] фото ${(d.photos || []).length}`);
  console.log(`   ${why}`);
  if (d.status === 'archived') { console.log('   ужé архив'); continue; }
  if (!APPLY) { console.log('   [dry] архивирую'); continue; }
  const upd = await db.from('events').update({ status: 'archived' }).eq('id', d.id).select('id,status');
  if (upd.error || !upd.data?.length) { console.log(`   ОШИБКА: ${upd.error?.message || '0 строк'}`); err++; continue; }
  ok++;
  const back = await db.from('events').select('id,status').eq('id', d.id);
  console.log(`   архив применён, перечитано: ${back.data?.[0]?.status}`);
}
console.log(`${APPLY ? 'Применено' : 'DRY'} — архивировано ${ok}, ошибок ${err}`);
