// Вторая часть разведки: почему столько архивных — прошедшие даты или мусор?
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });
const rows = await selectAll(db, 'events', 'id, city, status, start_date, source_type, created_at');
const now = Date.now();
const future = (r) => r.start_date && Date.parse(r.start_date) > now;

for (const city of ['дананг', 'нячанг', 'убуд, bali', 'чангу, bali', 'печату (улувату), bali', 'лимасол, кипр', 'ая-напа, кипр']) {
  const sub = rows.filter((r) => (r.city || '').toLowerCase() === city);
  const act = sub.filter((r) => r.status === 'active');
  const arch = sub.filter((r) => r.status === 'archived');
  console.log(`${city}: всего ${sub.length} | active ${act.length} (в будущем ${act.filter(future).length}, без даты ${act.filter((r) => !r.start_date).length}) | archived ${arch.length} (в будущем ${arch.filter(future).length})`);
}

const archFuture = rows.filter((r) => r.status === 'archived' && future(r));
console.log('ИТОГО archived, но с БУДУЩЕЙ датой:', archFuture.length);
const ac = {};
for (const r of archFuture) ac[r.city || '∅'] = (ac[r.city || '∅'] || 0) + 1;
console.log('  по городам:', Object.entries(ac).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([c, n]) => `${c}:${n}`).join(', '));

const actPast = rows.filter((r) => r.status === 'active' && r.start_date && Date.parse(r.start_date) < now - 864e5);
console.log('ИТОГО active с ПРОШЕДШЕЙ датой (старше суток):', actPast.length);
const ap = {};
for (const r of actPast) ap[r.city || '∅'] = (ap[r.city || '∅'] || 0) + 1;
console.log('  по городам:', Object.entries(ap).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([c, n]) => `${c}:${n}`).join(', '));
