// Постоянный зонд «здоровье полей живых карточек»: один прогон — инварианты базы.
//
// Зачем: десятки одиночных зондов проверяют классы по отдельности, а поломка в
// базовом поле (нет города/координат/категории/website, битый start_time,
// end_date < start_date, дубль имя+город+день, «протухшая» карточка без повтора)
// видна только при полном обходе. Нормы и известные законные классы описаны ниже —
// всё, что вне них, печатается дефектом.
//
// Запуск: node --env-file=.env scripts/dot-field-health-probe.mjs
// Выход: код 1, если есть дефекты вне известных классов.

import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const db = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);

const COLS = 'id, title, title_ru, title_en, city, address, lat, lng, start_date, start_time, end_date, end_time, status, category_id, website, photos, source_type, recurrence';
const rows = await selectAll(db, 'events', COLS, { filter: (q) => q.in('status', ['active', 'moderation']) });
const live = rows.filter((r) => r.status === 'active');
const today = new Date().toISOString().slice(0, 10);

// Классы, проверенные ранее и признанные законными (не дефект):
//  - нет photos: источник их не публикует (замеры 321/328/339)
//  - city с латиницей у Бали: метка канона района строится как «<район>, Bali» (дизайн)
//  - нет start_time / 00:00: «время не указано» у Балифорума и «весь день» у Cyprus Now (замер 362)
//  - прошлое без повтора: дата в прошлом у карточки с будущим end_date — многодневное событие
const KNOWN = {
  photos: 'источник фото не даёт (закрыто 321/328/339)',
  baliCity: '«<район>, Bali» — дизайн метки',
};

const checks = [];
const add = (name, list, opts = {}) => checks.push({ name, list, ...opts });

add('нет city', live.filter((r) => !r.city));
add('нет координат', live.filter((r) => r.lat == null || r.lng == null));
add('нет start_date', live.filter((r) => !r.start_date));
add('end_date < start_date', live.filter((r) => r.end_date && r.start_date && r.end_date < r.start_date));
add('нет category_id', live.filter((r) => !r.category_id));
add('нет website (источник не указан)', live.filter((r) => !r.website));
add('нет source_type', live.filter((r) => !r.source_type));
add('start_time не HH:MM', live.filter((r) => r.start_time && !/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(r.start_time)));
add('end_time не HH:MM', live.filter((r) => r.end_time && !/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(r.end_time)));
add('recurrence без freq', live.filter((r) => r.recurrence && typeof r.recurrence === 'object' && Object.keys(r.recurrence).length > 0 && !r.recurrence.freq));
add('прошлое без повтора и без будущего end_date', live.filter((r) => r.start_date && r.start_date < today && !(r.end_date && r.end_date >= today) && !(r.recurrence && Object.keys(r.recurrence).length)));

// дубль «имя + город + день» среди живых
const seen = new Map();
const dupes = [];
for (const r of live) {
  const k = `${(r.title || '').toLowerCase().trim()}|${r.city || ''}|${r.start_date || ''}`;
  if (seen.has(k)) dupes.push(r); else seen.set(k, r.id);
}
add('одно имя + город + день дважды', dupes);

// известные классы — считаем, но дефектом не считаем
const known = [];
const noPhotos = live.filter((r) => !Array.isArray(r.photos) || r.photos.length === 0);
if (noPhotos.length) known.push(`нет photos: ${noPhotos.length} (${KNOWN.photos})`);

console.log(`Живых (active): ${live.length} | moderation: ${rows.filter((r) => r.status === 'moderation').length} | сегодня ${today}`);

let defects = 0;
for (const c of checks) {
  if (!c.list.length) continue;
  defects += c.list.length;
  console.log(`\nДЕФЕКТ [${c.name}] ${c.list.length}`);
  for (const r of c.list.slice(0, 5)) console.log(`  - ${r.id.slice(0, 8)} | ${r.city || '—'} | ${r.start_date || '—'} | ${String(r.title || '').slice(0, 58)}`);
  if (c.list.length > 5) console.log(`  … ещё ${c.list.length - 5}`);
}
for (const k of known) console.log(`\nНОРМА: ${k}`);

console.log(defects ? `\nИТОГО дефектов: ${defects}` : '\nИТОГО дефектов: 0 — все инварианты в норме');
process.exit(defects ? 1 : 0);
