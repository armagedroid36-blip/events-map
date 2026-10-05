// dot-cy-east-gap-probe.mjs — Восточный Кипр (Протарас/Паралимни/Ая-Напа/Фамагуста):
// что есть в подключённых источниках и чего нет в базе. Только чтение.
// Вход: Temp/cn_fam.json (Cyprus Now, city=famagusta) + Temp/cbz_<city>.html (JSON-LD Cyprus.BZ).
import { readFileSync, existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const TMP = process.env.LOCALAPPDATA + '/Temp';
const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });
const rows = await selectAll(db, 'events', 'id,title,city,start_date,status,website,address,lat,lng');

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-zа-я0-9]+/gi, ' ').trim();
const keys = new Set();
const sites = new Set();
for (const r of rows) { keys.add(`${norm(r.title)}|${r.start_date}`); if (r.website) sites.add(r.website); }

// --- Cyprus Now ---
const cn = JSON.parse(readFileSync(`${TMP}/cn_fam.json`, 'utf8'));
const cnEvents = cn.events || cn;
const cnStat = new Map();
for (const e of cnEvents) {
  const city = e.city || '(нет)';
  const start = String(e.start_at || '').slice(0, 10);
  const known = keys.has(`${norm(e.title)}|${start}`) || sites.has(e.url || `https://cyprusnow.app/event/${e.slug}`);
  if (!cnStat.has(city)) cnStat.set(city, { all: 0, known: 0, fresh: [] });
  const s = cnStat.get(city);
  s.all++;
  if (known) s.known++;
  else if (s.fresh.length < 12) s.fresh.push(`${start} ${String(e.title).slice(0, 52)} | ${e.venue_name || '-'} | ${e.venue_lat},${e.venue_lng} | ${e.url || ''}`);
}
console.log('=== Cyprus Now (city=famagusta), всего в ленте', cnEvents.length, '===');
for (const [c, s] of [...cnStat.entries()].sort((a, b) => b[1].all - a[1].all)) {
  console.log(`${c.padEnd(12)} лента ${String(s.all).padStart(3)} | в базе ${String(s.known).padStart(3)} | новых ${String(s.all - s.known).padStart(3)}`);
  for (const f of s.fresh) console.log('    ', f);
}

// --- Cyprus.BZ JSON-LD ---
console.log('\n=== Cyprus.BZ городские афиши (JSON-LD Event) ===');
for (const city of ['protaras', 'paralimni', 'ayia-napa', 'famagusta']) {
  const f = `${TMP}/cbz_${city}.html`;
  if (!existsSync(f)) { console.log(`${city}: файла нет`); continue; }
  const html = readFileSync(f, 'utf8');
  const blocks = [...html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  const events = [];
  const collect = (o) => {
    if (!o || typeof o !== 'object') return;
    if (Array.isArray(o)) { for (const x of o) collect(x); return; }
    const t = o['@type'];
    if (t === 'Event' || (Array.isArray(t) && t.includes('Event'))) events.push(o);
    for (const key of ['@graph', 'itemListElement', 'item', 'mainEntity']) if (o[key]) collect(o[key]);
  };
  for (const b of blocks) {
    try { collect(JSON.parse(b)); } catch { /* пустой блок */ }
  }
  console.log(`${city}: событий в разметке ${events.length}`);
  for (const e of events) {
    const start = String(e.startDate || '').slice(0, 10);
    const url = String(e.url || e['@id'] || '');
    const known = keys.has(`${norm(e.name)}|${start}`) || (url && sites.has(url));
    console.log(`   ${known ? 'ЕСТЬ ' : 'НОВОЕ'} ${start} ${String(e.name).slice(0, 56)} | ${e.location?.address?.addressLocality || '-'} | ${url}`);
  }
}

// --- Ая-Напа в базе: нет ли там площадок Протараса (фильтр карты расщепляется) ---
console.log('\n=== active Ая-Напа: подозрение на Протарас ===');
const ayia = rows.filter((r) => r.status === 'active' && /Ая-Напа/.test(r.city || ''));
console.log('всего active Ая-Напа', ayia.length);
let sus = 0;
for (const r of ayia) {
  const t = `${r.title} ${r.venue || ''} ${r.address || ''}`.toLowerCase();
  if (/protaras|протарас/.test(t)) {
    sus++;
    console.log(`   ${r.id.slice(0, 8)} ${r.start_date} ${String(r.title).slice(0, 50)} | venue ${r.venue || '-'} | ${r.lat},${r.lng}`);
  }
}
console.log('подозрительных (Протарас в названии/адресе, а city = Ая-Напа):', sus);
