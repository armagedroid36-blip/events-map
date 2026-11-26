// 952 (шаг 2): парсим уже скачанные через curl страницы (node fetch до megatix не проходит — таймаут)
// и пишем описание из полей JSON-LD. APPLY=1 — писать в базу.
import { readFileSync, existsSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
    })
);
const URL_ = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE;
const APPLY = process.env.APPLY === '1';
const DIR = process.env.M952_DIR;

const dec = (s) => String(s).replace(/&amp;/g, '&').replace(/&#039;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ');
const h = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Accept-Encoding': 'identity' };

const list = JSON.parse(readFileSync(`${DIR}/list.json`, 'utf8'));
const rows = await (await fetch(`${URL_}/rest/v1/events?select=id,title,start_time,description&status=eq.moderation&source_type=eq.collector&website=ilike.*megatix*&limit=30`, { headers: h })).json();
const byId = new Map(rows.map((r) => [r.id, r]));

function findLd(node, out) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { node.forEach((n) => findLd(n, out)); return; }
  if (node['@type'] === 'Event' || (Array.isArray(node['@type']) && node['@type'].includes('Event'))) out.push(node);
  for (const k of ['@graph', 'mainEntity', 'itemListElement', 'item']) if (node[k]) findLd(node[k], out);
}

let patched = 0, tried = 0;
for (const { id } of list) {
  const f = `${DIR}/${id.slice(0, 8)}.html`;
  if (!existsSync(f)) continue;
  const r = byId.get(id);
  if (!r || (r.description || '').trim()) continue;
  tried++;
  const html = readFileSync(f, 'utf8');
  const evs = [];
  for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try { findLd(JSON.parse(m[1]), evs); } catch { /* мусорный блок */ }
  }
  const ev = evs[0];
  if (!ev) { console.log('нет Event-LD:', id.slice(0, 8), r.title); continue; }
  const place = (ev.location && (Array.isArray(ev.location) ? ev.location[0] : ev.location)) || {};
  const addr = place.address || {};
  const placeName = place.name ? dec(place.name) : null;
  const street = typeof addr === 'object' ? addr.streetAddress : null;
  const locality = typeof addr === 'object' ? addr.addressLocality : null;
  const addressText = [street, locality].filter(Boolean).map((s) => dec(String(s)));
  const orgRaw = ev.organizer && (ev.organizer.name || (Array.isArray(ev.organizer) && ev.organizer[0] && ev.organizer[0].name));
  const bits = [];
  if (placeName) bits.push(`Venue: ${placeName}`);
  const addrClean = [...new Set(addressText)].filter((s) => s.toLowerCase() !== String(placeName || '').toLowerCase()).join(', ');
  if (addrClean) bits.push(`Address: ${addrClean}`);
  if (orgRaw && dec(orgRaw).toLowerCase() !== String(placeName || '').toLowerCase()) bits.push(`Organizer: ${dec(orgRaw)}`);
  if (r.start_time) bits.push(`Start: ${String(r.start_time).slice(0, 5)}`);
  const desc = bits.join('. ');
  if (!desc) { console.log('пусто:', id.slice(0, 8)); continue; }
  console.log(id.slice(0, 8), '|', r.title.slice(0, 30), '=>', desc.slice(0, 120));
  if (APPLY) {
    const res = await fetch(`${URL_}/rest/v1/events?id=eq.${id}`, {
      method: 'PATCH',
      headers: { ...h, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify({ description: desc }),
    });
    const body = await res.json();
    if (res.ok && Array.isArray(body) && body[0] && body[0].description === desc) patched++;
    else console.log('  PATCH FAIL', res.status, JSON.stringify(body).slice(0, 120));
  }
}
console.log('проверено карточек:', tried, 'записано:', patched);
