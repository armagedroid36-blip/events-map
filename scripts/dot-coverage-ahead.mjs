#!/usr/bin/env node
// Зонд покрытия «впереди»: у каждой живой метки city должно быть будущее событие.
// Считает по городам: живых, будущих в горизонте N дней, будущих ЗА горизонтом, регулярных.
// Метка, у которой нет НИ одного будущего события, — кандидат «фильтр города пуст навсегда».
// Запуск: node --env-file=.env scripts/dot-coverage-ahead.mjs [DAYS=30]
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const DAYS = Number(process.argv[2] || 30);
const db = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);

const rows = await selectAll(db, 'events', 'id,city,start_date,end_date,recurrence,status,lat', { filter: (q) => q.eq('status', 'active') });
const iso = (d) => d.toISOString().slice(0, 10);
const today = iso(new Date());
const horizon = iso(new Date(Date.now() + DAYS * 864e5));

const hasRec = (r) => r && typeof r === 'object' && (r.freq || (Array.isArray(r.days) && r.days.length));
const cities = new Map();
let noCoords = 0;
for (const ev of rows) {
  if (ev.lat == null) noCoords++;
  const city = (ev.city || '(без города)').trim();
  const c = cities.get(city) || { live: 0, inHorizon: 0, beyond: 0, rec: 0, past: 0, next: null };
  c.live++;
  const sd = ev.start_date || null;
  const ed = ev.end_date || sd;
  if (hasRec(ev.recurrence)) { c.rec++; c.inHorizon++; }
  else if (sd && ed && ed >= today && sd <= horizon) { c.inHorizon++; }
  else if (sd && sd > horizon) { c.beyond++; }
  else { c.past++; }
  if (sd && (!c.next || sd < c.next)) c.next = sd;
  cities.set(city, c);
}

console.log(`Живых карточек: ${rows.length}, без координат: ${noCoords}. Горизонт: ${DAYS} дн. (${today} → ${horizon}).`);
console.log(`Меток city: ${cities.size}\n`);
console.log('city | живых | в горизонте | за горизонтом | регулярных | ближайшая');
const sorted = [...cities.entries()].sort((a, b) => b[1].live - a[1].live);
for (const [city, c] of sorted) {
  const mark = c.inHorizon === 0 && c.beyond === 0 ? '  <== ПУСТО ВПЕРЁД' : c.inHorizon === 0 ? '  (только за горизонтом)' : '';
  console.log(`${city} | ${c.live} | ${c.inHorizon} | ${c.beyond} | ${c.rec} | ${c.next || '—'}${mark}`);
}
const empty = sorted.filter(([, c]) => c.inHorizon === 0 && c.beyond === 0).map(([k]) => k);
const farOnly = sorted.filter(([, c]) => c.inHorizon === 0 && c.beyond > 0).map(([k]) => k);
console.log(`\nПУСТО ВПЕРЁД (нет ни одного будущего события): ${empty.length}${empty.length ? ' — ' + empty.join(', ') : ''}`);
console.log(`Только за горизонтом: ${farOnly.length}${farOnly.length ? ' — ' + farOnly.join(', ') : ''}  (не дефект: дата позже ${horizon})`);
