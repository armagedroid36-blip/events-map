// Класс «координаты-заглушки (центр города)» для Нячанга/Дананга (+ прочих центров)
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });
const STUBS = [
  ['Нячанг', 12.2388, 109.1967],
  ['Дананг', 16.0544, 108.2022],
];
const all = await selectAll(db, 'events', 'id,title,title_ru,city,address,lat,lng,start_date,status,website,created_at');
const near = (a, b) => Math.abs(a - b) < 0.0008;
for (const [name, la, ln] of STUBS) {
  const rows = all.filter((r) => r.status === 'active' && r.lat != null && near(r.lat, la) && near(r.lng, ln));
  console.log(`=== ${name}: active на центровой точке ${la},${ln} — ${rows.length}`);
  const noAddr = rows.filter((r) => !r.address).length;
  console.log(`   из них без адреса: ${noAddr}`);
  const bySrc = {};
  for (const r of rows) {
    const s = r.website ? (r.website.match(/t\.me\/([^/]+)/) || ['', new URL(r.website).hostname])[1] : '(нет)';
    bySrc[s] = (bySrc[s] || 0) + 1;
  }
  console.log('   источники:', JSON.stringify(bySrc));
  for (const r of rows.slice(0, 12)) {
    console.log('  ', r.id.slice(0, 8), r.start_date, r.address ? r.address.slice(0, 40) : 'АДРЕС=НЕТ', '|', (r.title_ru || r.title || '').slice(0, 38));
  }
}
