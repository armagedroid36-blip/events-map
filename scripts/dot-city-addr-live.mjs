// Читающий зонд: живые карточки, у которых address = название города (класс запуска 94).
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
import { isCityAddress } from './address-junk.mjs';

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });
const LIVE = new Set(['active', 'moderation', 'needs_changes']);
const rows = await selectAll(db, 'events', 'id,status,city,address,source_type,website,start_date,created_at', {
  filter: q => q,
});

const live = rows.filter(r => LIVE.has(r.status));
const hits = live.filter(r => isCityAddress(r.address, r.city));
// Уровень города для Кипра приходит от источника и входит в ключ дедупа (city|title+address) — это дизайн, не дефект.
const cyprus = hits.filter(r => (r.source_type || '').includes('collector') && /, Кипр$/.test(r.address || ''));
const other = hits.filter(r => !cyprus.includes(r));
console.log(`живых ${live.length}, адрес = город: ${hits.length} (кипрские от источника ${cyprus.length}, прочие ${other.length})`);
for (const r of other) {
  console.log(`${r.status} | ${r.city} | ${r.start_date} | «${r.address}» | ${r.source_type} | ${String(r.website).slice(0, 60)}`);
}
const byCity = {};
for (const r of cyprus) byCity[r.city] = (byCity[r.city] || 0) + 1;
console.log('кипрские по городам:', JSON.stringify(byCity));
