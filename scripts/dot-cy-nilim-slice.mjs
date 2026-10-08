// Читающий зонд: карточки Никосии/Лимасола на центровом фолбэке, у которых адрес называет
// площадку, а сама площадка есть в ленте Cyprus Now (city-срезы скачаны в Temp).
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE;
const db = createClient(url, key, { auth: { persistSession: false } });

const CENTERS = {
  'Никосия': [35.1856, 33.3823],
  'Лимасол': [34.7071, 33.0226],
};
const TOL = 0.0012;

const TMP = path.join(process.env.LOCALAPPDATA, 'Temp', 'cyni');
const files = [['nicosia', 'Никосия'], ['limassol', 'Лимасол']];

const norm = (s) => String(s || '').toLowerCase()
  .replace(/[«»"'`،,\.\-–—()\[\]/\\]/g, ' ')
  .replace(/\s+/g, ' ').trim();

function loadVenues() {
  const out = [];
  for (const [file, label] of files) {
    const p = path.join(TMP, `${file}.json`);
    if (!fs.existsSync(p)) { console.log(`нет файла ${p}`); continue; }
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    const seen = new Set();
    for (const ev of j.events || []) {
      const v = ev.venue;
      if (!v || !v.name || v.lat == null || v.lng == null) continue;
      const k = norm(v.name);
      if (!k || seen.has(k)) continue;
      seen.add(k);
      out.push({ key: k, name: v.name, lat: +v.lat, lng: +v.lng, city: v.city, label });
    }
  }
  return out;
}

const venues = loadVenues();
console.log(`площадок в срезах: ${venues.length}`);

const rows = await selectAll(db, 'events', 'id,title,title_ru,start_date,city,address,lat,lng,status,website',
  { filter: (q) => q.in('status', ['active', 'moderation']) });

const dist = (a, b, c, d) => {
  const dx = (b - d) * Math.cos(((a + c) / 2) * Math.PI / 180) * 111.32;
  const dy = (a - c) * 111.32;
  return Math.sqrt(dx * dx + dy * dy);
};

let cands = 0, fb = 0;
for (const r of rows) {
  const cityKey = Object.keys(CENTERS).find((c) => String(r.city || '').startsWith(c));
  if (!cityKey) continue;
  const [clat, clng] = CENTERS[cityKey];
  if (r.lat == null || r.lng == null) continue;
  if (dist(clat, clng, r.lat, r.lng) > TOL) continue; // не на фолбэке
  fb++;
  const addr = norm(r.address);
  if (!addr || addr.length < 5) { continue; }
  const hits = venues.filter((v) => v.key.length >= 5 && addr.includes(v.key));
  if (!hits.length) continue;
  cands++;
  const v = hits[0];
  const d = dist(v.lat, v.lng, r.lat, r.lng);
  console.log(`\n[${r.id.slice(0, 8)}] ${cityKey} ${r.start_date} "${(r.title_ru || r.title).slice(0, 45)}"`);
  console.log(`   адрес: ${r.address}`);
  console.log(`   пин: ${r.lat},${r.lng} -> CN ${v.name} (${v.lat},${v.lng}) сдвиг ${d.toFixed(2)} км, label=${v.label}`);
}
console.log(`\nна фолбэке Никосия+Лимасол: ${fb}; с площадкой из среза: ${cands}`);
