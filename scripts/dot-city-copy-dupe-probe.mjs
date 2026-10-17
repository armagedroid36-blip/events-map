// Зонд класса «городская карточка-копия»: живые карточки одного события, где у одной адрес —
// имя города, у другой названа площадка; тот же день, то же время (±10 мин), пины ближе 1500 м.
// Логика — в scripts/city-copy-key.mjs (там же юнит, scripts/dot-city-copy-dupe-check.mjs).
// Разбор пары: сверить зал/время по страницам источников и закрыть копию
// `node --env-file=.env scripts/dot-lang-dupe-fix.mjs` (DRY -> APPLY=1).
// Запуск: node --env-file=.env scripts/dot-city-copy-dupe-probe.mjs
// Ручки: PROBE_STATUS=active,moderation|active, PROBE_MAX_DIST=1500, PROBE_MAX_DTIME=10
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
import { cityCopyPairs } from './city-copy-key.mjs';

const db = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });
const cols = 'id,title,title_ru,title_en,city,address,lat,lng,start_date,start_time,status,website,source_type';
const all = await selectAll(db, 'events', cols);
const statuses = (process.env.PROBE_STATUS || 'active').split(',').map((s) => s.trim()).filter(Boolean);
const rows = all.filter((r) => statuses.includes(r.status));
const opt = {
  maxDistM: Number(process.env.PROBE_MAX_DIST || 1500),
  maxTimeDiffMin: Number(process.env.PROBE_MAX_DTIME || 10),
};
const pairs = cityCopyPairs(rows, opt);

console.log(`Строк прочитано: ${all.length}, в выборке (${statuses.join(',')}): ${rows.length}`);
console.log(`Пар класса «городская карточка-копия»: ${pairs.length}`);
for (const p of pairs) {
  console.log(`\n${p.key} | ${p.distM} м | Δt ${p.timeDiffMin} мин | общие: ${p.common.join(', ')}`);
  for (const [side, id] of [['ОСТАВИТЬ', p.keep], ['копия   ', p.drop]]) {
    const r = id === p.a.id ? p.a : p.b;
    console.log(`  ${side} ${id} [${r.status}] «${r.title}» ${String(r.start_date).slice(0, 10)} ${r.start_time || '-'}`);
    console.log(`           адрес: ${r.address || '(пусто)'} | пин ${r.lat},${r.lng} | ${r.website || '-'}`);
  }
}
if (!pairs.length) console.log('Класс чист: пар нет.');
