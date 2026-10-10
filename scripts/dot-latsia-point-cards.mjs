// dot-latsia-point-cards.mjs — читающий зонд: ЖИВЫЕ карточки, стоящие на точке Латсии
// 35.1063639,33.3782668 (её Cyprus Now раздаёт РАЗНЫМ площадкам Латсии: Latsia Municipal Theatre,
// Silva Education Centre). Печатает площадку/адрес каждой, чтобы видеть размер класса.
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });
const PT = { lat: 35.1063639, lng: 33.3782668 };
const TOL = 0.0005; // ~55 м

const rows = await selectAll(db, 'events', 'id,status,title,title_ru,city,address,lat,lng,start_date,website');
const live = rows.filter((r) => ['active', 'moderation', 'needs_changes'].includes(r.status));
const onPt = live.filter((r) => Math.abs(Number(r.lat) - PT.lat) < TOL && Math.abs(Number(r.lng) - PT.lng) < TOL);
console.log(`живых ${live.length}, на точке Латсии ${onPt.length}`);
for (const r of onPt.sort((a, b) => String(a.start_date).localeCompare(String(b.start_date)))) {
  console.log(`${String(r.id).slice(0, 8)} [${r.status}] ${r.start_date} | ${r.title_ru || r.title} | ${r.address} | ${r.lat},${r.lng}`);
  console.log(`    сайт: ${r.website || '-'}`);
}
