import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });
const rows = await selectAll(db, 'events', 'id,title,city,address,website,start_date,end_date,start_time,recurrence,source_type,description', { filter: q => q.eq('status', 'active') });
const m = new Map();
for (const r of rows) if (r.website) m.set(r.website, (m.get(r.website) || []).concat(r));
for (const [k, v] of m) if (v.length > 1) {
  console.log('===', k);
  for (const r of v) console.log(`  ${r.id.slice(0,8)} ${r.start_date}->${r.end_date} ${r.start_time} ${r.city} | ${r.title.slice(0,60)} | rec=${JSON.stringify(r.recurrence)} | ${r.address}`);
}
