// Собирает словарь «адрес площадки -> проверенный пин» из уже геокодированных карточек Megatix (запуск 943).
// Пин считается проверенным, если он НЕ лежит на центре района из BALI_DISTRICT_CENTERS.
import fs from 'node:fs';
const env = {};
for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const URL = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE;
const { BALI_DISTRICT_CENTERS } = await import('./scripts/bali-districts.mjs');

const rows = [];
for (let off = 0; off < 600; off += 60) {
  const u = `${URL}/rest/v1/events?select=id,title,city,address,lat,lng,status,start_date&website=ilike.*megatix*&order=id.asc&limit=60&offset=${off}`;
  const r = await fetch(u, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Accept-Encoding': 'identity' } });
  if (!r.ok) { console.error('HTTP', r.status, await r.text()); process.exit(1); }
  const page = await r.json();
  rows.push(...page);
  if (page.length < 60) break;
}
const live = rows.filter(r => r.status === 'active' || r.status === 'moderation');
const centers = Object.values(BALI_DISTRICT_CENTERS);
const onFallback = (r) => centers.some(c => Math.abs(c.lat - r.lat) < 0.00012 && Math.abs(c.lng - r.lng) < 0.00012);
const isStub = (a) => !a || /check the exact address|disclosed upon|^cyprus$/i.test(a);

const dict = {};
for (const r of live) {
  if (!r.lat || !r.lng || isStub(r.address)) continue;
  if (onFallback(r)) continue;
  const k = String(r.address).toLowerCase().replace(/\s+/g, ' ').trim();
  if (!dict[k]) dict[k] = { lat: Number(r.lat), lng: Number(r.lng), title: r.title, city: r.city };
}
console.log('живых', live.length, 'на фолбэке', live.filter(onFallback).length, 'словарь', Object.keys(dict).length);
fs.writeFileSync(process.env.LOCALAPPDATA + '/Temp/megatix-venue-pins.json', JSON.stringify(dict, null, 1));
for (const [k, v] of Object.entries(dict)) console.log(v.lat, v.lng, '|', k.slice(0, 90));
