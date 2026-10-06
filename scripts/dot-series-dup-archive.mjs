// Архив копий суточной серии, у которых уже есть живая карточка-серия того же события.
// Кейс: b27660ee (moderation, Tiên Sa Show 06.10 Дананг, без гео) — тот же URL источника и та же
// серия (recurrence daily), что у живой e92095ff (04.10, адрес Nhà hát Trưng Vương + гео).
// Её близнец 791ef85e (06.10) уже заархивирован штатным dedupe-events — публиковать третью копию
// нельзя, поэтому закрываем очередь архивом, а не переносом гео.
// Запуск: node --env-file=.env scripts/dot-series-dup-archive.mjs            (сухой)
//         APPLY=1 node --env-file=.env scripts/dot-series-dup-archive.mjs
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const APPLY = process.env.APPLY === '1';
const db = createClient(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, {
  auth: { persistSession: false },
});

// keep -> drop + обоснование (проверено чтением базы 05.10.2026)
const PLAN = [
  { keep: 'e92095ff', drop: 'b27660ee', why: 'та же серия (recurrence daily), тот же URL danang365.com; живая карточка уже с адресом Nhà hát Trưng Vương и гео 16.0688447,108.2207425' },
  // 06.10.2026: та же серия, но ДРУГАЯ дата (06.10) — важна не дата, а то, что суточная серия уже
  // представлена живой карточкой e92095ff; её 06.10-копия 791ef85e ушла в архив штатным дедупом,
  // а 9d5dee25 пришла новой строкой из прогона 37385106443 (без гео и адреса) — публиковать нечего.
  { keep: 'e92095ff', drop: '9d5dee25', why: 'копия суточной серии Tiên Sa Show (06.10, без гео/адреса) при живой серии e92095ff с адресом и гео; тот же URL danang365.com, тот же recurrence daily' },
  // 06.10.2026 (прогон сторожа 37414814543): клон явился с якорем #tien-sa-show-2 — правка запуска 55
  // (anchoredKey) не видела кандидата, потому что якорь присваивался только при вставке. Корневая
  // причина закрыта candidateAnchoredKey() в collect-theatres.mjs; копию убираем архивом.
  { keep: 'e92095ff', drop: '43180ef3', why: 'копия суточной серии Tiên Sa Show (07.10, без гео/адреса), URL того же листинга danang365.com с служебным якорем #tien-sa-show-2; живая серия e92095ff уже с адресом и гео' },
];

const rows = await selectAll(db, 'events', 'id,status,title,city,start_date,website,lat,address');
const byPrefix = (p) => rows.find((r) => String(r.id).startsWith(p));
console.log('режим:', APPLY ? 'APPLY' : 'dry');
let done = 0, err = 0;
for (const step of PLAN) {
  const keep = byPrefix(step.keep), drop = byPrefix(step.drop);
  if (!keep || !drop) { console.log(`  ${step.drop}: не найдено (keep=${!!keep} drop=${!!drop})`); continue; }
  const guard = keep.status === 'active'
    && String(drop.website || '').split('#')[0] === String(keep.website || '').split('#')[0]
    && String(drop.title || '') === String(keep.title || '');
  console.log(`  ${step.drop} ${drop.status} ${drop.start_date} ${drop.city} | ${drop.title} || keep ${step.keep} ${keep.status} ${keep.lat},${keep.address ? 'адрес есть' : 'адрес нет'} | страховка ${guard ? 'OK' : 'НЕ ПРОЙДЕНА'}`);
  if (!guard) continue;
  if (!APPLY) continue;
  const { data, error } = await db.from('events').update({ status: 'archived' }).eq('id', drop.id).select('id,status');
  if (error || !data?.length) { err++; console.log(`    ошибка: ${error?.message || 'обновлено 0 строк'}`); continue; }
  done++;
  console.log(`    -> archived (${data[0].status})`);
}
console.log(`итог: архивировано ${done}, ошибок ${err}`);
