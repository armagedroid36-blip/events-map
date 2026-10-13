// Точка «События»: ЖИВЫЕ карточки Cyprus Now на ОДНОЙ точке площадки с пересечением дат —
// симптом класса «две записи ленты CN = одно событие» (штатный дедуп слеп, когда названия
// не дают общих слов: «Night of the Dead» ↔ «Noche de los Muertos»). Только чтение.
// Пара выводится целиком; решение по паре принимается по арбитру (страница промоутера /
// страница CN), ремонт — `dot-lang-dupe-fix.mjs` (keep/drop + цитаты арбитров).
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const SUPA_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const db = createClient(SUPA_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });

const rows = await selectAll(db, 'events', 'id, title, title_ru, city, start_date, start_time, end_date, lat, lng, status, website');
const live = rows.filter((r) => r.status === 'active' && (r.website || '').includes('cyprusnow.app'));
const key = (r) => `${Number(r.lat).toFixed(5)},${Number(r.lng).toFixed(5)}`;
const groups = new Map();
for (const r of live) {
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
const out = [];
for (const [k, list] of groups) {
  if (list.length < 2) continue;
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      if (overlap(list[i], list[j])) out.push([k, list[i], list[j]]);
    }
  }
}
console.log(`живых карточек CN: ${live.length}; площадок с 2+ карточками: ${[...groups.values()].filter((l) => l.length > 1).length}; пар с пересечением дат: ${out.length}`);
for (const [k, a, b] of out) {
  const t = (r) => (r.title_ru || r.title || '').slice(0, 62);
  console.log(`\n[${k}]`);
  console.log(`  A ${a.id.slice(0, 8)} ${a.start_date} ${a.start_time || ''} - ${a.end_date || ''} | ${t(a)}`);
  console.log(`     ${a.website}`);
  console.log(`  B ${b.id.slice(0, 8)} ${b.start_date} ${b.start_time || ''} - ${b.end_date || ''} | ${t(b)}`);
  console.log(`     ${b.website}`);
}
