// Ремонт класса «адрес карточки = сырые координаты / место сбора» (dot-events).
// DRY:  node --env-file=.env scripts/dot-coord-addr-fix.mjs
// APPLY: APPLY=1 node --env-file=.env scripts/dot-coord-addr-fix.mjs
// Страховки: карточка active, адрес в базе ровно ожидаемый, фильтр считает его мусором.
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
import { isJunkAddress } from './address-junk.mjs';

const APPLY = process.env.APPLY === '1';

const TARGETS = [
  ['0af0a574', '16.0428842,108.2518050', 'https://t.me/danang_afisha/5592'],
  ['d4a438a0', '16.0428842,108.2518050', 'https://t.me/danang_afisha/5715'],
  ['fee3ae05', '16.0428842,108.2518050', 'https://t.me/danang_afisha/5622'],
  ['ee01a275', 'Сбор: здесь (центр)', 'https://t.me/nyachang_ru/24154'],
];

const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
const rows = await selectAll(db, 'events', 'id,status,address,city,start_date,website,lat,lng');

let applied = 0, skipped = 0, errors = 0;
for (const [prefix, expected, src] of TARGETS) {
  const r = rows.find((x) => x.id.startsWith(prefix));
  if (!r) { console.log(`[skip] ${prefix} — не найдено в базе`); skipped++; continue; }
  if (r.status !== 'active') { console.log(`[skip] ${prefix} — статус ${r.status}`); skipped++; continue; }
  if (String(r.address || '').trim() !== expected) { console.log(`[skip] ${prefix} — адрес не совпал: "${r.address}"`); skipped++; continue; }
  if (!isJunkAddress(expected)) { console.log(`[skip] ${prefix} — фильтр адрес мусором не считает`); skipped++; continue; }
  if (expected.includes('16.04') && !(r.lat > 15.9 && r.lat < 16.2 && r.lng > 108.1 && r.lng < 108.4)) {
    console.log(`[skip] ${prefix} — пин не у координаты из адреса (${r.lat},${r.lng})`); skipped++; continue;
  }
  console.log(`[${APPLY ? 'apply' : 'dry'}] ${prefix} ${r.city} ${r.start_date} источник ${r.website || src} — адрес "${r.address}" -> null`);
  if (!APPLY) continue;
  const { data, error } = await db.from('events').update({ address: null }).eq('id', r.id).select('id');
  if (error || !data?.length) { console.log(`[error] ${prefix}: ${error?.message}`); errors++; } else applied++;
}

console.log(`итого: применено ${applied}, пропущено ${skipped}, ошибок ${errors}${APPLY ? '' : ' (DRY)'}`);
