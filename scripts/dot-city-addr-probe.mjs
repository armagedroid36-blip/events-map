// Запуск 277: класс «адрес карточки = имя ГОРОДА с опечаткой ленты CN» («Limassol, Cypus»).
// DRY по умолчанию, APPLY=1 — правка: address -> канон city («Лимасол, Кипр»).
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
import { isCityOnlyVenue } from './cy-districts.mjs';

const APPLY = process.env.APPLY === '1';
const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });

if (process.env.UNIT === '1') {
  const cases = [
    ['Limassol, Cypus', true], ['Limassol', true], ['Nicosia', true], ['Paphos', true],
    ['Limassol, Cyprus', true], ['  famagusta ', true], ['Ayia Napa', true],
    ['Limassol Marina', false], ['Limassol Marina Square', false], ['Nicosia Municipal Theatre', false],
    ['Limassol Paradox Museum', false], ['Limassol Municipal Garden', false], ['Pattihio Municipal Theatre', false],
    ['Mason Bar', false], ['Monte Caputo', false], ['', false], [null, false],
  ];
  let ok = 0, bad = 0;
  for (const [inp, exp] of cases) {
    const got = isCityOnlyVenue(inp);
    if (got === exp) ok++; else { bad++; console.log(`ОШИБКА: ${JSON.stringify(inp)} -> ${got}, ожидалось ${exp}`); }
  }
  console.log(`юнит isCityOnlyVenue: ${ok}/${cases.length} ok, ошибок ${bad}`);
  process.exit(bad ? 1 : 0);
}

const all = await selectAll(db, 'events', 'id,title,title_ru,city,address,lat,lng,status,start_date,website,source_type');
const live = all.filter((r) => ['active', 'moderation', 'needs_changes'].includes(r.status));
const cand = live.filter((r) => r.address && isCityOnlyVenue(r.address));
console.log(`живых ${live.length} | кандидатов «адрес = имя города»: ${cand.length}`);
let applied = 0, skipped = 0, err = 0;
for (const r of cand) {
  const target = r.city && /кипр/i.test(r.city) ? r.city : null;
  console.log([r.id.slice(0, 8), r.status, r.city, r.start_date, 'адр=' + r.address, '->', target || '(город не канон, пропуск)', (r.title_ru || r.title || '').slice(0, 40)].join(' | '));
  if (!target) { skipped++; continue; }
  if (!APPLY) continue;
  const { error } = await db.from('events').update({ address: target }).eq('id', r.id).select('id');
  if (error) { err++; console.log('  ошибка:', error.message); } else applied++;
}
console.log(APPLY ? `применено ${applied}, пропущено ${skipped}, ошибок ${err}` : 'DRY (запуск с APPLY=1 чтобы применить)');
