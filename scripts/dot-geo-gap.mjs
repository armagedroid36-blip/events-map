import { createClient } from '@supabase/supabase-js';
const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
async function all(status) {
  const out = [];
  for (let off = 0; ; off += 1000) {
    const { data, error } = await db.from('events')
      .select('id,title,title_ru,city,address,lat,lng,start_date,status,website,source_type,recurrence')
      .eq('status', status).order('id').range(off, off + 999);
    if (error) throw new Error(error.message);
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}
const active = await all('active');
const mod = await all('moderation');
const ok = (e) => e.lat != null && e.lng != null && Number.isFinite(+e.lat) && +e.lat !== 0;
const byCity = (arr) => {
  const m = new Map();
  for (const e of arr) {
    const c = (e.city || '—').trim();
    const k = m.get(c) || { n: 0, noGeo: 0, noAddr: 0 };
    k.n++; if (!ok(e)) k.noGeo++; if (!e.address) k.noAddr++;
    m.set(c, k);
  }
  return [...m.entries()].sort((a, b) => b[1].noGeo - a[1].noGeo);
};
console.log('ACTIVE total', active.length, '| без координат', active.filter(e => !ok(e)).length, '| без адреса', active.filter(e => !e.address).length);
for (const [c, k] of byCity(active)) if (k.noGeo) console.log(`  ${c}: ${k.n} active, без гео ${k.noGeo}, без адреса ${k.noAddr}`);
console.log('MODERATION total', mod.length);
for (const e of mod) console.log(`  mod ${e.id.slice(0,8)} | ${e.city} | geo=${ok(e) ? 'yes' : 'NO'} | addr=${e.address ? 'yes' : 'no'} | ${(e.title_ru || e.title || '').slice(0, 45)} | ${e.start_date}`);
const tien = active.concat(mod).filter(e => /tiên sa|tien sa/i.test(e.title || '') || /tiên sa|tien sa/i.test(e.title_ru || ''));
console.log('Tiên Sa series:', tien.length);
for (const e of tien.sort((a, b) => String(a.start_date).localeCompare(String(b.start_date))))
  console.log(`  ${e.id.slice(0,8)} | ${e.status} | ${e.start_date} | geo=${ok(e) ? 'yes' : 'NO'} | addr=${e.address ? 'yes' : 'no'}`);
