// dot689: Larnaca Christmas Market — 5 живых карточек у Zouchouri Square
const URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Accept-Encoding': 'identity' };

async function get(path) {
  const r = await fetch(`${URL}/rest/v1/${path}`, { headers: H });
  const t = await r.text();
  if (!r.ok) throw new Error(`${r.status} ${t.slice(0, 200)}`);
  return JSON.parse(t);
}

const rows = await get('events?status=eq.active&select=id,title,city,address,start_date,end_date,start_time,website,description,lat,lng,source_type&order=start_date.asc,id.asc&limit=1000');
const hits = rows.filter(r => /christmas\s*market|рождественск\S*\s+рын|χριστουγεννι\S*\s*αγορ/i.test((r.title || '') + ' ' + (r.description || '')));
console.log('всего active (первая страница):', rows.length);
for (const r of hits) {
  console.log('---');
  console.log(r.id.slice(0, 8), '|', r.title);
  console.log('  ', r.start_date, '→', r.end_date, r.start_time, '|', r.city, '|', r.address);
  console.log('   site:', r.website);
  console.log('   desc:', (r.description || '').replace(/\s+/g, ' ').slice(0, 260));
}
console.log('карточек класса:', hits.length);
