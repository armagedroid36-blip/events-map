// Разовый ремонт запуска 975: кросс-источниковые дубли (CN<->bz / visitcyprus<->bz),
// найденные зондом dot-cross-source-dupe-probe.mjs: один день, одно время, ОДНА площадка,
// названия — переводы друг друга. Архив — карточка-дубль, канон остаётся.
// Запуск: node --env-file=.env scripts/_tmp975-crosssource-arch.mjs           (dry)
//         APPLY=1 node --env-file=.env scripts/_tmp975-crosssource-arch.mjs   (правка + readback)
const URL_ = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE;

const PAIRS = [
  // drop, keep, note
  ['1d17d49d', '9346b6ae', 'Сюита Щелкунчика 05.12 18:00 Pattihio: CN-копия, канон — bz /38d4 (театр в адресе)'],
  ['d66e92c0', '2a6f5ffa', 'Открытие RestArt 21.11 18:00 Stegi Grammaton: CN-копия, канон — bz /3d1b'],
  ['db912060', 'cc8547de', 'Камерная музыка 1 26.11 20:00 Паллас Никосия: bz-копия, канон — CN (в названии программа «Трио скрипок»)'],
  ['e42c0416', 'e6177ffa', 'Никодемос Кабарнос 21.12 20:30 Муниципальный театр Никосии: CN-копия, канон — bz /3b39'],
  ['40c24b3b', 'da2a86c7', 'Лива К 26.12 22:00 Castle Club Айя-Напа: bz-копия стоит на центре города (34.9889), канон — CN с пином клуба'],
  ['fbb9d62e', 'f5c7e342', 'Tournas & Tsaknis греческий рок 05.12 21:30 Ктима Димосфенус (обе точки совпали 0 м): CN-копия, канон — bz /3ac1'],
  ['9a1be869', '54c431cc', 'Иллюминация/освещение Ахны 28.11 17:00: CN-копия, канон — bz /3d38'],
];

const apply = process.env.APPLY === '1';
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation' };

async function find(prefix) {
  // id — uuid, PostgREST по префиксу не ищет: берём активные строки и матчим локально
  const r = await fetch(`${URL_}/rest/v1/events?select=id,title,city,start_date,start_time,address,status,website&status=eq.active&limit=1000`, { headers: H });
  const rows = await r.json();
  const hit = rows.find((x) => x.id.startsWith(prefix));
  if (hit) return hit;
  const r2 = await fetch(`${URL_}/rest/v1/events?select=id,title,city,start_date,start_time,address,status,website&status=eq.active&limit=1000&offset=1000`, { headers: H });
  const rows2 = await r2.json();
  return rows2.find((x) => x.id.startsWith(prefix)) || null;
}

let ok = 0, fail = 0;
for (const [drop, keep, note] of PAIRS) {
  const d = await find(drop);
  const k = await find(keep);
  if (!d || !k) { console.log(`MISS ${drop}/${keep}: d=${!!d} k=${!!k}`); fail++; continue; }
  console.log(`${apply ? 'ARCH' : 'DRY '} ${drop} «${d.title}» ${d.start_date} ${d.start_time || ''} | ${d.address || d.city}`);
  console.log(`      канон ${keep} «${k.title}» ${k.start_date} ${k.start_time || ''} | ${k.address || k.city}`);
  if (!apply) continue;
  const body = { status: 'archived', auto_review: { verdict: 'reject', reason: 'duplicate', note, at: new Date().toISOString() } };
  const r = await fetch(`${URL_}/rest/v1/events?id=eq.${d.id}&status=eq.active`, { method: 'PATCH', headers: H, body: JSON.stringify(body) });
  const j = await r.json();
  const got = Array.isArray(j) && j[0];
  if (r.ok && got && got.status === 'archived') { ok++; console.log(`      -> archived ok`); }
  else { fail++; console.log(`      -> FAIL ${r.status} ${JSON.stringify(j).slice(0, 200)}`); }
}
console.log(`ИТОГ: ${apply ? `архивировано ${ok}` : `пар ${PAIRS.length}`}, провалов ${fail}`);
