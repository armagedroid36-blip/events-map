// Читающий зонд: карточки (не archived) с мусорным адресом из постов-источников.
// node --env-file=.env scripts/dot-junk-addr-probe.mjs
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE;
if (!url || !key) { console.error('Нужны SUPABASE_URL и SUPABASE_SERVICE_ROLE'); process.exit(1); }
const db = createClient(url, key, { auth: { persistSession: false } });

const JUNK = [
  /адрес\s+(отправим|уточн|позже|будет)/i,
  /уточня(й|йте|ем|ется)/i,
  /при\s+записи/i,
  /^север$/i, /^юг$/i, /север\b.*(город|окрест|район)/i,
  /где[- ]то/i, /примерно/i, /~?\s*\d+\s*км/i,
  /мост/i, /около\s/i,
  /^\s*[-—–]+\s*$/,
];

const rows = await selectAll(db, 'events',
  'id,status,title,title_ru,city,address,start_date,start_time,lat,lng,source_type,website,created_at');

const live = rows.filter(r => r.status !== 'archived');
const junk = live.filter(r => r.address && JUNK.some(re => re.test(r.address)));
const noAddr = live.filter(r => !r.address || !String(r.address).trim());

console.log(`живых (не archived): ${live.length}, из них без адреса ${noAddr.length}, с мусорным адресом ${junk.length}`);
for (const r of junk.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))) {
  console.log(`${r.id.slice(0, 8)} ${r.status} | ${r.title_ru || r.title} | ${r.city} | ${r.start_date} | адр="${r.address}" | ${r.website || 'САЙТ=НЕТ'}`);
}
console.log('--- без адреса ---');
for (const r of noAddr) {
  console.log(`${r.id.slice(0, 8)} ${r.status} | ${r.title_ru || r.title} | ${r.city} | ${r.start_date} | гео=${r.lat ?? 'НЕТ'},${r.lng ?? ''} | ${r.source_type} | ${r.website || 'САЙТ=НЕТ'}`);
}
