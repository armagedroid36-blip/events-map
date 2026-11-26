const URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const K = process.env.SUPABASE_SERVICE_ROLE;
const H = { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json', Prefer: 'return=representation' };

// 17 прошедших разовых карточек: арбитр — страница/текст поста (одна дата, повтора нет)
const ARCH = {
  '1050d843': 'bz-прогон театральной постановки 18–23.11 закончился 23.11 (end_date карточки)',
  '3f4fd65e': 'CN-запись сеанса 22.11 17:00 (per-date page), сеанс прошёл',
  '477f4086': 'bz: клубный вечер 22.11 22:00, одна дата',
  '5c60781b': 'bz: концерт 22.11 20:30, одна дата',
  '6be1b3c5': 'CN: спектакль ΘΟΚ 22.11 18:00, одна дата',
  '5dad8238': 'CN: спектакль Λυσιστράτη 23.11 19:30 (per-date page), прошёл',
  '9fee7123': 'bz: встреча 23.11 18:30, одна дата',
  'a676b30c': 'CN: концерт 23.11 20:30, одна дата',
  'd6238af7': 'CN: кинопоказ 23.11 20:00 (per-date page), прошёл',
  'fbb7f708': 'TG: «День НАСТОЛЬНЫХ ИГР» 22.11 14:00, одна дата',
  '24b77c4f': 'TG: StartTalk 23.11 19:00, разовая встреча',
  'a0c20939': 'TG: мастер-класс по массажу 23.11 12:00, одна дата',
  'e9fbc30b': 'TG: бесплатное пробное занятие 23.11 09:00, разовое',
  'fa41bb33': 'TG: «Понедельник, 23 ноября | 09:30–10:30» — одна дата',
  '6512ded9': 'TG: «23 ноября два клуба объединяются ради особенного вечера» — разовое',
  '01e20bc2': 'TG/bz: LAST LIGHT 23.11 в Savaya, отдельная клубная программа на дату',
  'e9ff1965': 'TG: встреча-знакомство психологов 23.11 12:00, одна дата',
};
// регулярные по явному расписанию в тексте поста
const REC = {
  'bbe3a530': { recurrence: { freq: 'weekly', days: [2, 3, 5] }, note: 'TG: «Вторник и пятница | 9:30 | Среда | 11:30» — недельное расписание' },
  'c1a21403': { recurrence: { freq: 'weekly', days: [1] }, note: 'megatix: «MONDAY IN RED RUBY» — недельный понедельничный вечер' },
};

const q = `status=eq.active&start_date=lt.2026-11-24&recurrence=is.null&or=(end_date.is.null,end_date.lt.2026-11-24)&select=id,title,start_date&order=start_date.asc,id.asc&limit=40`;
const rows = await (await fetch(`${URL}/rest/v1/events?${q}`, { headers: H })).json();
let n = 0;
for (const [pref, note] of Object.entries(ARCH)) {
  const e = rows.find(x => x.id.startsWith(pref));
  if (!e) { console.log('MISS', pref); continue; }
  const body = { status: 'archived', auto_review: { verdict: 'reject', reason: 'past', note } };
  const r = await fetch(`${URL}/rest/v1/events?id=eq.${e.id}&status=eq.active`, { method: 'PATCH', headers: H, body: JSON.stringify(body) });
  const res = await r.json();
  const ok = Array.isArray(res) && res.length === 1 && res[0].status === 'archived';
  if (ok) n++;
  console.log(ok ? 'OK' : 'FAIL', pref, e.title.slice(0, 40), res?.[0]?.status || JSON.stringify(res).slice(0, 120));
}
for (const [pref, v] of Object.entries(REC)) {
  const e = rows.find(x => x.id.startsWith(pref));
  if (!e) { console.log('MISS', pref); continue; }
  const body = { recurrence: v.recurrence, end_date: null, auto_review: { verdict: 'publish', reason: 'recurrence-fill', note: v.note } };
  const r = await fetch(`${URL}/rest/v1/events?id=eq.${e.id}&status=eq.active`, { method: 'PATCH', headers: H, body: JSON.stringify(body) });
  const res = await r.json();
  console.log('REC', pref, e.title.slice(0, 40), JSON.stringify(res?.[0]?.recurrence), res?.[0]?.status);
}
console.log('archived', n);
