// Читающий зонд: список текущих кандидатов embed-аудита cyprus.bz (без сети).
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE;
const db = createClient(url, key);

const CITY_WORDS = /^(лимасол|никосия|ларнака|пафос|ая-?напа|протарас|паралимни|фамагуста|полис|кипр|limassol|nicosia|larnaca|paphos|ayia|protaras|paralimni|famagusta|paphos|cyprus)/i;
const CY_CENTERS = {
  'Лимасол, Кипр': [34.7071, 33.0226],
  'Никосия, Кипр': [35.1856, 33.3823],
  'Ларнака, Кипр': [34.9182, 33.6197],
  'Пафос, Кипр': [34.7754, 32.4245],
};
const isCenter = (lat, lng) =>
  Object.entries(CY_CENTERS).some(([c, [a, b]]) => {
    if (!c) return false;
    const d = Math.hypot(lat - a, lng - b);
    return d < 0.0045;
  });

const rows = await selectAll(db, 'events', 'id,title,title_ru,city,address,lat,lng,status,start_date,website,source_type');
const out = [];
for (const r of rows) {
  if (r.status === 'archived') continue;
  if (!isCenter(r.lat, r.lng)) continue;
  const addr = (r.address || '').trim();
  if (addr.length < 8) continue;
  const first = addr.split(/[,;]/)[0].trim();
  if (CITY_WORDS.test(first)) continue;
  const site = String(r.website || '');
  if (!/cyprus\.bz\/(?:ru\/|en\/)?event\/[0-9a-f]+/i.test(site)) continue;
  out.push({ id: r.id.slice(0, 8), title: r.title_ru || r.title, city: r.city, date: r.start_date, venue: first, lat: r.lat, lng: r.lng, src: r.source_type || r.source, page: site });
}
out.sort((a, b) => a.venue.localeCompare(b.venue));
for (const c of out) console.log(`${c.id} | ${c.date} | ${c.city} | «${c.venue}» | ${c.title} | ${c.lat},${c.lng} | ${c.src} | ${c.page}`);
console.log('ВСЕГО', out.length, '| площадок', new Set(out.map((c) => c.venue.toLowerCase())).size);
