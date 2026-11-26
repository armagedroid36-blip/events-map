const URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const K = process.env.SUPABASE_SERVICE_ROLE;
const ids = ['bbe3a530','c06f2aee','e2fc34d9','08750eaa','6c7c12d8','6512ded9','a0c20939','e9fbc30b','fa41bb33','24b77c4f'];
const q = `status=eq.active&start_date=lt.2026-11-24&recurrence=is.null&or=(end_date.is.null,end_date.lt.2026-11-24)&select=id,title,description&order=start_date.asc,id.asc&limit=40`;
const r = await fetch(`${URL}/rest/v1/events?${q}`, { headers: { apikey: K, Authorization: `Bearer ${K}` } });
const all = await r.json();
for (const p of ids) {
  const e = all.find(x => x.id.startsWith(p));
  if (!e) { console.log('--- MISS', p); continue; }
  console.log(`--- ${e.id.slice(0,8)} ${e.title}\n${(e.description||'').replace(/\n+/g,' | ').slice(0,300)}`);
}
