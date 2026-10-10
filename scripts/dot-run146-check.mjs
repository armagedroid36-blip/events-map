import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE, {
  auth: { persistSession: false },
});

const sel = 'id,status,city,title,title_ru,start_date,start_time,address,lat,lng,website,created_at,source_type,auto_review';

async function show(label, q) {
  const { data, error } = await q.select(sel);
  console.log('---', label, '---');
  if (error) { console.log('ERR', error.message); return; }
  for (const r of data || []) {
    console.log([r.id.slice(0, 8), r.status, r.city, r.start_date, r.start_time, r.lat + ',' + r.lng,
      (r.title_ru || r.title || '').slice(0, 55), (r.website || '').slice(-45),
      (r.auto_review ? JSON.stringify(r.auto_review).slice(0, 90) : '')].join(' | '));
  }
  if (!data || !data.length) console.log('(пусто)');
}

await show('Никосия 2026-10-24', db.from('events').select(sel).eq('start_date', '2026-10-24').ilike('city', '%Никосия%'));
await show('только что созданные (created_at >= 04:40Z)', db.from('events').select(sel).gte('created_at', '2026-10-10T04:40:58Z'));
await show('moderation сейчас', db.from('events').select(sel).in('status', ['moderation', 'needs_changes']));
