import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
const db = createClient(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
const pre = ['4573fa2a', 'b3c979ed', 'd65eac75', '0b428582', 'b43604c0', 'dade01fa'];
const rows = await selectAll(db, 'events', 'id,title,status,start_date,start_time,city', { filter: q => q.in('status', ['active', 'archived']) });
for (const p of pre) for (const r of rows.filter(r => r.id.startsWith(p))) console.log(p, r.status, r.start_date, r.start_time, r.city);
const act = rows.filter(r => r.status === 'active');
console.log('live total:', act.length);
