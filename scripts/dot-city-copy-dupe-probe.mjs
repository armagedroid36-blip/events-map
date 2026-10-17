// Зонд близнецов «одно событие — две карточки», которых не видит штатный дедуп.
// Логика и уровни — в scripts/city-copy-key.mjs, юнит — scripts/dot-city-copy-dupe-check.mjs.
// Уровень A (>=2 общих значимых слова, <=1500 м) закрывается после сверки зала/времени
// по страницам источников; уровень B (слов 0-1, но <=300 м) — только после ручного арбитра.
// Закрытие пары: node --env-file=.env scripts/dot-lang-dupe-fix.mjs (DRY -> APPLY=1).
// Запуск: node --env-file=.env scripts/dot-city-copy-dupe-probe.mjs
// Ручки: PROBE_STATUS=active|active,moderation|active,archived (контроль «зонд не ослеп»),
//        PROBE_MAX_DIST=1500, PROBE_MAX_DTIME=10
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
import { twinPairs } from './city-copy-key.mjs';

const db = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });
const cols = 'id,title,title_ru,title_en,city,address,lat,lng,start_date,start_time,status,website,source_type';
const all = await selectAll(db, 'events', cols);
const statuses = (process.env.PROBE_STATUS || 'active').split(',').map((s) => s.trim()).filter(Boolean);
const rows = all.filter((r) => statuses.includes(r.status));
const opt = {
  maxDistM: Number(process.env.PROBE_MAX_DIST || 1500),
  maxTimeDiffMin: Number(process.env.PROBE_MAX_DTIME || 10),
};
const pairs = twinPairs(rows, opt);
const byTier = (t) => pairs.filter((p) => p.tier === t).length;

console.log(`Строк прочитано: ${all.length}, в выборке (${statuses.join(',')}): ${rows.length}`);
console.log(`Пар: ${pairs.length} (A ${byTier('A')} / B ${byTier('B')})`);
for (const p of pairs) {
  console.log(`\n[${p.tier}] ${p.day} | ${p.distM} м | Δt ${p.timeDiffMin} мин | общие: ${p.common.join(', ') || '(нет)'}`);
  for (const [side, id] of [['ОСТАВИТЬ', p.keep], ['копия   ', p.drop]]) {
    const r = id === p.a.id ? p.a : p.b;
    console.log(`  ${side} ${r.id.slice(0, 8)} [${r.status}] «${r.title}» ${r.start_time || '-'} | ${r.city}`);
    console.log(`           адрес: ${r.address || '(пусто)'} | пин ${r.lat},${r.lng} | ${r.website || '-'}`);
  }
}
if (!pairs.length) console.log('Пар нет.');
