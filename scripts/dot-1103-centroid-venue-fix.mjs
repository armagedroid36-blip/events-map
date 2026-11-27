// dot 1103: карточки одной площадки, стоящие на ЦЕНТРОИДЕ города, при живой карточке-двойнике
// той же площадки с реальным пином. Класс найден офлайн по прод-снимку
// (scripts/dot-snapshot-venue-pin-split.py). Ремонт: пин цели → пин двойника.
// Запуск: node --env-file=.env scripts/dot-1103-centroid-venue-fix.mjs        (DRY)
//         APPLY=1 node --env-file=.env scripts/dot-1103-centroid-venue-fix.mjs
// При 402 (egress quota) — отказ, exit 1; база не читается.

const URL_ = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE;
if (!URL_ || !KEY) { console.error('нет SUPABASE_URL/SUPABASE_SERVICE_ROLE'); process.exit(1); }

const CENTROID_TOL = 0.0012; // ~130 м — точка должна стоять ровно на константе города

// id префикс -> {date, venue-фрагмент адреса, двойник (id префикс), centroid, why}
const TARGETS = [
  {
    id: '8c8ab47e', date: '2026-12-12', venue: 'cyherbia',
    twin: '2b39ece2', twinPin: [35.0139109, 33.830378],
    centroid: [35.1205, 33.9432], cityPrefix: 'Фамагуста',
    why: 'адрес «CyHerbia Botanical Park & Maze» — та же площадка, что у 2b39ece2 (CyHerbia Botanical Park & Labyrinth); пин стоит ровно на центроиде Фамагусты, событие в 16 км от него',
  },
  {
    id: '7eb675b6', date: '2026-12-05', venue: 'hadjikosta',
    twin: 'a3ca74fa', twinPin: [35.16914, 33.36282],
    centroid: [35.18557, 33.38228], cityPrefix: 'Никосия',
    why: 'адрес «Kthma Hadjikosta» — та же площадка, что у a3ca74fa (Зимняя страна чудес 28.11); пин стоит ровно на центроиде Никосии, у двойника реальная точка имения',
  },
];

const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

function near(a, b, tol) { return Math.abs(a[0] - b[0]) <= tol && Math.abs(a[1] - b[1]) <= tol; }

async function get(path) {
  const r = await fetch(`${URL_}/rest/v1/${path}`, { headers: H });
  if (r.status === 402) throw new Error('402 egress quota — ремонт отменён');
  if (!r.ok) throw new Error(`GET ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

async function patch(id, body) {
  const r = await fetch(`${URL_}/rest/v1/events?id=eq.${id}&status=eq.active`, {
    method: 'PATCH',
    headers: { ...H, Prefer: 'return=representation' },
    body: JSON.stringify(body),
  });
  if (r.status === 402) throw new Error('402 egress quota — запись отменена');
  if (!r.ok) throw new Error(`PATCH ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

const APPLY = process.env.APPLY === '1';

for (const t of TARGETS) {
  const rows = await get(`events?select=id,status,title,address,city,lat,lng&start_date=eq.${t.date}&status=eq.active`);
  const row = rows.find(r => r.id.startsWith(t.id));
  const twin = rows.find(r => r.id.startsWith(t.twin));
  if (!row) { console.log(`SKIP ${t.id}: нет живой карточки на ${t.date}`); continue; }
  const addr = (row.address || '').toLowerCase();
  if (!addr.includes(t.venue)) { console.log(`SKIP ${t.id}: адрес не называет площадку (${row.address})`); continue; }
  if (!(row.city || '').startsWith(t.cityPrefix)) { console.log(`SKIP ${t.id}: city «${row.city}» ≠ ${t.cityPrefix}`); continue; }
  if (!near([row.lat, row.lng], t.centroid, CENTROID_TOL)) { console.log(`SKIP ${t.id}: пин не на центроиде (${row.lat},${row.lng})`); continue; }
  if (!twin) { console.log(`SKIP ${t.id}: двойник ${t.twin} не найден в срезе`); continue; }
  if (!near([twin.lat, twin.lng], t.twinPin, 0.01)) { console.log(`SKIP ${t.id}: пин двойника сместился (${twin.lat},${twin.lng})`); continue; }
  console.log(`${APPLY ? 'FIX' : 'DRY'} ${t.id.slice(0, 8)} «${row.title}» ${row.city}: ${row.lat},${row.lng} -> ${t.twinPin}`);
  console.log(`     арбитр: ${t.why}`);
  if (!APPLY) continue;
  const back = await patch(row.id, {
    lat: t.twinPin[0], lng: t.twinPin[1],
    auto_review: { verdict: 'publish', reason: 'pin-fix: venue twin', note: `dot 1103: ${t.why}`, at: new Date().toISOString() },
  });
  const b = back[0] || {};
  console.log(`     readback ${b.id ? b.id.slice(0, 8) : '—'} active ${b.lat} ${b.lng}`);
}
