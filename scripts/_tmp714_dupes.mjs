import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE;
const db = createClient(url, key, { auth: { persistSession: false } });

const DUP = [
  'fcb42a2a', '33579174', '81e485b0', '35c0a597', 'a0a35f37',
  'b71d9185', '6bfb0a25', 'd4e61329', '064336dc', '6655a883',
];

function collect(rows, status, out = []) {
  for (const r of rows) if (status(r) && !out.some(x => x.id === r.id)) out.push(r);
  return out;
}

let all = [];
for (let from = 0; ; from += 200) {
  const { data, error } = await db.from('events')
    .select('id,title,start_date,start_time,city,address,lat,lng,status,website,auto_review')
    .eq('status', 'active').order('start_date', { ascending: true }).order('id', { ascending: true })
    .range(from, from + 199);
  if (error) { console.error('ERR', error.message); process.exit(1); }
  all.push(...data);
  if (data.length < 200) break;
}
all = collect(all, () => true);
console.log('active rows', all.length);

const targets = all.filter(r => DUP.some(p => r.id.startsWith(p)));
console.log('найдено целей', targets.length, '/', DUP.length);
for (const t of targets) console.log(' -', t.id.slice(0, 8), t.start_date, t.start_time, t.city, '|', t.title.slice(0, 50));

const fixPin = all.find(r => r.id.startsWith('821dea61'));
console.log('bz-канон Ping Pong:', fixPin ? `${fixPin.id.slice(0,8)} ${fixPin.lat},${fixPin.lng} адрес=${fixPin.address}` : 'НЕ НАЙДЕН');

if (process.env.APPLY !== '1') { console.log('DRY (APPLY=1 для записи)'); process.exit(0); }

const ids = targets.map(t => t.id);
if (ids.length) {
  const { data, error } = await db.from('events').update({
    status: 'archived',
    auto_review: { verdict: 'reject', reason: 'duplicate', engine: 'dot-manual', note: 'кросс-источниковый дубль: та же дата/время/площадка, что у канона; снято точкой 714' },
  }).in('id', ids).eq('status', 'active').select('id,status');
  if (error) { console.error('PATCH ERR', error.message); process.exit(1); }
  console.log('архивировано', data.length);
}

if (fixPin && Math.abs(fixPin.lat - 34.9302488) > 1e-6) {
  const { data, error } = await db.from('events').update({
    lat: 34.9302488, lng: 33.6246699,
    auto_review: { verdict: 'publish', reason: 'pin-fix', engine: 'dot-manual', note: 'пин с центровой константы Ларнаки на площадку Ping Pong XP (арбитр — запись CN того же события)' },
  }).eq('id', fixPin.id).eq('status', 'active').select('id,lat,lng');
  if (error) console.error('PIN ERR', error.message); else console.log('пин исправлен', data);
}
