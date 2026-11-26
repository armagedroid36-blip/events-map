import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE;
if (!url || !key) { console.log('no keys'); process.exit(1); }
const db = createClient(url, key, { auth: { persistSession: false } });
const rows = await selectAll(db, 'events', 'id,title,city,address,website,start_date,end_date,start_time,recurrence,created_at,description', { filter: q => q.eq('status', 'active') });
console.log('active:', rows.length);
const today = new Date().toISOString().slice(0, 10);
const hasRec = r => r.recurrence && typeof r.recurrence === 'object' && Object.keys(r.recurrence).length > 0;
const d = s => new Date(s + 'T00:00:00Z').getTime();
const bad = rows.filter(r => r.end_date && r.start_date && r.end_date < r.start_date);
console.log('end<start:', bad.length, bad.slice(0, 5).map(r => `${r.id.slice(0,8)} ${r.start_date}->${r.end_date} ${r.title.slice(0,40)}`));
const past = rows.filter(r => r.start_date && r.start_date < today && !hasRec(r));
console.log('past, no recurrence:', past.length, past.slice(0, 8).map(r => `${r.id.slice(0,8)} ${r.start_date} end=${r.end_date} ${r.title.slice(0,40)}`));
const longSpan = rows.filter(r => r.end_date && r.start_date && (d(r.end_date) - d(r.start_date)) / 86400000 > 7);
console.log('span>7d:', longSpan.length, longSpan.map(r => `${r.id.slice(0,8)} ${r.start_date}->${r.end_date} ${r.city} ${r.title.slice(0,35)}`));
const bySite = new Map();
for (const r of rows) if (r.website) { const k = r.website; bySite.set(k, (bySite.get(k) || []).concat(r)); }
const dupSite = [...bySite.entries()].filter(([, v]) => v.length > 1);
console.log('same website groups:', dupSite.length, dupSite.slice(0, 6).map(([k, v]) => `${k.slice(-50)} x${v.length} ${v.map(r => r.start_date).join(',')}`));
const byKey = new Map();
for (const r of rows) { const k = `${r.title}|${r.start_date}`; byKey.set(k, (byKey.get(k) || []).concat(r)); }
const dupKey = [...byKey.values()].filter(v => v.length > 1);
console.log('same title|date:', dupKey.length, dupKey.slice(0, 5).map(v => `${v[0].start_date} x${v.length} ${v[0].title.slice(0,40)}`));
