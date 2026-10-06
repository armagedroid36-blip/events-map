// Читающий зонд: живые карточки с РАСПЛЫВЧАТЫМ адресом (не место, а описание):
// «загородный», «поможем с транспортом», «при необходимости», «сообщим/вышлем», «эко-резорт».
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const db = createClient(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);

const RE = /(загород|помож|при необходимости|сообщим|вышлем|уточн|эко-?резорт|eco-?resort|скину|в личку|dm\b)/i;

const rows = await selectAll(db, 'events', 'id,status,city,address,start_date,start_time,website,title,title_ru');
const live = rows.filter(r => !['archived', 'rejected'].includes(r.status));
const hit = live.filter(r => r.address && RE.test(r.address));
console.log(`Живых строк: ${live.length}; с расплывчатым адресом: ${hit.length}`);
for (const r of hit) {
  console.log(`${r.id.slice(0, 8)} | ${r.status} | ${r.city} | ${r.start_date} ${r.start_time || '--:--'} | адр=«${r.address}» | ${(r.title_ru || r.title || '').slice(0, 50)} | ${r.website || ''}`);
}
