// Архив близнецов «одно место в двух языках» / один ивент с разных зеркал.
// Правило: у пары одна дата, одно время (после cyHM-ремонта), одно место (адрес RU↔EN),
// но разные источники и у одного из них пин на центровой точке города.
// Оставляем карточку с проверенной площадкой/гео и полем end_date; близнец -> archived.
// DRY по умолчанию, APPLY=1 — применять. Проверка: скрипт перечитывает базу и печатает итог.
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const APPLY = process.env.APPLY === '1';
const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);

// keep -> archive[]  (обоснование в комментарии, проверено по страницам источников)
const PLAN = [
  { keep: '287f1564', drop: ['d6d536c7'],
    why: 'Rantevou Stin Plateia Music Fest 26, 17.10 20:30 Никосия: Шкали/Агланция одна площадка; keep=cyprusnow со скидкой 35.1520356,33.3977267 и end_date, drop=cyprus.bz с пином на центре города' },
  { keep: 'c918d845', drop: ['be61af07'],
    why: 'Roxette Tribute, 17.10 20:00 Лимасол: «Marios Tokas Municipal Garden Theatre» = «Муниципальный садовый театр Мариос Токас»; keep=cyprusnow с гео площадки 34.6837781,33.0550723, drop=cyprus.bz с центровым пином 34.7071,33.0226' },
  { keep: '633a31c7', drop: ['d70a20df'],
    why: 'Murder on the Orient Express 03.10 20:00 Никосия: THOC Theatre (Evis Gabrielides Aud.) = Main Stage; keep=карточка с адресом площадки и прогоном до 27.11, drop=дубль с пином на центре' },
  { keep: 'cd50ee20', drop: ['04f731ea', 'c8db8664'],
    why: 'Race for the Cure Cyprus 01.11 Никосия: с страницы cyprusnow «Sports event at UCY Sports Centre ... at 07:30», расписание 07:30 полумарафон / 08:00 10 км / 09:15 5 км — старт 07:30; у 04f731ea время 09:00 (голова 5-км забега) и пин в центре Никосии (35.1600,33.3771), у c8db8664 пин-заглушка 35.1856,33.3823 и cyprus.bz; keep=cd50ee20 (07:30, UCY Sports Centre, 35.1461934,33.4133854)' },
  { keep: '287f1564', drop: ['36163812'],
    why: 'Rantevou Stin Plateia Music Fest 26, 17.10 20:30 Никосия: третья копия того же cyprus.bz-события (URL /event/33c4/ с другим слагом-переводом); keep=cyprusnow с гео площадки Skali Amphitheatre 35.1520356,33.3977267 и фото, drop=cyprus.bz с пином на центре города 35.1856,33.3823 без фото' },
  { keep: '9fc80d10', drop: ['22baf109'],
    why: 'Sum It Up 2026, 12–13.11 Лимасол, St Raphael Resort: cyprus.bz-зеркало того же события; keep=cyprusnow с гео площадки 34.7131365,33.1674229 и временем 08:30, drop=cyprus.bz с пином на центре Лимасола 34.7071,33.0226 и временем 08:00 (строгий ключ слеп: общих слов названия «sum up 2026» < 3)' },
  { keep: '14f32b9b', drop: ['0734f033'],
    why: 'Psyloween 31.10 20:00–01.11 Ktima Camelot: cyprus.bz-зеркало («Psyloween 2026 (Delight Project x Infinity Crew)»); keep=cyprusnow «Psyloween at Ktima Camelot» с гео площадки 35.0793206,33.193694, drop=cyprus.bz с пином на центре Никосии 35.1856,33.3823; названия дают 1 общее слово — ключ слеп' },
];

const rows = await selectAll(db, 'events', 'id,status,title,title_ru,start_date,start_time,city,address,lat,lng,website');
let ok = 0, err = 0;
for (const p of PLAN) {
  const keep = rows.find(r => r.id.startsWith(p.keep));
  if (!keep) { console.log(`[SKIP] ${p.keep} не найден`); err++; continue; }
  console.log(`\nKEEP ${keep.id.slice(0, 8)} [${keep.status}] ${keep.start_date} ${keep.start_time} ${keep.city} | ${(keep.title_ru || keep.title).slice(0, 45)}`);
  console.log(`   гео ${keep.lat},${keep.lng} | адрес ${keep.address}`);
  console.log(`   причина: ${p.why}`);
  for (const d of p.drop) {
    const dr = rows.find(r => r.id.startsWith(d));
    if (!dr) { console.log(`   [SKIP] нет ${d}`); continue; }
    console.log(`   DROP ${dr.id.slice(0, 8)} [${dr.status}] гео ${dr.lat},${dr.lng} | ${dr.website}`);
    if (dr.status === 'archived') { console.log('     уже archived'); continue; }
    if (!APPLY) continue;
    const { data, error } = await db.from('events').update({
      status: 'archived',
      auto_review: { at: new Date().toISOString(), flags: ['dupe-lang'], engine: 'dot-lang-dupe-fix', reason: `дубль карточки ${keep.id.slice(0, 8)}: ${p.why}` },
    }).eq('id', dr.id).select('id,status');
    if (error || !data?.length) { console.log('     ОШИБКА', error?.message || 'обновлено 0 строк'); err++; }
    else { console.log(`     archived OK (${data[0].status})`); ok++; }
  }
}
console.log(`\nAPPLY=${APPLY ? 1 : 0} | архивировано ${ok}, ошибок ${err}`);
if (APPLY) {
  const all = await selectAll(db, 'events', 'id,status');
  for (const p of PLAN) {
    const k = all.find(r => r.id.startsWith(p.keep));
    const ds = p.drop.map(d => all.find(r => r.id.startsWith(d))?.status || 'нет').join(', ');
    console.log(`контроль ${p.keep} -> ${k?.status} | ${p.drop.join('/')} -> ${ds}`);
  }
}
