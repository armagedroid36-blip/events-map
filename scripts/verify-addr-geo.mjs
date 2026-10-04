import { createClient } from '@supabase/supabase-js';
const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
const ids = ['01d1be53','03c505ad','04b2068e','0863b0c6','0c3cbe3e','0f10c361','0fc79fd4','10595948','110bd468','123cf6a2','162f7ff0','1aa0ea86'];
let filled = 0;
const all = await (async () => { const out = []; for (let o = 0; ; o += 1000) { const { data, error } = await db.from('events').select('id,address,lat,lng,status').eq('status','active').order('id').range(o,o+999); if (error) throw new Error(error.message); out.push(...data); if (data.length < 1000) break; } return out; })();
console.log('active всего', all.length, '| без адреса', all.filter(e => !e.address).length);
for (const e of all) if (ids.includes(e.id.slice(0,8)) && e.address) { filled++; console.log(' ', e.id.slice(0,8), '|', e.address); }
console.log('подтверждено заполненных из 12:', filled);
// откат сомнительного: адрес у вокзала в Дананге не является площадкой события
if (process.argv.includes('--revert-danang')) {
  const { error } = await db.from('events').update({ address: null }).eq('id', all.find(e => e.id.startsWith('10595948')).id);
  console.log('откат 10595948:', error ? error.message : 'address снова null');
}
