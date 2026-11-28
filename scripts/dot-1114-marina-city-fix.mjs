#!/usr/bin/env node
// Запуск 1114: метка города у карточек Айя-Напа Марины.
// Найдено по прод-снимку: живые карточки стоят на точке Ayia Napa Marina
// (34.9792332, 33.9430015), адрес называет «Ayia Napa Marina», но city = «Фамагуста, Кипр»
// (округ), тогда как соседние карточки той же марины (7d1ddcb7, 89c55c3a) метят «Ая-Напа, Кипр».
// Точка в 2.1 км от центра Ая-Напы и в 10+ км от Фамагусты ⇒ по правилу snapDistrictLabel (3 км) — Ая-Напа.
// 1120: замер «одна точка — разные города» по снимку показал, что класс шире: у точки марины
// 7 карточек с меткой округа, а не 2 (добавлены a5eca9bc, 04d3b262, 722dfea4, 41dd84b0, 6e4d3308).
// Это разные даты серии, не дубли (проверено по start_date).
// Адрес и пин НЕ меняются (ключ дедупа city|title+address — меняется только city, как в 1093).
// DRY по умолчанию. APPLY=1 — запись. При 402 — отказ, exit 1.
import { createClient } from '@supabase/supabase-js';

const URL_ = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE;
if (!URL_ || !KEY) { console.error('нет ключей (SUPABASE_URL / SUPABASE_SERVICE_ROLE)'); process.exit(1); }
const db = createClient(URL_, KEY, { auth: { persistSession: false } });
const APPLY = process.env.APPLY === '1';

const MARINA = { lat: 34.9792332, lng: 33.9430015 };
const TARGETS = [
  { pref: '018d7128', title: 'Christmas Village in Ayia Napa Marina' },
  { pref: '0f543525', title: 'Starlit Screens Goes Festive' },
  { pref: 'a5eca9bc', title: 'Christmas Sip & Paint in Ayia Napa' },
  { pref: '04d3b262', title: 'Christmas Village at Ayia Napa Marina 2026' },
  { pref: '722dfea4', title: 'Starlit Screens Goes Festive' },
  { pref: '41dd84b0', title: 'Christmas Sip & Paint in Ayia Napa' },
  { pref: '6e4d3308', title: 'Christmas Village at Ayia Napa Marina 2026' },
];
const d2 = (a, b) => { const R = 6371; const dx = (b.lat - a.lat) * 111.32; const dy = (b.lng - a.lng) * 111.32 * Math.cos(a.lat * Math.PI / 180); return Math.hypot(dx, dy); };

const res = await db.from('events').select('id,title,city,address,lat,lng,status').eq('status', 'active')
  .gte('lat', MARINA.lat - 0.01).lte('lat', MARINA.lat + 0.01)
  .gte('lng', MARINA.lng - 0.01).lte('lng', MARINA.lng + 0.01);
if (res.error) {
  const msg = String(res.error.message || '');
  if (/402|egress/i.test(msg + JSON.stringify(res.error))) { console.error('402 egress quota — ремонт отменён'); process.exit(1); }
  console.error('Ошибка чтения:', msg); process.exit(1);
}
const rows = res.data || [];
console.log('Рядом с мариной живых:', rows.length);
let fixed = 0, skipped = 0;
for (const t of TARGETS) {
  const row = rows.find(r => r.id.startsWith(t.pref));
  if (!row) { console.log('MISS', t.pref, t.title); skipped++; continue; }
  const dist = d2(MARINA, row);
  const okAddr = /ayia napa marina/i.test(row.address || '');
  const okCity = (row.city || '').startsWith('Фамагуста');
  console.log(t.pref, '|', row.title, '| city:', row.city, '| dist:', dist.toFixed(3), 'км | адрес марины:', okAddr);
  if (dist > 0.15 || !okAddr || !okCity) { console.log('  SKIP: гейт не пройден'); skipped++; continue; }
  if (!APPLY) { console.log('  DRY: city -> «Ая-Напа, Кипр»'); fixed++; continue; }
  const up = await db.from('events').update({ city: 'Ая-Напа, Кипр', auto_review: { verdict: 'publish', reason: 'city-fix', note: 'dot 1114: точка и адрес — Ayia Napa Marina, метка округа Фамагуста заменена на город, как у соседних карточек марины' } })
    .eq('id', row.id).eq('status', 'active').select('id,city');
  if (up.error) { console.error('  Ошибка записи:', up.error.message); continue; }
  console.log('  APPLIED:', JSON.stringify(up.data));
  fixed++;
}
console.log(`Итог: правок ${fixed}, пропусков ${skipped}, режим ${APPLY ? 'APPLY' : 'DRY'}`);
