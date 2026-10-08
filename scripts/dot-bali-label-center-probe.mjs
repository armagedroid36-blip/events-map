// Читающий зонд: (1) перепись меток city живых балийских карточек и наличие центра района,
// (2) что источник отдаёт по спорным карточкам (districtName/address из сохранённой ленты).
// Запуск: node --env-file=.env scripts/dot-bali-label-center-probe.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
import { BALI_DISTRICT_CENTERS } from './bali-districts.mjs';

const db = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, {
  auth: { persistSession: false },
});
const rows = await selectAll(db, 'events', 'id,title,title_ru,city,address,lat,lng,status', {
  filter: (q) => q.in('status', ['active', 'moderation']),
});
const bali = rows.filter((r) => (r.city || '').includes('Bali'));
const labels = {};
for (const r of bali) {
  const l = (r.city || '').replace(/,\s*Bali$/, '');
  labels[l] = (labels[l] || 0) + 1;
}
console.log('меток:', Object.keys(labels).length);
const noCenter = Object.keys(labels).filter((l) => !BALI_DISTRICT_CENTERS[l.toLowerCase()]);
console.log('БЕЗ центра района:', JSON.stringify(noCenter));
console.log('перепись:', JSON.stringify(Object.fromEntries(Object.entries(labels).sort((a, b) => b[1] - a[1]))));

// спорные карточки: что говорит лента источника
const dir = path.join(process.env.LOCALAPPDATA || '', 'Temp', 'balib');
const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')) : [];
const interesting = ['a-decade-of-memories', 'kviz-eynshteyn-pati', 'ocean-odyssey'];
const seen = new Set();
for (const f of files) {
  let data;
  try { data = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch { continue; }
  const list = data.events || data.data || data.items || [];
  for (const ev of list) {
    const slug = String(ev.slug || ev.url || '').toLowerCase();
    if (!interesting.some((k) => slug.includes(k))) continue;
    const key = slug;
    if (seen.has(key)) continue;
    seen.add(key);
    console.log('ЛЕНТА', f, JSON.stringify({
      slug: ev.slug, title: ev.title, districtName: ev.districtName, place: ev.place,
      address: ev.address || (ev.location && ev.location.address), lat: ev.lat, lng: ev.lng,
      coords: ev.coordinates, venue: ev.venueName || ev.venue,
    }));
  }
}
if (seen.size === 0) console.log('спорных в сохранённой ленте не найдено, файлов:', files.length);
