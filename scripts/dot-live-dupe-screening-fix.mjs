// Юнит+ремонт прогона 124: разные события одного кинотеатра (разные фильмы/сеансы
// в один день) больше не склеиваются правилами «живой дубль» и «аббревиатура».
// С APPLY=1 возвращает 12 ошибочно архивных карточек Paradiso Ubud в moderation
// (ничего не удаляет и не публикует).
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
import { liveDupeMatch, liveAbbrevMatch, liveLangPlaceMatch, overlap, dayKey } from './live-dupe-key.mjs';

const A = (o) => ({ title: null, title_ru: null, title_en: null, address: null, lat: null, lng: null, start_time: null, ...o });
const ADDR = 'Jl. Goutama Sel., Ubud, Kec. Gianyar, Kabupaten Gianyar, Bali';
const C = { city: 'Убуд, Bali', start_date: '2026-10-09', address: ADDR };
const match = (a, b) => liveDupeMatch(a, b) || liveAbbrevMatch(a, b) || liveLangPlaceMatch(a, b);

const SHOULD_NOT_MERGE = [
  [A({ ...C, title: 'Кинопоказ Gran Torino в Paradiso Ubud 9 октября', start_time: '16:00:00' }),
   A({ ...C, title: 'Кинопоказ Sense and Sensibility в Paradiso Ubud 9 октября', start_time: '16:00:00' })],
  [A({ ...C, title: 'Кинопоказ Gran Torino в Paradiso Ubud 9 октября', start_time: '16:00:00' }),
   A({ ...C, title: '5Rhythms: занятие по движению в Paradiso Ubud 9 октября', start_time: '11:00:00' })],
  [A({ ...C, title: 'Кинопоказ Burlesque в Paradiso Ubud 9 октября', start_time: '19:00:00' }),
   A({ ...C, title: 'Контактная импровизация Dissolve: Eros в Paradiso Ubud 13 октября', start_time: '18:00:00' })],
];
const SHOULD_MERGE = [
  // одно событие из двух источников: общий фильм + площадка, разные языки/хвост
  [A({ ...C, title: 'Кинопоказ Gran Torino в Paradiso Ubud 9 октября', start_time: '16:00:00' }),
   A({ ...C, title: 'Gran Torino Film Screening at Paradiso Ubud', title_en: 'Gran Torino', start_time: '16:00:00' })],
  // две записи одного шоу с общим набором значимых слов (без слов площадки)
  [A({ city: 'Никосия, Кипр', start_date: '2026-11-27', address: 'Nicosia Municipal Theatre', title: 'Spartacus Ballet: Grand International Classic Ballet Show', start_time: '19:30:00' }),
   A({ city: 'Никосия, Кипр', start_date: '2026-11-27', address: 'Nicosia Municipal Theatre', title: 'Spartacus Ballet Grand Classic Show', start_time: '19:30:00' })],
];

let ok = 0, bad = 0;
for (const [a, b] of SHOULD_NOT_MERGE) {
  const r = match(a, b);
  if (r) { bad++; console.log('ПЛОХО склеились:', a.title, '||', b.title, '=>', r); } else ok++;
}
for (const [a, b] of SHOULD_MERGE) {
  const r = match(a, b);
  if (!r) { bad++; console.log('ПЛОХО не склеились (регресс):', a.title, '||', b.title, '| overlap', overlap(a, b)); }
  else { ok++; console.log('ОК склейка:', r); }
}
console.log(`ЮНИТ: ${ok}/${ok + bad} OK`);

const APPLY = process.env.APPLY === '1';
const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });
const all = await selectAll(db, 'events', 'id,title,title_ru,title_en,city,address,lat,lng,start_date,start_time,status,created_at,website');

// регресс на живых данных: правила всё ещё ловят настоящие пары
const live = all.filter((r) => ['active', 'moderation', 'needs_changes'].includes(r.status));
let realMatches = 0;
const byDay = new Map();
for (const r of live) { const k = dayKey(r); if (!byDay.has(k)) byDay.set(k, []); byDay.get(k).push(r); }
for (const list of byDay.values()) {
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) if (match(list[i], list[j])) realMatches++;
}
console.log(`живых ${live.length}; пар, склеиваемых правилами (регресс-сигнал): ${realMatches}`);

// ремонт: весь класс «карточки Paradiso Ubud, ошибочно склеенные правилом»
const win = all.filter((r) => r.status === 'archived' && /goutama/i.test(r.address || '')
  && r.created_at >= '2026-10-09T04:40:00Z');
console.log(`класс «Paradiso Ubud» (архивные с адресом Goutama): ${win.length} из них созданы в этом окне: ${win.filter((r) => r.created_at >= '2026-10-09T04:40:00Z').length}`);
let applied = 0;
for (const r of win.sort((a, b) => a.created_at.localeCompare(b.created_at))) {
  const twin = all.find((x) => x.id !== r.id && ['active', 'moderation', 'needs_changes'].includes(x.status) &&
    x.start_date === r.start_date && String(x.title_ru || x.title).trim().toLowerCase() === String(r.title_ru || r.title).trim().toLowerCase());
  if (twin) { console.log('  пропуск (есть живой близнец):', r.id.slice(0, 8), r.title.slice(0, 40)); continue; }
  if (!APPLY) { console.log('  DRY -> moderation:', r.created_at.slice(0, 10), r.id.slice(0, 8), r.get_start || '', r.title.slice(0, 45)); applied++; continue; }
  const { data, error } = await db.from('events').update({ status: 'moderation' }).eq('id', r.id).select('id,status');
  if (error || !data?.length) { console.log('  ОШИБКА', r.id.slice(0, 8), error?.message || 'не применилось'); continue; }
  console.log('  вернул в moderation:', r.id.slice(0, 8), r.title.slice(0, 45));
  applied++;
}
console.log(`${APPLY ? 'Применено' : 'DRY: к возврату'}: ${applied}`);
