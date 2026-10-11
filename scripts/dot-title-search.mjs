// Точка «События»: поиск карточек по подстроке в названии/адресе/ссылке (только чтение).
// Использование: node --env-file=.env scripts/dot-title-search.mjs <строка>
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const db = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });
const q = (process.argv[2] || '').toLowerCase();
if (!q) { console.log('укажи подстроку: node --env-file=.env scripts/dot-title-search.mjs shrek'); process.exit(0); }

const rows = await selectAll(db, 'events', 'id,status,title,title_ru,title_en,start_date,start_time,end_time,city,address,lat,lng,website,created_at');
const hits = rows.filter((r) => [r.title, r.title_ru, r.title_en, r.address, r.website].some((v) => String(v || '').toLowerCase().includes(q)));
console.log(`найдено ${hits.length} из ${rows.length}`);
for (const r of hits.sort((a, b) => (a.start_date || '').localeCompare(b.start_date || ''))) {
  console.log(`${r.id.slice(0, 8)} [${r.status}] ${r.start_date} ${r.start_time || ''} | ${r.city} | ${(r.title_ru || r.title || '').slice(0, 70)}`);
  console.log(`     адрес: ${(r.address || '—').slice(0, 60)} | пин: ${r.lat},${r.lng} | создана ${(r.created_at || '').slice(0, 16)}`);
  console.log(`     site: ${(r.website || '—').slice(0, 110)}`);
}
