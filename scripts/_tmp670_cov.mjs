// _tmp670: покрытие живых карточек по городам на 14 дней вперёд + ближайшие 3 дня по каждому городу
const URL_ = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Accept-Encoding': 'identity' };

const today = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10); // МСК
const end = new Date(Date.now() + 3 * 3600e3 + 13 * 86400e3).toISOString().slice(0, 10);

async function page(offset, limit) {
  const u = `${URL_}/rest/v1/events?select=city,start_date&status=eq.active&start_date=gte.${today}&start_date=lte.${end}&order=start_date.asc,id.asc&limit=${limit}&offset=${offset}`;
  for (let i = 0; i < 4; i++) {
    try {
      const r = await fetch(u, { headers: H });
      if (!r.ok) throw new Error(r.status + ' ' + (await r.text()).slice(0, 120));
      return await r.json();
    } catch (e) { await new Promise(s => setTimeout(s, 1200)); }
  }
  return null;
}

const rows = [];
for (let off = 0; off < 1200; off += 300) {
  const p = await page(off, 300);
  if (!p) { console.log('СТРАНИЦА УПАЛА offset=' + off); break; }
  rows.push(...p);
  if (p.length < 300) break;
}

const byCity = new Map();
for (const r of rows) {
  const c = (r.city || '—').replace(/,?\s*(Кипр|Bali|Вьетнам|Vietnam)$/i, '').trim();
  if (!byCity.has(c)) byCity.set(c, { total: 0, near: 0 });
  const o = byCity.get(c);
  o.total++;
  if (r.start_date <= new Date(Date.now() + 3 * 3600e3 + 3 * 86400e3).toISOString().slice(0, 10)) o.near++;
}
console.log(`окно ${today}..${end}, живых ${rows.length}, городов ${byCity.size}`);
[...byCity.entries()].sort((a, b) => a[1].total - b[1].total).forEach(([c, o]) =>
  console.log(`${String(o.total).padStart(4)} | 3дня ${String(o.near).padStart(3)} | ${c}`));
