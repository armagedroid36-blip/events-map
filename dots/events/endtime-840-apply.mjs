// Запуск 840: у серии «Official Nicosia Christmas Market 2026» одно окно печатает end_time 18:00,
// хотя источник (Cyprus Now, ?q=christmas market nicosia) даёт 28.11 09:00Z→18:00Z = 11:00→20:00 местного
// (UTC+2), и три соседних окна той же серии стоят на 20:00.
// DRY по умолчанию; APPLY=1 пишет в базу. Страховки: карточка active, дата/время/заголовок прежние.
const APPLY = process.env.APPLY === '1';
const URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) { console.error('нет SUPABASE_URL / SUPABASE_SERVICE_ROLE'); process.exit(1); }

const FIX = [
  {
    id: 'cfad1e23', date: '2026-11-28', startTime: '11:00:00', old: '18:00:00', next: '20:00:00',
    title: 'Official Nicosia Christmas Market 2026 (Eleftheria Square, окно 28–29.11)',
    arbiter: 'CN ?q=christmas market nicosia: 2026-11-28T09:00Z→2026-11-28T18:00Z = 11:00→20:00 местного',
  },
  {
    // 841: у серии «Εργαστήριο Μνήμης στην Παλώδια» (6 занятий, CN series 08→28.11) последняя запись
    // несёт end_at 2026-11-29T18:00Z — конец СЕРИИ, а не занятия: sessions идут 2 ч (14:00Z→16:00Z = 16:00→18:00).
    id: '989974f0', date: '2026-11-28', startTime: '16:00:00', old: '20:00:00', next: '18:00:00',
    nextEndDate: '2026-11-28',
    title: 'Εργαστήριο Μνήμης στην Παλώδια (занятие 28.11, серия из 6)',
    arbiter: 'CN ?q=παλώδια: 28.11 14:00Z→16:00Z = 16:00→18:00 (у записи end_at 2026-11-29T18:00Z = конец серии); соседние занятия 13/20/21.11 той же серии стоят 2 ч',
  },
];

const H = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' };

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
    if (!row) { console.log(`MISS ${f.id} ${f.title}`); skipped++; continue; }
    if (row.status !== 'active') { console.log(`SKIP ${f.id} статус ${row.status}`); skipped++; continue; }
    if (row.start_time !== f.startTime) { console.log(`SKIP ${f.id} начало уже ${row.start_time}`); skipped++; continue; }
    if (row.end_time !== f.old) { console.log(`SKIP ${f.id} конец уже ${row.end_time}`); skipped++; continue; }
    console.log(`${APPLY ? 'FIX ' : 'PLAN'} ${row.id.slice(0, 8)} ${row.start_date}→${row.end_date} ${row.start_time}→${f.next} | ${f.title}`);
    console.log(`  арбитр: ${f.arbiter}`);
    if (!APPLY) { done++; continue; }
    const res = await fetch(`${URL}/rest/v1/events?id=eq.${row.id}&status=eq.active`, {
      method: 'PATCH', headers: { ...H, Prefer: 'return=representation' },
      body: JSON.stringify(f.nextEndDate ? { end_time: f.next, end_date: f.nextEndDate } : { end_time: f.next }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok || !Array.isArray(body) || body.length !== 1) { console.log(`  ОШИБКА PATCH ${res.status} ${JSON.stringify(body).slice(0, 120)}`); skipped++; continue; }
    const r = body[0];
    console.log(`  readback: ${r.id.slice(0, 8)} ${r.start_time}→${r.end_time} (ожидалось ${r.start_time}→${f.next})`);
    done++;
  } catch (e) { console.log(`ОШИБКА ${f.id}: ${String(e.message || e).slice(0, 140)}`); skipped++; }
}
console.log(`итог: ${done}, пропущено ${skipped}`);
