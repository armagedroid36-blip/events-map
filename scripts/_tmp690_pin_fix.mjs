// Ремонт 690: пин на центровой константе города -> точка площадки (арбитр — живые двойники той же площадки).
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const db = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });
const APPLY = process.env.APPLY === '1';

// prefix -> { lat, lng, why }
const FIX = {
  '85d7b34d': { lat: 35.1727733, lng: 33.3547078, why: 'Муниципальный театр Никосии: 6 живых карточек адреса, reverse = Δημοτικό Θέατρο Λευκωσίας' },
  '8edc69b0': { lat: 34.9119911, lng: 33.6373825, why: 'Savino Live: 3 живые карточки площадки, reverse = Savino Rock Bar, Скала, Ларнака' },
};

const rows = await selectAll(db, 'events', 'id,title,city,address,lat,lng,status', { filter: q => q.eq('status', 'active') });
console.log('живых', rows.length);

for (const [p, fix] of Object.entries(FIX)) {
  const row = rows.find(r => r.id.startsWith(p));
  if (!row) { console.log(`${p}: НЕ НАЙДЕНА среди active`); continue; }
  console.log(`${p} | ${row.title} | ${row.city} | ${row.address} | было ${row.lat},${row.lng}`);
  if (!APPLY) { console.log(`   DRY -> ${fix.lat},${fix.lng} (${fix.why})`); continue; }
  const { data, error } = await db.from('events').update({ lat: fix.lat, lng: fix.lng })
    .eq('id', row.id).eq('status', 'active').select('id,title,city,address,lat,lng,start_date,start_time');
  if (error) { console.log('   ОШИБКА', error.message); continue; }
  console.log('   PATCH ->', JSON.stringify(data && data[0]));
}
