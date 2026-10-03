// dot-events: проверка адресной правки после run 37158359585 (коммит 87b44535).
// Смотрим события, созданные после старта прогона, и считаем, у кого пустой address.
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE || process.env.VITE_SUPABASE_ANON_KEY;
if (!url || !key) { console.error('нет ключей env'); process.exit(1); }
const db = createClient(url, key);

const SINCE = '2026-10-03T22:20:00Z';
const rows = await selectAll(db, 'events', 'id,title,city,address,status,created_at,lat', {
  filter: (q) => q.gt('created_at', SINCE),
});

console.log('создано после', SINCE, '->', rows.length);
const noAddr = rows.filter((r) => !r.address || !String(r.address).trim());
console.log('без адреса:', noAddr.length);
const byCity = {};
for (const r of rows) byCity[r.city || '(нет)'] = (byCity[r.city || '(нет)'] || 0) + 1;
console.log('по городам:', JSON.stringify(byCity, null, 0));
for (const r of noAddr.slice(0, 20)) console.log('  NOADDR', r.city, '|', (r.title || '').slice(0, 50), '|', r.status);
const cy = rows.filter((r) => (r.city || '').match(/Лимасол|Никосия|Пафос|Ларнака|Ая-Напа|Фамагуста|Паралимни|Протарас|Полис/i));
console.log('кипрских среди них:', cy.length, '| без адреса:', cy.filter((r) => !r.address).length);
for (const r of cy.slice(0, 12)) console.log('  CY', r.city, '|', r.address, '|', (r.title || '').slice(0, 40), '|', r.status);
const st = {};
for (const r of rows) st[r.status] = (st[r.status] || 0) + 1;
console.log('статусы:', JSON.stringify(st));
