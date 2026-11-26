// Зонд 999d: адрес-ссылка (не адрес) — замер класса + карточка 8506a6b0.
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY;
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const rows = await selectAll(db, 'events', 'id,address,city,title,start_date,status,website', {
  filter: (q) => q.eq('status', 'active'),
});
const links = rows.filter((r) => /^(?:https?:\/\/|www\.|t\.me\/)/i.test(String(r.address || '').trim()));
console.log('живых:', rows.length, '| адрес-ссылка:', links.length);
for (const r of links) console.log(`- ${r.id} | ${r.city} | ${r.start_date} | ${String(r.title).slice(0, 50)} | ${r.address}`);

const target = rows.filter((r) => r.id.startsWith('8506a6b0'));
for (const r of target) {
  console.log('\n8506a6b0:', r.city, r.start_date, r.title);
  console.log('addr len', String(r.address || '').length, ':', String(r.address).slice(0, 300));
}
