// 999b: восстановление адресов, снятых слишком широким правилом (Megatix-склейки площадка+улица).
// Читает карточки с address=null из последней правки, тянет JSON-LD страницы источника.
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY;
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const IDS = (process.env.IDS || '').split(',').map((s) => s.trim()).filter(Boolean);

function findPlace(node, out = []) {
  if (!node || typeof node !== 'object') return out;
  if (Array.isArray(node)) { node.forEach((n) => findPlace(n, out)); return out; }
  const t = node['@type'];
  if (t === 'Place' || t === 'Event') {
    const loc = node.location || node;
    const addr = loc.address || {};
    const street = addr.streetAddress || '';
    const locality = addr.addressLocality || '';
    const name = loc.name || node.name || '';
    if (street || locality) out.push([name, street, locality].filter(Boolean).join(', '));
  }
  for (const v of Object.values(node)) if (v && typeof v === 'object') findPlace(v, out);
  return out;
}

for (const id of IDS) {
  const { data: rows } = await db.from('events').select('id,city,title,website,address').eq('id', id);
  const r = rows && rows[0];
  if (!r) { console.log('нет', id); continue; }
  if (r.address) { console.log('уже есть адрес', id, r.address); continue; }
  let addr = '';
  try {
    const res = await fetch(r.website, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; events-map/1.0)' }, signal: AbortSignal.timeout(15000) });
    const html = await res.text();
    const m = html.match(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi) || [];
    const cand = [];
    for (const blk of m) {
      const json = blk.replace(/^<script[^>]*>/i, '').replace(/<\/script>$/i, '');
      try { findPlace(JSON.parse(json), cand); } catch { /* пропуск битого блока */ }
    }
    addr = cand.sort((a, b) => b.length - a.length)[0] || '';
  } catch (e) { console.log('fetch err', id, e.message); }
  console.log(`${id} | ${r.city} | ${String(r.title).slice(0, 40)} -> ${addr || 'НЕ НАЙДЕНО'}`);
  if (addr && process.env.APPLY === '1') {
    const { data, error } = await db.from('events').update({ address: addr }).eq('id', id).select('id,address');
    console.log(error ? 'ERR ' + error.message : 'PATCH ok ' + data[0].address);
  }
}
