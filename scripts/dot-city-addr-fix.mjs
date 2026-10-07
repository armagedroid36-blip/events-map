// Точка «События»: класс «адрес карточки = название города» — на карточке вместо адреса стоит
// «Нячанг»/«Дананг» (пост дал только город). Такие значения снимаем (address → null), пин и статус не трогаем.
// Только TG-карточки (website t.me): у них правило применено и в сборщике (collect-tg.mjs), поэтому
// ключи дедупа остаются согласованными. Карточки источников-сайтов (cyprus.bz/cyprusnow) НЕ трогаем —
// там адрес уровня города приходит от источника и участвует в ключе дедупа (иначе родятся дубли).
// Страховки: карточка active|moderation, адрес в базе РОВНО тот, что посчитан городом, запись через .select('id').
// DRY по умолчанию, APPLY=1 — применять.
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
import { isCityAddress } from './address-junk.mjs';

const APPLY = process.env.APPLY === '1';
const db = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });

const rows = await selectAll(db, 'events', 'id,status,city,address,title,lat,lng,start_date,website', { filter: (q) => q.in('status', ['active', 'moderation']) });
const all = rows.filter((r) => r.address && isCityAddress(r.address, r.city));
const cands = all.filter((r) => (r.website || '').includes('t.me'));
console.log('живых:', rows.length, '| адрес = город всего:', all.length, '| из них TG-карточек:', cands.length);

let applied = 0, errors = 0;
for (const r of cands) {
  console.log(`  ${r.id.slice(0, 8)} ${r.status} ${r.city} ${r.start_date} адрес «${r.address}» пин ${r.lat},${r.lng} ${r.website}`);
  if (!APPLY) continue;
  const { data, error } = await db.from('events').update({ address: null }).eq('id', r.id).eq('address', r.address).select('id');
  if (error || !data?.length) { console.log('   ошибка записи:', error?.message || 'нет строк'); errors++; } else applied++;
}
console.log(`итог: применено ${applied}, ошибок ${errors}${APPLY ? '' : ' (DRY — записи не делались)'}`);
