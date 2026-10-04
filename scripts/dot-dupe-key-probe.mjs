// Проба: какие поля совпадают у подтверждённых живых дублей (разные URL/перевод).
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const db = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });
const ids = ['b2cc4009', 'f95dbe91', '049db195', '1fe08f94', '268a8753', 'c23a94c3', '04f731ea', 'c8db8664', 'cd50ee20'];
const all = await selectAll(db, 'events', 'id,title,title_ru,title_en,city,address,start_date,start_time,end_date,end_time,status,website,source_type,lat,lng,photos,description,description_ru,description_en,created_at');
const liveActive = all.filter((r) => r.status === 'active').length;
console.log('всего строк', all.length, 'active', liveActive);
for (const row of all) {
  if (!ids.some((p) => row.id.startsWith(p))) continue;
  console.log('---', row.id.slice(0, 8), row.status, row.source_type);
  console.log('   title   :', JSON.stringify(row.title));
  console.log('   title_ru:', JSON.stringify((row.title_ru || '').slice(0, 90)));
  console.log('   title_en:', JSON.stringify((row.title_en || '').slice(0, 90)));
  console.log('   city/addr:', JSON.stringify(row.city), '|', JSON.stringify(row.address));
  console.log('   date/time:', row.start_date, row.start_time, '->', row.end_date, row.end_time);
  console.log('   lat/lng:', row.lat, row.lng, '| photo:', (row.photos || []).length, '| desc:', !!row.description, !!row.description_ru, !!row.description_en, '| created:', row.created_at);
  console.log('   url:', row.website);
}
