// Разбор 4 «исключений» кипрского класса «city не по округу» — по страницам источника
// (cyprusnow.app читается через прокси 127.0.0.1:10809; JSON-LD + текст описания).
// Таблица ниже — только проверенные факты со страниц, без догадок.
// Запуск: node --env-file=.env scripts/dot-cy-tour-venue-fix.mjs [--apply]
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const APPLY = process.argv.includes('--apply');
const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);

// НИКОСИЯ-театр: Nominatim «Nicosia Municipal Theatre, Nicosia, Cyprus» -> 35.1726381, 33.3550588
// (Δημοτικό Θέατρο Λευκωσίας, 4, Λεωφόρος Μίκη Θεοδωράκη)
const NICOSIA_THEATRE = { lat: 35.1726381, lng: 33.3550588 };

const FIXES = [
  {
    prefix: '0342fad2',
    note: 'TEU16: страница источника — площадка «Famagusta Tennis Club», 3 Mesaorias Str, geo 34.6824125,33.0259269 (окр. Лимасола); в базе 5 карточек этого же клуба помечены «Лимасол, Кипр», у точки по полигону округ Лимасол',
    city: 'Лимасол, Кипр',
  },
  {
    prefix: 'a593accd',
    note: 'Spartacus Ballet: описание источника — «27 Νοεμβρίου 2026 στις 19:30 στο Δημοτικό Θέατρο Λευκωσίας, 28 Νοεμβρίου στο Παττίχειο Θέατρο Λεμεσού»; дата карточки 27.11 = Никосия, пин стоял на театре Паттихио в Лимасоле',
    lat: NICOSIA_THEATRE.lat,
    lng: NICOSIA_THEATRE.lng,
    city: 'Никосия, Кипр',
  },
  {
    prefix: 'eeb244ff',
    note: 'Little Prince on Ice: расписание источника — «Saturday, 5 December 2026 | 19:00 (Nicosia Municipal Theatre)», 6.12 — Паттихио (Лимасол); дата карточки 05.12 = Никосия, пин стоял на Лимасоле',
    lat: NICOSIA_THEATRE.lat,
    lng: NICOSIA_THEATRE.lng,
    city: 'Никосия, Кипр',
  },
  {
    prefix: 'ec507855',
    note: 'Street Food festival: страница источника — «Livadero Park, Palaichori, Sat, 10 Oct 2026», streetAddress «Παλαιχώρι Ορεινής», geo 34.92102399,33.09486335; Палихори — округ Никосия (полигон подтверждает), метка была «Лимасол»',
    city: 'Никосия, Кипр',
  },
];

const rows = await selectAll(db, 'events', 'id,title,city,address,lat,lng,status,website');
let fixed = 0;
for (const f of FIXES) {
  const r = rows.find(x => x.id.startsWith(f.prefix));
  if (!r) { console.log(`! не найдена карточка ${f.prefix}`); continue; }
  const patch = {};
  if (f.lat !== undefined && (Math.abs(r.lat - f.lat) > 1e-6 || Math.abs(r.lng - f.lng) > 1e-6)) patch.lat = f.lat, patch.lng = f.lng;
  if (f.city && r.city !== f.city) patch.city = f.city;
  console.log(`${f.prefix} ${r.status} «${r.title.slice(0, 45)}» city ${r.city} -> ${patch.city || r.city}; coord ${r.lat},${r.lng} -> ${patch.lat ?? r.lat},${patch.lng ?? r.lng}`);
  console.log(`   основание: ${f.note}`);
  if (!Object.keys(patch).length) { console.log('   правок нет'); continue; }
  if (!APPLY) continue;
  const { data, error } = await db.from('events').update(patch).eq('id', r.id).select('id');
  if (error) { console.log('   ОШИБКА:', error.message); continue; }
  if (!data || data.length !== 1) { console.log(`   ПРОВАЛ: обновлено строк ${data ? data.length : 0}`); continue; }
  fixed++;
}
console.log(APPLY ? `Применено правок: ${fixed}` : 'DRY-RUN (ничего не менялось)');
