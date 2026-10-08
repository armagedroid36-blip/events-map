import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });
const want = { ed200c34:'active', '09a142aa':'archived', '5f0a1b94':'active', '0ac76029':'archived', '4de25efe':'active', '268e5e70':'archived', a3d16f5f:'active', '1685ff91':'archived' };
const rows = await selectAll(db, 'events', 'id,status,lat,lng,city,address,start_date,start_time,photos');
console.log('всего строк', rows.length);
for (const [k, v] of Object.entries(want)) {
  const r = rows.find((x) => x.id.startsWith(k));
  console.log(k, r ? `${r.status} ${r.status === v ? 'OK' : 'МИМО(ждём '+v+')'} | ${r.lat},${r.lng} | ${r.city} | ${r.address} | фото ${(r.photos||[]).length}` : 'НЕ НАЙДЕНА');
}
