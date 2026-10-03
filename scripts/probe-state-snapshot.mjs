// Быстрый срез базы для STATE.md
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });
const rows = await selectAll(db, 'events', 'id, status, start_date, end_date, website, city');
const st = {};
for (const r of rows) st[r.status || '∅'] = (st[r.status || '∅'] || 0) + 1;
console.log('всего', rows.length, JSON.stringify(st));
const today = new Date().toISOString().slice(0, 10);
const arch = rows.filter((r) => r.status === 'archived' && r.start_date && r.start_date > today);
console.log('archived с будущей датой:', arch.length);
const noSite = rows.filter((r) => r.status === 'active' && !r.website);
console.log('active без website:', noSite.length);
const activeFuture = rows.filter((r) => r.status === 'active' && r.start_date && r.start_date >= today);
console.log('active с датой сегодня/в будущем:', activeFuture.length);
