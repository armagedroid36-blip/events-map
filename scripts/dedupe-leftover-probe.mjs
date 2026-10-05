// Диагностика лида «Контроль: групп дублей осталось — 11».
//
// Гипотеза: контрольное чтение в dedupe-events.mjs (строка ~510) берёт список
// колонок БЕЗ address (и без title_ru). В live-dupe-key.mjs функция
// isCityLevelAddr() считает отсутствующий адрес «адресом уровня города», поэтому
// правило «живой дубль» вырождается: любая пара одного дня+города с 3+ общими
// словами названия и координатами в пределах 5 км объявляется дублем.
// Проверка: посчитать пары по обоим наборам колонок на одних и тех же строках.
//
// Запуск: node --env-file=.env scripts/dedupe-leftover-probe.mjs
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
import * as liveDupe from './live-dupe-key.mjs';

const db = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE,
  { auth: { persistSession: false } });

const STATUSES = ['active', 'moderation', 'needs_changes'];
const FULL = ['id', 'title', 'title_ru', 'title_en', 'city', 'address', 'status', 'created_at',
  'start_date', 'start_time', 'end_date', 'recurrence', 'lat', 'lng'].join(',');
const NARROW = 'id,title,title_en,start_date,city,status,created_at,start_time,recurrence,end_date,lat,lng';

function scan(rows) {
  const buckets = new Map();
  for (const e of rows) {
    const k = liveDupe.dayKey(e);
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(e);
  }
  const pairs = [];
  for (const list of buckets.values()) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const reason = liveDupe.liveDupeMatch(list[i], list[j]) || liveDupe.liveAbbrevMatch(list[i], list[j]);
        if (reason) pairs.push({ a: list[i], b: list[j], reason });
      }
    }
  }
  return pairs;
}

const show = (p) => `${p.a.id.slice(0, 8)}[${p.a.status}] ${p.a.start_date} ${p.a.city || '—'} «${String(p.a.title).slice(0, 38)}» ↔ ` +
  `${p.b.id.slice(0, 8)}[${p.b.status}] «${String(p.b.title).slice(0, 38)}» — ${p.reason}`;

const full = await selectAll(db, 'events', FULL, { filter: (q) => q.in('status', STATUSES) });
const narrow = await selectAll(db, 'events', NARROW, { filter: (q) => q.in('status', STATUSES) });
console.log(`Живых карточек: полный набор колонок ${full.length}, контрольный (без address/title_ru) ${narrow.length}`);
const pf = scan(full);
const pn = scan(narrow);
console.log(`Пар «живой дубль»: полный набор — ${pf.length}, контрольный — ${pn.length}`);
console.log('');
console.log('Пары, которых НЕ ВИДНО на полном наборе (артефакт контрольного чтения):');
const fullKeys = new Set(pf.map((p) => [p.a.id, p.b.id].sort().join('|')));
for (const p of pn.filter((p) => !fullKeys.has([p.a.id, p.b.id].sort().join('|')))) console.log(`  ${show(p)}`);
