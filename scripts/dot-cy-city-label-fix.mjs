// Ремонт метки города: фикс-скрипты писали голую «Никосия» (cityForPoint) вместо канона «Никосия, Кипр»,
// из-за чего фильтр по городу на карте разъединялся (4 живые карточки).
// DRY по умолчанию, APPLY=1 — запись. Страховки: статус active, city ровно голая метка, округ точки = Никосия.
// Запуск из корня: node --env-file=.env scripts/dot-cy-city-label-fix.mjs [APPLY=1]
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
import { districtOf, districtOfCity } from './cy-districts.mjs';

const APPLY = process.env.APPLY === '1';
const TARGETS = [
  { id: '1685ff91', from: 'Никосия', to: 'Никосия, Кипр', why: 'запуск 67: city Лимасол -> Никосия (DownTown Live, Strovolos)' },
  { id: 'eb163ace', from: 'Никосия', to: 'Никосия, Кипр', why: 'запуск 67: city Лимасол -> Никосия (DownTown Live, Strovolos)' },
  { id: '4cf5d3f2', from: 'Никосия', to: 'Никосия, Кипр', why: 'запуск 64: city Лимасол -> Никосия (Kalopanayiotis)' },
  { id: 'd26c7381', from: 'Никосия', to: 'Никосия, Кипр', why: 'запуск 64: city Лимасол -> Никосия (Pedoulas)' },
];

const db = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE,
  { auth: { persistSession: false } },
);
const rows = await selectAll(db, 'events', 'id,status,title,city,address,lat,lng,start_date,website');
const byId = new Map(rows.map((r) => [String(r.id).slice(0, 8), r]));

let applied = 0, skipped = 0, errors = 0;
for (const t of TARGETS) {
  const card = byId.get(t.id);
  if (!card) { console.log(t.id, 'не найдена'); skipped++; continue; }
  const title = (card.title || card.title_ru || '').slice(0, 45);
  if (card.status !== 'active') { console.log(t.id, `«${title}»: статус ${card.status} — пропуск`); skipped++; continue; }
  if (card.city !== t.from) { console.log(t.id, `«${title}»: city «${card.city}» не равна ожидаемой «${t.from}» — пропуск`); skipped++; continue; }
  const d = districtOf(card.lat, card.lng);
  const expect = districtOfCity(t.to);
  if (d !== expect) { console.log(t.id, `«${title}»: округ точки ${d} != округ метки ${expect} — пропуск`); skipped++; continue; }
  const line = `${t.id} «${title}» (${card.start_date}, ${card.lat},${card.lng}): city «${card.city}» -> «${t.to}» | ${t.why}`;
  if (!APPLY) { console.log('DRY:', line); continue; }
  const { data, error } = await db.from('events').update({ city: t.to }).eq('id', card.id).select('id,city,status');
  if (error) { console.log(t.id, 'ОШИБКА:', error.message); errors++; continue; }
  const back = data && data[0];
  if (!back || back.city !== t.to) { console.log(t.id, 'запись не подтвердилась:', JSON.stringify(data)); errors++; continue; }
  console.log('применено:', line, '-> перечитано', back.city, back.status);
  applied++;
}
console.log(`\nитог: ${APPLY ? 'применено' : 'к применению'} ${APPLY ? applied : TARGETS.length - skipped}, пропущено ${skipped}, ошибок ${errors}`);

// Побочный разбор: единственная карточка «Джакарта» (вне геофокуса — вероятная ошибка метки)
const jk = rows.filter((r) => r.status === 'active' && r.city === 'Джакарта');
for (const r of jk)
  console.log('Джакарта:', String(r.id).slice(0, 8), r.start_date, r.lat, r.lng, '|', (r.address || 'нет адреса').slice(0, 60), '|', (r.website || '').slice(0, 60), '|', (r.title || '').slice(0, 50));
