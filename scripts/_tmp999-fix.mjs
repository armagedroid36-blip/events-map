// 999: замер «живых карточек, чей address фильтр уже считает мусором» + разовый ремонт.
// Запуск: node --env-file=.env scripts/_tmp999-fix.mjs   (без APPLY — только замер)
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
import { isJunkAddress } from './address-junk.mjs';

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY;
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const rows = await selectAll(db, 'events', 'id,address,city,title,start_date,status', {
  filter: (q) => q.eq('status', 'active'),
});
const bad = rows.filter((r) => r.address && isJunkAddress(r.address));
console.log('живых:', rows.length, '| address, который фильтр считает мусором:', bad.length);
for (const r of bad) console.log(`- ${r.id} | ${r.city} | ${String(r.address).slice(0, 90)}`);

if (process.env.APPLY === '1') {
  let ok = 0;
  for (const r of bad) {
    const { data, error } = await db
      .from('events')
      .update({
        address: null,
        auto_review: {
          verdict: 'publish',
          reason: 'address-junk: в адрес попал текст поста/ссылка, а не улица (кейс 999)',
          at: new Date().toISOString(),
        },
      })
      .eq('id', r.id)
      .eq('status', 'active')
      .select('id,address');
    if (error) { console.log('ERR', r.id, error.message); continue; }
    if (data && data.length) { ok += 1; console.log('PATCH ok', r.id, 'address =', data[0].address); }
  }
  console.log('исправлено:', ok);
}
