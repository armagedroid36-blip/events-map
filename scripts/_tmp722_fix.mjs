import { createClient } from '@supabase/supabase-js';
const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });
const { data: rows, error } = await db.from('events').select('id,title,city,start_date,end_date,website,status').ilike('website', '%9-musical-images-2026%');
console.log(rows?.map(r => `${r.id} ${r.status} ${r.start_date}->${r.end_date} ${r.city}`));
const target = rows.find(r => r.id.startsWith('cf902470'));
if (!target) { console.log('target not found'); process.exit(1); }
const { data, error: e2 } = await db.from('events').update({ end_date: '2026-11-13', auto_review: { engine: 'dot-manual', verdict: 'publish', reason: 'тур: Лимасол 13.11, Никосия 14.11, Ларнака 16.11 (страница bz /ru/event/3a86); end_date был окном тура' } }).eq('id', target.id).eq('status', 'active').select('id,start_date,end_date,city,status');
console.log('PATCH:', e2 || data);
