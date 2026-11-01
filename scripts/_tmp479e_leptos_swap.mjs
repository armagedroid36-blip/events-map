// dot479e: у Leptos дат три (08.11 / 09.11 / 25.11) — оставить карточку с датой, ближайшей к реальному событию 26-29.11
import { createClient } from '@supabase/supabase-js';
const db = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });
const back = await db.from('events').update({ status: 'archived' }).eq('id', '4a8ae5ce-0000-0000-0000-000000000000');
// id по префиксу: точный uuid не известен — берём из таблицы
const find = async (prefix) => {
  const { data } = await db.from('events').select('id,status,start_date,title,website').gte('start_date', '2026-11-01').lte('start_date', '2026-11-30');
  return (data || []).filter((r) => r.id.startsWith(prefix));
};
const a = await find('4a8ae5ce'); const b = await find('57d775cb');
console.log('4a8ae5ce:', a.map((r) => `${r.status} ${r.start_date}`), '57d775cb:', b.map((r) => `${r.status} ${r.start_date}`));
if (a[0]) {
  const r1 = await db.from('events').update({ status: 'archived' }).eq('id', a[0].id).eq('status', 'moderation').select('id,status');
  console.log('4a8ae5ce -> archived:', r1.error ? r1.error.message : JSON.stringify(r1.data));
}
if (b[0]) {
  const r2 = await db.from('events').update({ status: 'moderation' }).eq('id', b[0].id).eq('status', 'archived').select('id,status,start_date');
  console.log('57d775cb -> moderation:', r2.error ? r2.error.message : JSON.stringify(r2.data));
}
