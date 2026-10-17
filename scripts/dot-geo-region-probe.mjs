// Запуск 302: зонд «пин вне своего региона» — живая карточка с меткой города одной
// гео-зоны, а координата лежит далеко за её границами (чужой город/страна).
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });

const BOX = [
  ['Кипр', /кипр|cyprus|nicosia|limassol|larnaca|paphos|famagusta|ayia napa|protaras|paralimni|лимасол|никосия|ларнака|пафос|ая-напа|ая напа|протарас|паралимни|фамагуста/i, 34.50, 35.75, 31.95, 34.70],
  ['Бали', /бали|bali|ubud|changu|canggu|seminyak|kuta|denpasar|samur|sanur|jimbaran|amed|lovina|sidemen|уbud|убуд|чангу|семиньяк|кута|денпасар|санур|джимбаран|амед|ловина|сидемен/i, -8.98, -8.00, 114.35, 115.80],
  ['Нячанг', /нячанг|nha trang/i, 12.00, 12.60, 108.85, 109.50],
  ['Дананг', /дананг|da nang|danang|đà nẵng/i, 15.85, 16.30, 107.75, 108.50],
];

const all = await selectAll(db, 'events', 'id,title,title_ru,city,address,lat,lng,status,start_date,website,source_type');
const live = all.filter((r) => ['active', 'moderation', 'needs_changes'].includes(r.status));
console.log(`всего ${all.length} | живых ${live.length}`);

const cand = [];
for (const r of live) {
  if (r.lat == null || r.lng == null || !r.city) continue;
  const box = BOX.find(([, re]) => re.test(r.city));
  if (!box) continue;
  const [name, , la1, la2, lo1, lo2] = box;
  if (r.lat >= la1 && r.lat <= la2 && r.lng >= lo1 && r.lng <= lo2) continue;
  cand.push({ ...r, zone: name });
}

console.log(`кандидатов «пин вне региона метки»: ${cand.length}`);
for (const r of cand) {
  console.log([r.id.slice(0, 8), r.status, r.zone, r.city, r.start_date, r.lat + ',' + r.lng, 'адр=' + (r.address || '—'), (r.title_ru || r.title || '').slice(0, 45)].join(' | '));
}

// обратный счёт: сколько карточек зоны вообще (для контекста)
const perZone = {};
for (const r of live) {
  if (r.lat == null) continue;
  const box = BOX.find(([, re]) => re.test(r.city || ''));
  if (!box) continue;
  perZone[box[0]] = (perZone[box[0]] || 0) + 1;
}
console.log('живых с гео по зонам:', JSON.stringify(perZone));
