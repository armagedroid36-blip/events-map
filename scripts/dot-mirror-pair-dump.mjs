import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
const db = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });
const ids = ['4ea76971', 'f582be45', 'af77fa99', 'e2f0b0e2'];
const all = await selectAll(db, 'events',
  'id,title,title_ru,title_en,city,address,start_date,start_time,end_date,end_time,status,website,source_type,lat,lng,photos,created_at,description_ru',
  { filter: (q) => q.in('status', ['active', 'moderation']) });
const data = all.filter((r) => ids.some((i) => r.id.startsWith(i)));
for (const r of data) {
  console.log(JSON.stringify({
    id: r.id.slice(0, 8), st: r.status, d: r.start_date, t: r.start_time, ed: r.end_date, et: r.end_time,
    city: r.city, addr: r.address, geo: [r.lat, r.lng], site: r.website, stype: r.source_type,
    ph: (r.photos || []).length, cr: r.created_at, ru: r.title_ru, en: r.title_en,
  }));
}
