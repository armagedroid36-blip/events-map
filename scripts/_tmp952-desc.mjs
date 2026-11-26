// 952: описания из полей JSON-LD для карточек Megatix, стоящих в очереди модерации.
// Логика ровно как в collect-megatix.mjs (Venue/Address/Organizer/Start). APPLY=1 — писать в базу.
import { readFileSync } from 'node:fs';

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

const dec = (s) => String(s).replace(/&amp;/g, '&').replace(/&#039;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ');
const h = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Accept-Encoding': 'identity' };

const rows = await (await fetch(`${URL_}/rest/v1/events?select=id,title,website,description,start_time,address&status=eq.moderation&source_type=eq.collector&website=ilike.*megatix*&limit=30`, { headers: h })).json();
console.log('карточек в очереди megatix:', rows.length);

function findLd(node, out) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { node.forEach((n) => findLd(n, out)); return; }
  if (node['@type'] === 'Event' || (Array.isArray(node['@type']) && node['@type'].includes('Event'))) out.push(node);
  for (const k of ['@graph', 'mainEntity', 'itemListElement', 'item']) if (node[k]) findLd(node[k], out);
}

let patched = 0;
for (const r of rows) {
  if ((r.description || '').trim()) { console.log('есть описание:', r.id.slice(0, 8)); continue; }
  let html = '';
  try {
    const res = await fetch(r.website, { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Encoding': 'identity' }, signal: AbortSignal.timeout(25000) });
    html = await res.text();
  } catch (e) { console.log('fetch fail', r.id.slice(0, 8), e.message); continue; }
  const events = [];
  for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try { findLd(JSON.parse(m[1]), events); } catch { /* мусорный блок */ }
  }
  const ev = events[0];
  if (!ev) { console.log('нет Event-LD:', r.id.slice(0, 8), r.title); continue; }
  const place = ev.location && (Array.isArray(ev.location) ? ev.location[0] : ev.location) || {};
  const addr = place.address || {};
  const placeName = place.name ? dec(place.name) : null;
  const street = typeof addr === 'object' ? addr.streetAddress : null;
  const locality = typeof addr === 'object' ? addr.addressLocality : null;
  const addressText = [street, locality, placeName].filter(Boolean).map((s) => dec(String(s))).join(', ');
  const orgRaw = ev.organizer && (ev.organizer.name || (Array.isArray(ev.organizer) && ev.organizer[0] && ev.organizer[0].name));
  const bits = [];
  if (placeName) bits.push(`Venue: ${placeName}`);
  if (addressText) bits.push(`Address: ${addressText}`);
  if (orgRaw) bits.push(`Organizer: ${dec(orgRaw)}`);
  if (r.start_time) bits.push(`Start: ${String(r.start_time).slice(0, 5)}`);
  const desc = bits.join('. ');
  if (!desc) { console.log('пусто:', r.id.slice(0, 8)); continue; }
  console.log(r.id.slice(0, 8), '|', r.title.slice(0, 32), '=>', desc.slice(0, 110));
  if (APPLY) {
    const res = await fetch(`${URL_}/rest/v1/events?id=eq.${r.id}`, {
      method: 'PATCH',
      headers: { ...h, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify({ description: desc }),
    });
    const body = await res.json();
    if (res.ok && Array.isArray(body) && body[0] && body[0].description === desc) patched++;
    else console.log('  PATCH FAIL', res.status, JSON.stringify(body).slice(0, 120));
  }
}
console.log('записано:', patched);
