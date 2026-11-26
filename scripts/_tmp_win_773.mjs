import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
import { CY_CITY_CENTERS } from './cy-districts.mjs';
import { BALI_DISTRICT_CENTERS } from './bali-districts.mjs';

const db = createClient(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);

const SINCE = '2026-11-07T16:40:48Z';
const C = {};
for (const [k, v] of Object.entries(CY_CITY_CENTERS)) C['cy:' + k] = [v.lat ?? v[0], v.lng ?? v[1]];
for (const [k, v] of Object.entries(BALI_DISTRICT_CENTERS)) C['bali:' + k] = [v.lat ?? v[0], v.lng ?? v[1]];
C['nhatrang'] = [12.2388, 109.1967];
C['danang'] = [16.0544, 108.2022];
const rows = await selectAll(db, 'events', 'id,title,status,city,address,start_date,start_time,end_date,lat,lng,created_at,website,source_type', { filter: q => q.gte('created_at', SINCE) });
console.log('WINDOW rows:', rows.length);
const by = {};
for (const r of rows) by[r.status] = (by[r.status] || 0) + 1;
console.log('statuses:', JSON.stringify(by));
const cities = {};
for (const r of rows) cities[r.city] = (cities[r.city] || 0) + 1;
console.log('cities:', JSON.stringify(cities));

const key = r => `${(r.title || '').trim().toLowerCase()}|${r.start_date}`;
const g = {};
for (const r of rows) (g[key(r)] = g[key(r)] || []).push(r);
console.log('\n-- dup pairs title|start_date (window):');
let n = 0;
for (const k in g) if (g[k].length > 1) { n++; console.log(k, g[k].map(r => `${r.id.slice(0,8)}/${r.status}/${r.city}`).join(' <> ')); }
if (!n) console.log('0');

console.log('\n-- pins on city constants:');
let m = 0;
for (const r of rows) {
  if (r.status !== 'active' || r.lat == null) continue;
  for (const c in C) {
    const [la, ln] = C[c];
    if (Math.abs(r.lat - la) < 0.0006 && Math.abs(r.lng - ln) < 0.0006) {
      m++; console.log(r.id.slice(0, 8), c, r.start_date, r.start_time, '|', r.city, '|', r.address, '|', r.title.slice(0, 60));
    }
  }
}
if (!m) console.log('0');

console.log('\n-- addr stubs:');
console.log(rows.filter(r => /^cyprus, cyprus$/i.test((r.address || '').trim())).map(r => r.id.slice(0, 8) + ' ' + r.title.slice(0, 50)).join('\n') || '0');
