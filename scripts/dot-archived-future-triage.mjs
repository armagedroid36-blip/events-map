// Триаж архивных карточек с будущей датой, у которых нет живого близнеца по
// «живому дублю»: не потерялось ли событие с карты (обе копии в архиве / нет
// ни одной active-карточки того же события в тот же день и город).
// Запуск: node --env-file=.env scripts/dot-archived-future-triage.mjs <id1> [id2 ...]
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
import { norm, cityKey, overlap, words, samePlace } from './live-dupe-key.mjs';

const ids = process.argv.slice(2).filter((a) => /^[0-9a-f-]{8,}$/i.test(a));
const db = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });
const cols = 'id,title,title_ru,title_en,city,address,start_date,start_time,status,website,source_type,lat,lng,created_at';
const rows = await selectAll(db, 'events', cols);
const byId = new Map(rows.map((r) => [r.id, r]));
const live = rows.filter((r) => r.status === 'active' || r.status === 'moderation');

for (const id of ids) {
  const a = byId.get(id) || rows.find((r) => r.id.startsWith(id));
  if (!a) { console.log(`${id}: не найдено`); continue; }
  const day = (a.start_date || '').slice(0, 10), ck = cityKey(a);
  console.log(`\n### ${a.id.slice(0, 8)} ${day} ${ck} status=${a.status} «${a.title_ru || a.title}» ${a.address || '-'} ${a.start_time || ''}`);
  // все копии того же события в базе: в тот же день и город, пересечение слов >=3
  const copies = rows.filter((r) => r.id !== a.id && (r.start_date || '').slice(0, 10) === day && cityKey(r) === ck && overlap(a, r) >= 3);
  console.log(`  копии в тот же день/город (слов>=3): ${copies.length}`);
  for (const r of copies) console.log(`    ${r.status.padEnd(13)} ${r.id.slice(0, 8)} «${(r.title_ru || r.title).slice(0, 50)}» слов ${overlap(a, r)} место ${samePlace(a, r)} ${r.address || '-'}`);
  // любые live того же дня/города с тем же адресом или временем
  const near = live.filter((r) => (r.start_date || '').slice(0, 10) === day && cityKey(r) === ck && (norm(r.address) === norm(a.address) || (a.start_time && r.start_time === a.start_time)));
  console.log(`  live того же дня/города с тем же адресом/временем: ${near.length}`);
  for (const r of near) console.log(`    ACTIVE ${r.id.slice(0, 8)} «${(r.title_ru || r.title).slice(0, 50)}» ${r.address || '-'} ${r.start_time || ''}`);
}
