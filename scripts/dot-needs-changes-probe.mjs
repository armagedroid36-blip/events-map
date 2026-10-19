// Постоянный зонд «тупик needs_changes»: карточки в needs_changes автопроверка
// повторно НЕ читает (она берёт только status='moderation'), поэтому карточка,
// попавшая сюда по спорному флагу (politics/unclear), висит вечно, даже если её
// потом дозаполнили. Зонд показывает: сколько таких, по каким флагам, давно ли
// вердикт, и какие поля пусты (кандидаты на дозаполнение перед ручным разбором).
//
// Запуск: node --env-file=.env scripts/dot-needs-changes-probe.mjs
// Норма — 0 карточек старше STALE_DAYS; иначе это очередь на решение Дмитрия.
import { createClient } from '@supabase/supabase-js';

const STALE_DAYS = Number(process.env.STALE_DAYS || 3);
const db = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE,
  { auth: { persistSession: false } },
);

async function selectAll(table, cols, filter = (q) => q) {
  const out = [];
  for (let off = 0; ; off += 1000) {
    const { data, error } = await filter(db.from(table).select(cols)).range(off, off + 999);
    if (error) throw new Error(error.message);
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}

const rows = await selectAll(
  'events',
  'id,title,city,start_date,status,source_type,address,lat,lng,photos,description,description_en,auto_review,created_at,website',
  (q) => q.eq('status', 'needs_changes'),
);

const now = Date.now();
const byFlag = new Map();
let stale = 0;
console.log('needs_changes:', rows.length, '| порог «застряла» —', STALE_DAYS, 'суток');
for (const r of rows) {
  const rev = r.auto_review || {};
  const flags = Array.isArray(rev.flags) && rev.flags.length ? rev.flags : ['(нет)'];
  const at = rev.at ? new Date(rev.at) : null;
  const ageDays = at ? (now - at.getTime()) / 86400000 : null;
  if (ageDays !== null && ageDays >= STALE_DAYS) stale++;
  for (const f of flags) byFlag.set(f, (byFlag.get(f) || 0) + 1);
  const empty = [];
  if (!(r.description || r.description_en)) empty.push('без описания');
  if (!(r.photos || []).length) empty.push('без фото');
  if (!r.address || r.address === r.city) empty.push('адрес-город');
  console.log(
    `- ${r.id.slice(0, 8)} | ${flags.join(',')} | вердикт ${ageDays === null ? '?' : ageDays.toFixed(1) + ' сут'} | ${r.city} | ${r.start_date} | ${String(r.title).slice(0, 55)}`,
    empty.length ? `| пусто: ${empty.join(', ')}` : '',
  );
}
console.log('по флагам:', JSON.stringify(Object.fromEntries(byFlag)));
console.log('застряли >= порога:', stale);
