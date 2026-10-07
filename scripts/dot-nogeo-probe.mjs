// Точка «События»: живая карточка без координат (пин не поставить) + карточки без города.
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
const rows = await selectAll(db, 'events', 'id,title,title_ru,city,address,lat,lng,status,start_date,start_time,source_type,website,created_at');
const live = rows.filter((r) => r.status !== 'archived');
const noGeo = live.filter((r) => r.lat == null || r.lng == null);
const noCity = live.filter((r) => !r.city);
console.log('живых', live.length, '| без координат', noGeo.length, '| без города', noCity.length);
for (const r of [...noGeo, ...noCity]) {
  console.log([r.id, r.status, r.city || '—', r.address || '—', r.start_date || '-', r.start_time || '-',
    (r.title_ru || r.title || '').slice(0, 60), r.source_type, r.website || '-', r.created_at].join(' | '));
}
