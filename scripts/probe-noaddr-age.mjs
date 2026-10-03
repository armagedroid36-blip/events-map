import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
const rows = await selectAll(db, 'events', 'id,title,city,address,lat,lng,created_at,updated_at,website,source_type',
  { filter: (q) => q.eq('status', 'active') });
const no = rows.filter((e) => !e.address);
console.log('active всего', rows.length, '| без адреса', no.length);
const cy = no.filter((e) => /кипр/i.test(e.city || ''));
const byMonth = new Map();
for (const e of cy) {
  const k = (e.created_at || '').slice(0, 7);
  byMonth.set(k, (byMonth.get(k) || 0) + 1);
}
console.log('кипрские без адреса по месяцу создания:', [...byMonth.entries()].sort().map(([k, v]) => `${k}:${v}`).join(' '));
const src = new Map();
for (const e of cy) {
  const host = (() => { try { return new URL(e.website).hostname; } catch { return '—'; } })();
  src.set(host, (src.get(host) || 0) + 1);
}
console.log('источники кипрских без адреса:', [...src.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join(' '));
console.log('--- самые свежие кипрские без адреса:');
for (const e of cy.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')).slice(0, 10))
  console.log(`  ${e.id.slice(0, 8)} | создано ${(e.created_at || '').slice(0, 16)} | ${e.city} | ${(e.website || '').slice(0, 62)}`);
