// 999c: чистка HTML-сущностей в восстановленных адресах + повтор восстановления 4 карточек.
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
import { isJunkAddress } from './address-junk.mjs';

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY;
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const unesc = (s) => String(s).replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');

const rows = await selectAll(db, 'events', 'id,address,city,title,status', { filter: (q) => q.eq('status', 'active') });
let fixed = 0;
for (const r of rows) {
  if (r.address && /&(?:amp|quot|lt|gt|#0?39);/.test(r.address)) {
    const clean = unesc(r.address);
    const { data, error } = await db.from('events').update({ address: clean }).eq('id', r.id).select('id,address');
    if (error) console.log('ERR', r.id.slice(0, 8), error.message);
    else { fixed += 1; console.log('entity-fix', r.id.slice(0, 8), '->', data[0].address.slice(0, 70)); }
  }
}
console.log('адресов с HTML-сущностями исправлено:', fixed);

// повтор восстановления по Megatix (таймауты)
const RETRY = ['d9731d22-25e7-4b4f-bf93-22f4e7c6f0c7', '44c22a18-02d0-4217-84dc-1ffec342725b', '48226fb2-0d3d-4244-8d77-fc7b909e5730', 'c09ad7b5-2d71-4c5e-9bfc-81e67448807d'];
function findPlace(node, out = []) {
  if (!node || typeof node !== 'object') return out;
  if (Array.isArray(node)) { node.forEach((n) => findPlace(n, out)); return out; }
  if (node['@type'] === 'Place' || node['@type'] === 'Event') {
    const loc = node.location || node;
    const a = loc.address || {};
    const s = [loc.name || node.name, a.streetAddress, a.addressLocality].filter(Boolean).join(', ');
    if (s) out.push(s);
  }
  for (const v of Object.values(node)) if (v && typeof v === 'object') findPlace(v, out);
  return out;
}
for (const id of RETRY) {
  const { data: r } = await db.from('events').select('id,title,website,address').eq('id', id).single();
  if (!r || r.address) { console.log('skip', id.slice(0, 8)); continue; }
  try {
    const res = await fetch(r.website, { headers: { 'user-agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(45000) });
    const html = await res.text();
    const blocks = html.match(/<script[^>]+application\/ld\+json[^>]*>[\s\S]*?<\/script>/gi) || [];
    const cand = [];
    for (const b of blocks) {
      try { findPlace(JSON.parse(b.replace(/^<script[^>]*>/i, '').replace(/<\/script>$/i, '')), cand); } catch {}
    }
    const addr = unesc(cand.sort((x, y) => y.length - x.length)[0] || '');
    console.log(id.slice(0, 8), '->', addr.slice(0, 90) || 'НЕТ');
    if (addr) {
      const { data, error } = await db.from('events').update({ address: addr }).eq('id', id).select('id,address');
      console.log(error ? 'ERR ' + error.message : 'PATCH ok ' + data[0].address.slice(0, 70));
    }
  } catch (e) { console.log(id.slice(0, 8), 'fetch err', e.message); }
}

// итоговый замер класса
const rows2 = await selectAll(db, 'events', 'id,address,city,title,status', { filter: (q) => q.eq('status', 'active') });
const bad = rows2.filter((r) => r.address && isJunkAddress(r.address));
console.log('\nживых:', rows2.length, '| фильтр считает мусором:', bad.length);
for (const r of bad) console.log('-', r.id.slice(0, 8), '|', r.city, '|', String(r.address).slice(0, 80));
