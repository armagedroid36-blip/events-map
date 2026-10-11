// Читающий зонд: видит ли АНОНИМНЫЙ клиент сайта (RLS) те же живые карточки,
// что и service-role. Класс «карточка есть в базе, но её нет на карте».
// Запуск: node --env-file=.env scripts/dot-anon-visibility-check.mjs [ISO_окна]
import { createClient } from '@supabase/supabase-js';

const URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SVC = process.env.SUPABASE_SERVICE_ROLE;
const ANON = process.env.VITE_SUPABASE_ANON_KEY;
const SINCE = process.argv[2] || new Date(Date.now() - 36 * 3600e3).toISOString();

if (!URL || !SVC || !ANON) { console.error('нет ключей в .env'); process.exit(1); }

const svc = createClient(URL, SVC, { auth: { persistSession: false } });
const anon = createClient(URL, ANON, { auth: { persistSession: false } });

async function pageAll(client, table, select, apply) {
  const out = [];
  for (let off = 0; ; off += 1000) {
    let q = client.from(table).select(select).range(off, off + 999);
    if (apply) q = apply(q);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

const sel = 'id,title,start_date,start_time,city,status,created_at,lat,lng';
const svcRows = await pageAll(svc, 'events', sel, q => q.gte('created_at', SINCE));
const anonRows = await pageAll(anon, 'events', sel, q => q.gte('created_at', SINCE));

const svcActive = svcRows.filter(r => r.status === 'active');
const anonIds = new Set(anonRows.map(r => r.id));
const anonStatus = new Map(anonRows.map(r => [r.id, r.status]));

console.log(`Окно created_at >= ${SINCE}`);
console.log(`service-role: строк ${svcRows.length} (active ${svcActive.length}); анонимно видно ${anonRows.length}`);

const hidden = svcActive.filter(r => !anonIds.has(r.id));
const wrongStatus = svcActive.filter(r => anonIds.has(r.id) && anonStatus.get(r.id) !== 'active');
const noGeo = anonRows.filter(r => r.lat == null || r.lng == null);

console.log(`НЕ ВИДНЫ анонимному клиенту (active в базе): ${hidden.length}`);
for (const r of hidden.slice(0, 10)) console.log(`  - ${r.id} ${r.status} ${r.start_date} ${r.city} :: ${String(r.title).slice(0, 60)}`);
console.log(`ВИДНЫ, но статус на сайте не active: ${wrongStatus.length}`);
for (const r of wrongStatus.slice(0, 10)) console.log(`  - ${r.id} -> ${anonStatus.get(r.id)} ${r.start_date} ${r.city}`);
console.log(`Видны анонимно БЕЗ координат (не попадут на карту): ${noGeo.length}`);
for (const r of noGeo.slice(0, 10)) console.log(`  - ${r.id} ${r.start_date} ${r.city} :: ${String(r.title).slice(0, 60)}`);

// сверка по 7 дням вперёд: сколько живых и сколько из них видно анонимно
const today = new Date().toISOString().slice(0, 10);
const in7 = new Date(Date.now() + 7 * 86400e3).toISOString().slice(0, 10);
const live = await pageAll(svc, 'events', 'id,start_date,city,status', q => q.eq('status', 'active').gte('start_date', today).lte('start_date', in7));
const liveAnon = await pageAll(anon, 'events', 'id', q => q.gte('start_date', today).lte('start_date', in7));
console.log(`7 дней (${today}..${in7}): active ${live.length}, видно анонимно ${liveAnon.length}`);
