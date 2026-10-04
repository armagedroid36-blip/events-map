// Сверка сохранённого ответа Cyprus Now (curl → файл) с базой.
// node --env-file=.env scripts/dot-cn-check.mjs <путь-к-json>
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const file = process.argv[2];
const db = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });
const rows = await selectAll(db, 'events', 'title,city,status,start_date,website');
const dbSite = new Set(rows.map((r) => r.website).filter(Boolean));
const dbKey = new Set(rows.map((r) => `${String(r.title || '').trim()}|${r.start_date}`));

const events = JSON.parse(readFileSync(file, 'utf8'))?.events || [];
console.log(`${file}: в ленте ${events.length}`);
const stat = {};
const missing = [];
for (const ev of events) {
  const ct = String(ev.city || '—');
  stat[ct] = (stat[ct] || 0) + 1;
  const w = ev.url || (ev.slug ? `https://cyprusnow.app/event/${ev.slug}` : null);
  const k = `${String(ev.title || ev.name || '').trim()}|${String(ev.start_at || ev.start_date || '').slice(0, 10)}`;
  if (!dbSite.has(w) && !dbKey.has(k)) missing.push(`${String(ev.title || ev.name).slice(0, 55)} | ${k.split('|')[1]} | ${ev.venue_name || '—'} | ${ct}`);
}
console.log('по городам источника:', JSON.stringify(stat));
console.log(`НЕ в базе: ${missing.length}`);
for (const s of missing.slice(0, 20)) console.log('  + ' + s);
