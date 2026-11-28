#!/usr/bin/env node
// Запуск 1122: остаток правила townFromName (1121) — метка округа, где источник называет ГОРОДОК.
// Найдено переписью по снимку (scripts/dot-1122-townname-census.mjs, 0 запросов к базе):
// правило меняет метку у 10 карточек: 7 марины (уже в dot-1114), Протарас (173fc77c — это ДУБЛЬ,
// его снимает dot-1098, город не трогаем) и две эти:
//   816c5a16 «Пафос, Кипр» -> «Полис»          (адрес «Central Square, Polis Chrysochous»)
//   1adc7ca3 «Фамагуста, Кипр» -> «Паралимни»  (адрес «Christmas Strawberry Land», название «... in Paralimni»)
// Адрес и пин НЕ меняются (ключ дедупа), меняется только city. DRY по умолчанию, APPLY=1.
import { createClient } from '@supabase/supabase-js';
import { townFromName } from './cy-districts.mjs';

const URL_ = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE;
if (!URL_ || !KEY) { console.error('нет ключей (SUPABASE_URL / SUPABASE_SERVICE_ROLE)'); process.exit(1); }
const db = createClient(URL_, KEY, { auth: { persistSession: false } });
const APPLY = process.env.APPLY === '1';

const TARGETS = [
  { pref: '816c5a16', from: 'Пафос', to: 'Полис', need: /polis/i },
  { pref: '1adc7ca3', from: 'Фамагуста', to: 'Паралимни', need: /paralimni|παραλίμνι/i },
];

let fixed = 0, skipped = 0;
for (const t of TARGETS) {
  const res = await db.from('events').select('id,title,title_en,title_ru,address,city,status')
    .eq('status', 'active').ilike('city', `%${t.from}%`).limit(200);
  if (res.error) {
    const msg = String(res.error.message || '');
    if (/402|egress/i.test(msg + JSON.stringify(res.error))) { console.error('402 egress quota — ремонт отменён'); process.exit(1); }
    console.error('Ошибка чтения:', msg); process.exit(1);
  }
  const row = (res.data || []).find(r => String(r.id).startsWith(t.pref));
  if (!row) { console.log('MISS', t.pref); skipped++; continue; }
  const text = [row.address, row.title, row.title_en, row.title_ru].filter(Boolean).join(' | ');
  const verdict = townFromName(row.city, text);
  const ok = verdict === t.to && t.need.test(text);
  console.log(t.pref, '|', String(row.title).slice(0, 55), '| city:', row.city, '| правило ->', verdict);
  if (!ok) { console.log('  SKIP: гейт не пройден (правило/улика не совпали)'); skipped++; continue; }
  const city = `${t.to}, Кипр`;
  if (!APPLY) { console.log(`  DRY: city -> «${city}»`); fixed++; continue; }
  const up = await db.from('events')
    .update({ city, auto_review: { verdict: 'publish', reason: 'city-fix', note: `dot 1122: адрес/название называют городок ${t.to}, метка округа ${t.from} заменена (правило townFromName, 1121)` } })
    .eq('id', row.id).eq('status', 'active').select('id,city');
  if (up.error) { console.error('  Ошибка записи:', up.error.message); continue; }
  console.log('  APPLIED:', JSON.stringify(up.data));
  fixed++;
}
console.log(`Итог: правок ${fixed}, пропусков ${skipped}, режим ${APPLY ? 'APPLY' : 'DRY'}`);
