// Читающий зонд: живые карточки с адресом-отговоркой «после регистрации/записи» и роднёй.
// node --env-file=.env scripts/dot-addr-junk2-probe.mjs
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
import { isJunkAddress } from './address-junk.mjs';

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE;
if (!url || !key) { console.error('Нужны SUPABASE_URL и SUPABASE_SERVICE_ROLE'); process.exit(1); }
const db = createClient(url, key, { auth: { persistSession: false } });

const RE = [/регистрац/i, /записи/i, /запис[ье]/i, /позже/i, /уточн/i, /сообщим/i, /отдельно/i, /по\s+ссылке/i, /see\s+link/i, /tba\b/i];
const RE_ALL = [/регистрац/i, /записи/i, /позже/i, /уточн/i, /сообщим/i, /отдельно/i];

const rows = await selectAll(db, 'events',
  'id,status,title,title_ru,city,address,start_date,start_time,lat,lng,source_type,website,created_at');
const live = rows.filter(r => r.status !== 'archived');
const lack = live.filter(r => r.address && !isJunkAddress(r.address) && RE.some(re => re.test(r.address)));
console.log(`живых ${live.length}; адрес с «отговоркой», которую фильтр НЕ ловит: ${lack.length}`);
for (const r of lack) {
  console.log(`${r.id.slice(0,8)} ${r.status} | ${r.title_ru || r.title} | ${r.city} | ${r.start_date} ${r.start_time || '--:--'} | адр="${r.address}" | ${r.website || 'САЙТ=НЕТ'}`);
}
console.log('--- широкая выборка (регистрац/записи/позже/уточн/сообщим/отдельно) ---');
const wide = live.filter(r => r.address && RE_ALL.some(re => re.test(r.address)));
for (const r of wide) {
  console.log(`${r.id.slice(0,8)} ${r.status} | junk=${isJunkAddress(r.address) ? 'да' : 'НЕТ'} | ${r.city} | адр="${r.address}" | ${r.website || 'САЙТ=НЕТ'}`);
}
