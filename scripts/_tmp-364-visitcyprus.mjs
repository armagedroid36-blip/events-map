import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
import { isRootUrl } from './site-url.mjs';

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE;
const db = createClient(url, key, { auth: { persistSession: false } });

const rows = await selectAll(db, 'events', 'id,status,city,title,website,start_date,created_at',
  { filter: q => q.in('status', ['active', 'moderation']) });

const roots = rows.filter(r => r.website && isRootUrl(r.website));
console.log('живых:', rows.length, '| корневых ссылок:', roots.length);
for (const r of roots) console.log('  ROOT', r.website, '|', r.city, '|', (r.title || '').slice(0, 45));

const vc = rows.filter(r => r.website && /visitcyprus\.com/.test(r.website));
const vcEvent = vc.filter(r => /\/event\//.test(r.website));
console.log('\nVisitCyprus-ссылок:', vc.length, '| со страницей /event/:', vcEvent.length, '| прочих:', vc.length - vcEvent.length);
console.log('созданных с 18.10:', vc.filter(r => (r.created_at || '') >= '2026-10-18').length);
for (const r of vc.filter(r => !/\/event\//.test(r.website))) console.log('  NOEVENT', r.created_at, r.website);
