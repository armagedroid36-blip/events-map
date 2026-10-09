// Почему карточка уехала в архив: для каждой цели печатаем живых соседей того же дня+города,
// которых считает дублем liveDupeMatch или liveAbbrevMatch (канал склейки).
// Запуск: node --env-file=.env scripts/dot-why-archived.mjs <префикс...>
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
import { cityKey, liveDupeMatch, liveAbbrevMatch } from './live-dupe-key.mjs';

const db = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });
const rows = await selectAll(db, 'events', '*');
const want = process.argv.slice(2).map((s) => s.toLowerCase());
const live = rows.filter((r) => ['active', 'moderation', 'needs_changes'].includes(r.status));
for (const a of rows.filter((r) => want.some((w) => String(r.id).toLowerCase().startsWith(w)))) {
  console.log(`\n--- ${String(a.id).slice(0, 8)} ${a.status} «${(a.title_ru || a.title || '').slice(0, 60)}» ${(a.start_date || '').slice(0, 10)} ${a.city}`);
  let n = 0;
  for (const b of live) {
    if ((b.start_date || '').slice(0, 10) !== (a.start_date || '').slice(0, 10)) continue;
    if (cityKey(b) !== cityKey(a)) continue;
    const d = liveDupeMatch(a, b), ab = liveAbbrevMatch(a, b);
    if (d || ab) { console.log(`   ~${String(b.id).slice(0, 8)} dupe=${d || '-'} abbrev=${ab || '-'} «${(b.title_ru || b.title || '').slice(0, 55)}» ${b.start_time || ''} ${b.address || '-'}`); n++; }
  }
  if (!n) console.log('   (ни один живой сосед не считается дублем текущим ключом)');
}
