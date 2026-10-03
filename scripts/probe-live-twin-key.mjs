// Кто «живой близнец» для e086a01c / edb5fbd6 по ключу pruneArchivedCopies
// (первые 3 слова названия + дата + время + адрес).
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });
const rows = await selectAll(db, 'events', 'id, title, title_ru, start_date, start_time, address, city, status, created_at, website');
const norm = (s) => (s || '').toLowerCase().replace(/[^a-zа-яё0-9]+/gi, ' ').trim();
const prefixKey = (e) => {
  const words = norm(e.title_ru || e.title).replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(/\s+/).slice(0, 3).join(' ');
  const addr = norm(e.address);
  if (!words || !addr || !e.start_time) return null;
  return [e.start_date, e.start_time, addr, words].join('|');
};

for (const id of ['e086a01c', 'edb5fbd6']) {
  const r = rows.find((x) => x.id.startsWith(id));
  if (!r) { console.log(id, 'нет'); continue; }
  const k = prefixKey(r);
  console.log(`\n== ${id} | ${r.status} | ${r.start_date} ${r.start_time} | ${r.city} | адрес: ${JSON.stringify(r.address)}`);
  console.log(`   title="${r.title}" ru="${r.title_ru}"`);
  console.log(`   key="${k}"`);
  const same = rows.filter((o) => o.id !== r.id && prefixKey(o) === k && k);
  for (const o of same) console.log(`   ОДИН ключ: ${o.status} | ${o.id.slice(0, 8)} | ${o.start_date} ${o.start_time} | создано ${o.created_at} | ${(o.title_ru || o.title || '').slice(0, 60)} | ${o.website || '-'}`);
  if (!same.length) console.log('   совпадений по ключу нет');
}
