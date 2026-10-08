// Словарь районов Бали в живой ленте Балифорума: какие районы приходят и какие сборщик не знает.
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
const dir = `${process.env.LOCALAPPDATA}/Temp/balib`;
const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
const KNOWN = new Set(['ubud','jimbaran','canggu','seminyak','kuta','sanur','pecatu','uluwatu','denpasar','nusa dua','benoa','tabanan','amed','sidemen','lovina','legian','kerobokan','unggasan','ungasan','sukawati','улувату','нуса-дуа','нуса дуа','букит','гианьяр','унгасан','сукавати','керобокан','нет в списке']);
const evs = [];
for (const f of files) {
  const j = JSON.parse(fs.readFileSync(`${dir}/${f}`, 'utf8'));
  for (const e of j.data || []) evs.push(e);
}
const uniq = new Map();
for (const e of evs) if (!uniq.has(e.slug)) uniq.set(e.slug, e);
console.log('страниц:', files.length, '| событий:', evs.length, '| уникальных слагов:', uniq.size);
const byD = new Map(); const unknown = new Map();
for (const e of uniq.values()) {
  const p = e.place || {};
  const d = String(p.districtName || '(пусто)').trim();
  const hasGeo = p.lat != null && p.lng != null;
  byD.set(d, (byD.get(d) || 0) + 1);
  if (!KNOWN.has(d.toLowerCase()) || (d === '(пусто)')) {
    const arr = unknown.get(d) || []; arr.push({ slug: e.slug, title: String(e.title).slice(0, 40), hasGeo, addr: String(p.address || '').slice(0, 40) }); unknown.set(d, arr);
  }
}
console.log('\nРайоны в ленте:');
for (const [d, n] of [...byD.entries()].sort((a,b)=>b[1]-a[1])) console.log(`  ${String(n).padStart(4)}  ${d}${KNOWN.has(d.toLowerCase()) ? '' : '   <-- НЕ в словаре сборщика'}`);
console.log('\nНезнакомые районы поштучно:');
for (const [d, arr] of unknown) { console.log(`  ${d} (${arr.length}):`); for (const a of arr.slice(0,8)) console.log(`     geo=${a.hasGeo?1:0} ${a.slug} | ${a.title} | ${a.addr}`); }
// сверка с базой
const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });
const rows = await selectAll(db, 'events', 'id,status,website,title,start_date', {});
const byWeb = new Set(rows.map(r => String(r.website || '').replace(/\/$/, '')));
let absent = 0; const absentUnk = [];
for (const e of uniq.values()) {
  const w = `https://baliforum.ru/events/${e.slug}`;
  if (!byWeb.has(w)) { absent++; const d = String((e.place||{}).districtName || '?'); absentUnk.push(`${d} | ${w} | ${String(e.title).slice(0,40)}`); }
}
console.log(`\nБаза: строк ${rows.length}; из ленты нет в базе: ${absent}`);
absentUnk.slice(0, 25).forEach(l => console.log('   ', l));
