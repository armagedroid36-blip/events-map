const URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const K = process.env.SUPABASE_SERVICE_ROLE;
const q = `status=eq.active&start_date=lt.2026-11-24&recurrence=is.null&or=(end_date.is.null,end_date.lt.2026-11-24)&select=id,title,start_date,end_date,start_time,city,website,description&order=start_date.asc,id.asc&limit=40`;
const r = await fetch(`${URL}/rest/v1/events?${q}`, { headers: { apikey: K, Authorization: `Bearer ${K}` } });
const rows = await r.json();
const MARK = /(кажд[а-яё]*\s+(день|недел|понед|вторн|сред|четверг|пятниц|суббот|воскрес)|еженедельн|по\s+(понедельникам|вторникам|средам|четвергам|пятницам|субботам|воскресеньям)|раз\s+в\s+недел|расписан|серия\s+(встреч|занят)|daily|weekly|every\s+(day|week|mon|tue|wed|thu|fri|sat|sun))/i;
for (const e of rows) {
  const d = (e.description || '').replace(/\s+/g, ' ');
  const m = d.match(MARK);
  console.log(`${e.id.slice(0,8)} | ${e.start_date} ${(e.start_time||'').slice(0,5)} | ${(e.title||'').slice(0,45)} | ${m ? 'MARK:'+m[0] : 'no-marker'} | ${d.slice(0,110)}`);
}
console.log('rows', rows.length);
