import { createClient } from '@supabase/supabase-js';
const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
const out = [];
for (let off = 0; ; off += 1000) {
  const { data, error } = await db.from('events')
    .select('id,title_ru,title,city,address,start_date,website,source_type')
    .eq('status', 'active').order('id').range(off, off + 999);
  if (error) throw new Error(error.message);
  out.push(...data); if (data.length < 1000) break;
}
const no = out.filter(e => !e.address);
console.log('active без адреса:', no.length);
const m = new Map();
for (const e of no) {
  const k = `${e.city || '—'} | ${e.source_type || '—'} | web=${e.website ? 'y' : 'n'}`;
  m.set(k, (m.get(k) || 0) + 1);
}
for (const [k, v] of [...m.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${v}\t${k}`);
console.log('--- примеры (Дананг/Нячанг/Бали):');
for (const e of no.filter(e => /дананг|da nang|нячанг|nha trang|бали|bali/i.test(e.city || '')).slice(0, 12))
  console.log(`  ${e.id.slice(0, 8)} | ${e.city} | ${e.start_date} | web=${(e.website || '').slice(0, 60)} | ${(e.title_ru || e.title || '').slice(0, 40)}`);
