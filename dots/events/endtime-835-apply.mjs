// Запуск 835: у однодневных карточек end_time < start_time (время второго сеанса дня попало в конец).
// Правило: end_date === start_date ⇒ end_time не имеет смысла и инвертирует интервал ⇒ ставим null.
// DRY по умолчанию; APPLY=1 пишет в базу. Страховки: карточка active, end_date === start_date, end_time прежний.
const APPLY = process.env.APPLY === '1';
const URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) { console.error('нет SUPABASE_URL / SUPABASE_SERVICE_ROLE'); process.exit(1); }

const FIX = [
  { id: 'c3422b71', date: '2026-11-21', old: '11:00:00', title: 'Μια Κύπρος παραμύθκια (Pantheon, 21.11)' },
  { id: '36f642fa', date: '2026-12-02', old: '11:30:00', title: 'DK: Κυνηγώντας το Όνειρο (Пафос, 02.12)' },
  { id: '47a53a7e', date: '2026-12-05', old: '11:00:00', title: 'Μια Κύπρος παραμύθκια (Pantheon, 05.12)' },
  { id: 'eeb244ff', date: '2026-12-05', old: '18:30:00', title: 'Little Prince on Ice (Никосия, 05.12)' },
];

const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

async function getById(prefix, date) {
  const res = await fetch(`${URL}/rest/v1/events?select=id,status,start_date,end_date,start_time,end_time&start_date=eq.${date}&limit=1000`, { headers: H });
  if (!res.ok) throw new Error(`GET ${res.status} ${(await res.text()).slice(0, 120)}`);
  const rows = await res.json();
  return rows.find(r => r.id.startsWith(prefix));
}

console.log(`режим: ${APPLY ? 'APPLY' : 'DRY-RUN'}; правок ${FIX.length}`);
let done = 0, skipped = 0;
for (const f of FIX) {
  try {
    const row = await getById(f.id, f.date);
    if (!row) { console.log(`MISS ${f.id} ${f.title}`); skipped++; continue; }
    if (row.status !== 'active') { console.log(`SKIP ${f.id} статус ${row.status}`); skipped++; continue; }
    if (!(row.start_time && row.end_time && row.end_time < row.start_time)) { console.log(`SKIP ${f.id} интервал уже цел (${row.start_time}→${row.end_time})`); skipped++; continue; }
    if (row.end_date && row.end_date !== row.start_date) { console.log(`SKIP ${f.id} многодневное ${row.start_date}→${row.end_date}`); skipped++; continue; }
    console.log(`${APPLY ? 'FIX ' : 'PLAN'} ${row.id.slice(0, 8)} ${row.start_date} ${row.start_time}→end ${row.end_time} = null | ${f.title}`);
    if (!APPLY) { done++; continue; }
    const res = await fetch(`${URL}/rest/v1/events?id=eq.${row.id}&status=eq.active`, {
      method: 'PATCH', headers: { ...H, Prefer: 'return=representation' },
      body: JSON.stringify({ end_time: null }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok || !Array.isArray(body) || body.length !== 1) { console.log(`  ОШИБКА PATCH ${res.status} ${JSON.stringify(body).slice(0, 120)}`); skipped++; continue; }
    const r = body[0];
    console.log(`  readback: ${r.id.slice(0, 8)} ${r.start_time}→${r.end_time} (end_time должен быть null)`);
    done++;
  } catch (e) { console.log(`ОШИБКА ${f.id}: ${String(e.message || e).slice(0, 140)}`); skipped++; }
}
console.log(`итог: ${done}, пропущено ${skipped}`);
