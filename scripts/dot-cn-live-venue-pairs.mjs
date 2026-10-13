// Точка «События»: ЖИВЫЕ карточки Cyprus Now на ОДНОЙ точке площадки с пересечением дат —
// симптом класса «две записи ленты CN = одно событие» (штатный дедуп слеп, когда названия
// не дают общих слов: «Night of the Dead» ↔ «Noche de los Muertos»). Только чтение.
// Пара выводится целиком; решение по паре принимается по арбитру (страница промоутера /
// страница CN), ремонт — `dot-lang-dupe-fix.mjs` (keep/drop + цитаты арбитров).
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const SUPA_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const db = createClient(SUPA_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });

// Центровые константы городов: карточка с адресом уровня города стоит ровно на них,
// у такой «площадки» лежат РАЗНЫЕ события города — пары по ней шум (см. 217: 94 пары).
const CENTROIDS = [['Никосия', 35.1855659, 33.3822764], ['Лимасол', 34.7071, 33.0226], ['Пафос', 34.7754, 32.4246], ['Ларнака', 34.9182, 33.6194], ['Фамагуста', 35.1205, 33.9432]];
const onCentroid = (r) => CENTROIDS.some(([c, la, ln]) => Math.abs(r.lat - la) < 0.0005 && Math.abs(r.lng - ln) < 0.0005);

const rows = await selectAll(db, 'events', 'id, title, title_ru, city, start_date, start_time, end_date, lat, lng, status, website');
const live = rows.filter((r) => r.status === 'active' && (r.website || '').includes('cyprusnow.app'));
const onFallback = live.filter((r) => r.lat && r.lng && onCentroid(r));
const pinpoints = live.filter((r) => r.lat && r.lng && !onCentroid(r));
const key = (r) => `${Number(r.lat).toFixed(5)},${Number(r.lng).toFixed(5)}`;
const groups = new Map();
for (const r of pinpoints) {
  if (!r.lat || !r.lng) continue;
  const k = key(r);
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(r);
}
const overlap = (a, b) => {
  const as = a.start_date, ae = a.end_date || a.start_date;
  const bs = b.start_date, be = b.end_date || b.start_date;
  return as <= be && bs <= ae;
};
const isInterval = (r) => (r.end_date || r.start_date) > r.start_date;
const out = [];
for (const [k, list] of groups) {
  if (list.length < 2) continue;
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      if (overlap(list[i], list[j])) out.push([k, list[i], list[j]]);
    }
  }
}
// Секция 2 — «интервал-фестиваль + day-карточки» (обе стороны разных типов): чаще законно
// (день программы внутри интервала фестиваля), разбирать глазами, не как дубль по умолчанию.
const main = out.filter(([, a, b]) => isInterval(a) === isInterval(b));
const mixed = out.filter(([, a, b]) => isInterval(a) !== isInterval(b));
console.log(`живых карточек CN: ${live.length}; на центровых фолбэках: ${onFallback.length}; с точкой площадки: ${pinpoints.length}`);
console.log(`площадок с 2+ карточками: ${[...groups.values()].filter((l) => l.length > 1).length}; пар с пересечением дат: ${main.length + mixed.length} (подозрительных ${main.length}, «интервал+день» ${mixed.length})`);
const dump = ([k, a, b]) => {
  const t = (r) => (r.title_ru || r.title || '').slice(0, 62);
  console.log(`\n[${k}]`);
  console.log(`  A ${a.id.slice(0, 8)} ${a.start_date} ${a.start_time || ''} - ${a.end_date || ''} | ${t(a)}`);
  console.log(`     ${a.website}`);
  console.log(`  B ${b.id.slice(0, 8)} ${b.start_date} ${b.start_time || ''} - ${b.end_date || ''} | ${t(b)}`);
  console.log(`     ${b.website}`);
};
console.log('\n=== ПОДОЗРИТЕЛЬНЫЕ (одинаковый тип дат) ===');
for (const p of main) dump(p);
console.log('\n=== «ИНТЕРВАЛ + ДЕНЬ» (обычно законно) ===');
for (const p of mixed) dump(p);
