import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
const db = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });
const all = await selectAll(db, 'events', 'id,title,title_ru,city,address,lat,lng,status,website,start_date');
const C = [{ n: 'Нячанг', lat: 12.2388, lng: 109.1967 }, { n: 'Дананг', lat: 16.0544, lng: 108.2022 }];
for (const c of C) {
  for (const r of all.filter((x) => x.status === 'active' && x.lat != null && Math.abs(x.lat - c.lat) < 0.0008 && Math.abs(x.lng - c.lng) < 0.0008)) {
    console.log([r.id.slice(0, 8), c.n, r.start_date, (r.address || 'АДРЕС=НЕТ').slice(0, 90), '|', (r.title_ru || r.title).slice(0, 45), '|', r.website].join(' ~ '));
  }
}
