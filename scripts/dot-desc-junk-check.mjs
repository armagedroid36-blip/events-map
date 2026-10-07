// Юнит-проверка фильтра ярлыков-описаний на РЕАЛЬНЫХ строках базы + синтетика.
// Запуск: node --env-file=.env scripts/dot-desc-junk-check.mjs
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
import { isJunkDescription } from './desc-junk.mjs';

const JUNK = ['Balletto di Milano', 'Lineup', 'TBA', 'Состав', 'Dance', 'Music'];
const REAL = [
  'Balletto di Milano привозит «Шехеразаду» — вечер балета в двух отделениях.',
  'Соревнования по теннису для спортсменов до 16 лет, на которых ожидается около 100 спортсменов.',
  'Ежегодный фестиваль вина: дегустации, кухня, музыка до поздней ночи',
  'Join us for a guided walk through the historic centre of Limassol.',
];

let fail = 0;
for (const s of JUNK) {
  if (!isJunkDescription(s)) {
    console.log('FAIL: ярлык не отсечён →', JSON.stringify(s));
    fail++;
  }
}
for (const s of REAL) {
  if (isJunkDescription(s)) {
    console.log('FAIL: настоящее описание отсечено →', JSON.stringify(s.slice(0, 60)));
    fail++;
  }
}
console.log(`синтетика: ${JUNK.length + REAL.length - fail}/${JUNK.length + REAL.length} OK`);

const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
const rows = await selectAll(db, 'events', 'id,title,title_ru,description,description_ru,status', {
  filter: (q) => q.eq('status', 'active'),
});
const live = rows.map((r) => ({ id: String(r.id).slice(0, 8), t: r.title_ru || r.title || '', d: String(r.description_ru || r.description || '').trim() }));
const junk = live.filter((r) => isJunkDescription(r.d));
const eqTitle = live.filter((r) => r.d && r.d.trim().toLowerCase() === String(r.t).trim().toLowerCase());
console.log(`живых ${live.length}: описаний-ярлыков ${junk.length}, описаний == заголовку ${eqTitle.length}`);
for (const r of junk) console.log(`   ${r.id} ${JSON.stringify(r.d)} | ${String(r.t).slice(0, 60)}`);
process.exit(fail ? 1 : 0);
