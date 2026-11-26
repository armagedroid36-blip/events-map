import { createClient } from '@supabase/supabase-js';
const db = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });
const pairs = [
 ['fcb42a2a','50849edb'],['33579174','d985491a'],['81e485b0','dac82bf2'],['35c0a597','75f9be6b'],
 ['a0a35f37','164b5f2a'],['b71d9185','d7470ec1'],['6bfb0a25','c32729af'],['d4e61329','8a9fd6f3'],
 ['064336dc','821dea61'],['6655a883','428c8398'],
];
let all = [];
for (let from = 0; ; from += 200) {
  const { data, error } = await db.from('events').select('id,status,start_date,start_time,city,lat,lng,title').order('id').range(from, from+199);
  if (error) { console.error(error.message); process.exit(1); }
  all.push(...data); if (data.length < 200) break;
}
const by = new Map(all.map(r => [r.id.slice(0,8), r]));
for (const [dup, can] of pairs) {
  const d = by.get(dup), c = by.get(can);
  console.log(dup, d?.status, '| канон', can, c?.status, c?.start_date, c?.start_time, c?.lat, c?.lng);
}
console.log('всего active', all.filter(r => r.status === 'active').length);
