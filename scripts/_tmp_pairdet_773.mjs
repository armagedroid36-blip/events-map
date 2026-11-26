import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
const db = createClient(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
const live = await selectAll(db, 'events', 'id,title,title_ru,source_type,status,start_date,start_time,city,address,website,created_at', { filter: q => q.eq('status', 'active') });
const pre = ['4573fa2a', 'b3c979ed', 'd65eac75', '0b428582', 'b43604c0', 'dade01fa'];
for (const p of pre) {
  for (const r of live.filter(r => r.id.startsWith(p))) console.log(JSON.stringify(r));
}
