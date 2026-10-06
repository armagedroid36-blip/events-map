// Зонд: все карточки с страницей-листингом danang365 «show-dien-2» — кто держит какие URL.
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE;
const db = createClient(url, key, { auth: { persistSession: false } });

const rows = await selectAll(db, 'events', 'id,title,title_en,title_ru,status,start_date,start_time,city,address,website,recurrence,source_type,created_at');
const hit = rows.filter((r) => String(r.website || '').includes('show-dien-2'));
console.log(`строк с этим листингом: ${hit.length}`);
for (const r of hit.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))) {
  console.log(`${r.id.slice(0, 8)} | ${r.status} | ${r.start_date} ${r.start_time || '-'} | ${r.city} | title=${r.title} | en=${r.title_en || '-'} | адр=${r.address || 'НЕТ'} | ${r.website} | recur=${r.recurrence ? JSON.stringify(r.recurrence) : '-'} | ${r.created_at}`);
}
