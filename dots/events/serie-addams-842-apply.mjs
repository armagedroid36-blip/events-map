// Запуск 842: интервал-артефакт у мюзикла «Οικογένεια Άνταμς» (февраль 2027).
// Арбитр — блок «🗓️ Πρόγραμμα» страницы записи Cyprus Now
// (event/οικογένεια-άνταμς-2027-02-01): Лимасол, Паттихо — 01, 02, 03.02 в 20:30;
// Никосия, Муниципальный театр — 05.02 20:30, 06.02 17:00 & 20:30, 07.02 17:00 & 20:30.
// Значит:
//   A) карточка Паттихо 01.02 стояла с end_date 07.02 (окно ГАСТРОЛИ, а не события) → end_date = 01.02;
//   B) карточка Никосии стояла с start_date 01.02 (день Лимасола) → start_date = 05.02, окно 05→07.02 законно.
// DRY по умолчанию; APPLY=1 пишет в базу. Страховки: карточка active, дата/конец/время/заголовок прежние.
const APPLY = process.env.APPLY === '1';
const URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) { console.error('нет SUPABASE_URL / SUPABASE_SERVICE_ROLE'); process.exit(1); }

const H = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' };

const FIX = [
  {
    id: '24e8a3ec', titleLike: 'Άνταμς',
    date: '2027-02-01', oldEnd: '2027-02-07', startTime: '20:30:00',
    patch: { end_date: '2027-02-01' },
    why: 'Паттихо (Лимасол): 01/02/03.02 в 20:30; 07.02 — конец гастрольного окна, а не события',
  },
  {
    id: 'e057e60c', titleLike: 'Addams',
    date: '2027-02-01', oldEnd: '2027-02-07', startTime: '20:30:00',
    patch: { start_date: '2027-02-05' },
    why: 'Муниципальный театр Никосии: показы 05–07.02 (05.02 20:30, 06–07.02 17:00 и 20:30); 01.02 — день Лимасола',
  },
];

async function getById(prefix, date) {
  const res = await fetch(`${URL}/rest/v1/events?select=id,status,title,start_date,end_date,start_time,end_time&start_date=eq.${date}&limit=1000`, { headers: H });
  if (!res.ok) throw new Error(`GET ${res.status} ${(await res.text()).slice(0, 120)}`);
  const rows = await res.json();
  return rows.find(r => r.id.startsWith(prefix));
}

console.log(`режим: ${APPLY ? 'APPLY' : 'DRY-RUN'}; правок ${FIX.length}`);
let done = 0, skipped = 0;
for (const f of FIX) {
  try {
    const row = await getById(f.id, f.date);
    if (!row) { console.log(`MISS ${f.id} ${f.why}`); skipped++; continue; }
    if (row.status !== 'active') { console.log(`SKIP ${f.id} статус ${row.status}`); skipped++; continue; }
    if (!(row.title || '').includes(f.titleLike)) { console.log(`SKIP ${f.id} заголовок «${row.title}»`); skipped++; continue; }
    if (row.end_date !== f.oldEnd) { console.log(`SKIP ${f.id} конец уже ${row.end_date}`); skipped++; continue; }
    if (row.start_time !== f.startTime) { console.log(`SKIP ${f.id} начало уже ${row.start_time}`); skipped++; continue; }
    console.log(`${APPLY ? 'FIX ' : 'PLAN'} ${row.id.slice(0, 8)} ${row.start_date}→${row.end_date} ${row.start_time} | ${row.title.slice(0, 40)}`);
    console.log(`  арбитр: CN Πρόγραμμα — ${f.why}`);
    if (!APPLY) { done++; continue; }
    const res = await fetch(`${URL}/rest/v1/events?id=eq.${row.id}&status=eq.active`, {
      method: 'PATCH', headers: { ...H, Prefer: 'return=representation' },
      body: JSON.stringify(f.patch),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok || !Array.isArray(body) || body.length !== 1) { console.log(`  ОШИБКА PATCH ${res.status} ${JSON.stringify(body).slice(0, 120)}`); skipped++; continue; }
    const r = body[0];
    console.log(`  readback: ${r.id.slice(0, 8)} ${r.start_date}→${r.end_date} ${r.start_time}→${r.end_time}`);
    done++;
  } catch (e) { console.log(`ОШИБКА ${f.id}: ${String(e.message || e).slice(0, 140)}`); skipped++; }
}
console.log(`итог: ${done}, пропущено ${skipped}`);
