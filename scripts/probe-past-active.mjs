// Почему archive-past.mjs не забирает 78 active с прошедшей датой старше суток?
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });
const rows = await selectAll(db, 'events', 'id, title, city, status, start_date, end_date, recurrence, source_type, website');
const now = Date.now();
const today = new Date().toISOString().slice(0, 10);

const past = rows.filter((r) => r.status === 'active' && r.start_date && Date.parse(r.start_date) < now - 864e5);
console.log('active с прошедшей датой (старше суток):', past.length, '| сегодня(UTC):', today);

const buckets = { endFilledFutureOrToday: [], endFilledPast: [], endNullRec: [], endNullNoRec: [], endNullOther: [] };
for (const r of past) {
  const rec = r.recurrence;
  const hasRec = Boolean(rec && typeof rec === 'object' && !Array.isArray(rec) && typeof rec.freq === 'string' && rec.freq);
  if (r.end_date) {
    if (r.end_date < today) buckets.endFilledPast.push(r);
    else buckets.endFilledFutureOrToday.push(r);
  } else if (hasRec) buckets.endNullRec.push(r);
  else if (rec === undefined || rec === null || rec === 'null') buckets.endNullNoRec.push(r);
}
const counts = Object.entries(buckets).map(([k, v]) => `${k}: ${v.length}`).join(' | ');
console.log(counts);

const show = (name, arr, n = 6) => {
  console.log(`\n== ${name} ==`);
  for (const r of arr.slice(0, n)) {
    console.log(`  ${r.id.slice(0, 8)} | ${r.start_date} -> ${r.end_date || '(нет)'} | rec=${JSON.stringify(r.recurrence)} | ${r.source_type || '-'} | ${(r.city || '')} | ${(r.title || '').slice(0, 40)}`);
  }
};
show('end_date в прошлом (должны были уйти)', buckets.endFilledPast);
show('end_date сегодня/в будущем (стартовали, ещё идут)', buckets.endFilledFutureOrToday);
show('end_date пусто + есть правило повтора', buckets.endNullRec);
show('end_date пусто + правила нет', buckets.endNullNoRec);
show('end_date пусто + странный recurrence', buckets.endNullOther, 3);

// По городам, чтобы понять охват
const ap = {};
for (const r of past) ap[r.city || '∅'] = (ap[r.city || '∅'] || 0) + 1;
console.log('\nпо городам:', Object.entries(ap).sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c}:${n}`).join(', '));
