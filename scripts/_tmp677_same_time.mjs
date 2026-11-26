// Временный зонд 677: кросс-языковые дубли по ключу дата+время+город+пин<200 м (только чтение)
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE;
const db = createClient(url, key, { auth: { persistSession: false } });

async function selectAll(table, columns, filter) {
  const out = [];
  let from = 0;
  for (;;) {
    let q = db.from(table).select(columns).order('start_date', { ascending: true }).order('id', { ascending: true }).range(from, from + 199);
    if (filter) q = filter(q);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < 200) break;
    from += 200;
  }
  return out;
}

const rows = await selectAll('events', 'id,title,city,address,start_date,start_time,lat,lng,website,status', q => q.eq('status', 'active'));
const geo = rows.filter(r => r.lat != null && r.lng != null);
console.log(`живых ${rows.length}, с гео ${geo.length}`);

const dist = (a, b) => {
  const R = 6371000, rad = x => x * Math.PI / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
};

const groups = new Map();
for (const r of geo) {
  const k = `${r.start_date}|${r.start_time || ''}|${(r.city || '').slice(0, 6).toLowerCase()}`;
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(r);
}

let pairs = 0;
for (const [k, arr] of groups) {
  if (arr.length < 2) continue;
  for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) {
    const d = dist(arr[i], arr[j]);
    if (d < 200) {
      pairs++;
      console.log(`\n${k} | ${Math.round(d)} м`);
      for (const r of [arr[i], arr[j]]) console.log(`  ${r.id.slice(0, 8)} ${r.title} | ${r.address} | ${r.lat},${r.lng} | ${r.website}`);
    }
  }
}
console.log(`\nпар ${pairs}`);
