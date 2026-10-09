import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
const rows = await selectAll(db, 'events', 'id,status,title,start_date,lat,lng,city');
const live = rows.filter(r => r.status === 'active');
console.log('всего строк:', rows.length, '| живых active:', live.length);
const b = live.filter(r => r.start_date === '2026-11-14' && /bubble/i.test(r.title));
console.log('Bubble 14.11 живых:', b.length, b.map(r => r.id.slice(0,8)).join(','));
