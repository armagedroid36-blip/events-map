// Ремонт меток city у живых балийских карточек: метка расходится с районом из их СОБСТВЕННОГО адреса
// (лента Балифорума отдаёт districtName, противоречащий своему же адресу; правило сборщика «адрес важнее района»).
// Страховки: карточка живая, city ровно ожидаемая метка, район из адреса = целевая метка,
// у целевой метки есть центр района, сдвиг пина не делается (координаты не трогаем).
// Запуск: node --env-file=.env scripts/dot-bali-city-label-fix.mjs [--apply]
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
import { districtFor, BALI_DISTRICT_CENTERS } from './bali-districts.mjs';

const APPLY = process.argv.includes('--apply');
const db = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, {
  auth: { persistSession: false },
});

// id (префикс) -> ожидаемая метка / целевая метка / цитата источника
const TARGETS = [
  {
    id: '461c6b82',
    from: 'Пандава',
    to: 'Кутух',
    quote: 'лента baliforum.ru: place «Roosterfish Beach Club», districtName «Пандава»; адрес площадки «Jl. Pantai Pandawa, Kutuh, Kec. Kuta Sel.» → деревня Кутух (Пандава — пляж в Кутухе)',
  },
  {
    id: 'f218f56d',
    from: 'Сукавати',
    to: 'Убуд',
    quote: 'лента baliforum.ru: place «Sthala, a Tribute Portfolio Hotel, Ubud Bali», districtName «Сукавати», но адрес площадки «Jalan Raya Mawang, Lodtunduh, Kecamatan Ubud, Kabupaten Gianyar» → район Убуд (округ Кечаматан Убуд)',
  },
];

const rows = await selectAll(db, 'events', 'id,title,title_ru,city,address,lat,lng,status', {
  filter: (q) => q.in('status', ['active', 'moderation']),
});
const byId = new Map(rows.map((r) => [r.id.slice(0, 8), r]));

let applied = 0, skipped = 0, errors = 0;
for (const t of TARGETS) {
  const r = byId.get(t.id);
  if (!r) { console.log(`ПРОПУСК ${t.id}: нет живой карточки`); skipped++; continue; }
  if (r.city !== `${t.from}, Bali`) { console.log(`ПРОПУСК ${t.id}: city «${r.city}» ≠ «${t.from}, Bali»`); skipped++; continue; }
  const byAddr = districtFor(r.address || '', null);
  if (byAddr !== t.to) { console.log(`ПРОПУСК ${t.id}: район из адреса «${byAddr}» ≠ цели «${t.to}»`); skipped++; continue; }
  if (!BALI_DISTRICT_CENTERS[t.to.toLowerCase()]) { console.log(`ПРОПУСК ${t.id}: у метки «${t.to}» нет центра района`); skipped++; continue; }
  console.log(`ПРАВКА ${t.id} «${t.title_ru || r.title}»: city «${r.city}» → «${t.to}, Bali»`);
  console.log(`   основание: ${t.quote}`);
  if (!APPLY) continue;
  const { data, error } = await db.from('events').update({ city: `${t.to}, Bali` }).eq('id', r.id).select('id,city');
  if (error || !data || !data.length) { console.log(`   ОШИБКА: ${error?.message || 'запись не подтвердилась'}`); errors++; continue; }
  console.log(`   записано: ${data[0].city}`);
  applied++;
}
console.log(`\n${APPLY ? 'ПРИМЕНЕНО' : 'СУХОЙ ПРОГОН'}: применено ${applied}, пропущено ${skipped}, ошибок ${errors}`);
