// Аудит: живые карточки Бали, где КАНОН района из адреса расходится с меткой city.
// Только чтение. Запуск: node --env-file=.env scripts/_tmp680_bali_label.mjs
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
import { addressDistrict } from './bali-districts.mjs';

const db = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });
const rows = await selectAll(db, 'events', 'id,title,city,address,status', { order: 'id', filter: (q) => q.eq('status', 'active') });
const bali = rows.filter((r) => (r.city || '').toLowerCase().includes('bali'));
console.log('живых с Бали в метке:', bali.length);
let cand = 0;
for (const r of bali) {
  const canon = addressDistrict(r.address || '');
  if (!canon) continue;
  const label = (r.city || '').split(',')[0].trim();
  if (label.toLowerCase() === canon.toLowerCase()) continue;
  cand++;
  console.log(`${r.id.slice(0, 8)} метка «${r.city}» канон-адрес «${canon}» | ${r.title.slice(0, 55)} | ${(r.address || '').slice(0, 85)}`);
}
console.log('расхождений:', cand);
