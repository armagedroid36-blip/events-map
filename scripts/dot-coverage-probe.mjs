// Читающий зонд покрытия: сколько ЖИВЫХ будущих событий по городам геофокуса (Бали/Дананг/Нячанг/Кипр).
// Использование: node --env-file=.env scripts/dot-coverage-probe.mjs [днейAhead=60]
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
const ahead = Number(process.argv[2] || 60);
const rows = await selectAll(db, 'events', 'id,status,start_date,end_date,city,country,category_id,source_type,website');

const today = new Date().toISOString().slice(0, 10);
const limit = new Date(Date.now() + ahead * 86400000).toISOString().slice(0, 10);
const live = rows.filter((r) => ['active', 'moderation'].includes(r.status));
const future = live.filter((r) => (r.end_date || r.start_date) >= today && r.start_date <= limit);

const byCountry = {};
const byCity = {};
for (const r of future) {
  byCountry[r.country || '?'] = (byCountry[r.country || '?'] || 0) + 1;
  const c = r.city || '?';
  byCity[c] = (byCity[c] || 0) + 1;
}
console.log(`всего строк ${rows.length} | живых ${live.length} | будущих в окне ${ahead} дн (${today}..${limit}): ${future.length}`);
console.log('по странам:', JSON.stringify(byCountry, null, 1));
console.log('по городам (топ 25):');
for (const [c, n] of Object.entries(byCity).sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(`  ${n}\t${c}`);

// города геофокуса — отдельная сводка
const focus = ['Убуд', 'Чангу', 'Кута', 'Семиньяк', 'Санур', 'Денпасар', 'Табанан', 'Джимбаран', 'Амед', 'Сидемен', 'Ловина', 'Керобокан',
  'Дананг', 'Нячанг', 'Лимасол', 'Никосия', 'Ларнака', 'Пафос', 'Ая-Напа', 'Протарас', 'Паралимни', 'Фамагуста'];
console.log('геофокус:');
for (const f of focus) {
  const n = future.filter((r) => (r.city || '').includes(f)).length;
  if (!n) console.log(`  !!! 0\t${f}`);
  else console.log(`  ${n}\t${f}`);
}
// события дальше окна
const later = live.filter((r) => r.start_date > limit);
console.log(`живых за окном (start > ${limit}): ${later.length}`);
