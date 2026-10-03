// dot-events: варианты написания городов (RU/EN, с «, Кипр») — риск расщепления фильтра по городу.
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE;
const db = createClient(url, key);

const rows = await selectAll(db, 'events', 'city,status', { filter: (q) => q.eq('status', 'active') });
const m = {};
for (const r of rows) m[r.city || '(пусто)'] = (m[r.city || '(пусто)'] || 0) + 1;
console.log('active всего:', rows.length, '| уникальных city:', Object.keys(m).length);
for (const [k, v] of Object.entries(m).sort((a, b) => b[1] - a[1])) console.log(String(v).padStart(5), k);
