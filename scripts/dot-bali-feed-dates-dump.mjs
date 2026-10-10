// Дамп дат ленты Бали по фрагменту названия (для проверки правила диапазона).
import { execSync } from 'node:child_process';
const needle = (process.argv[2] || '').toLowerCase();
function feed(page) {
  const out = execSync(
    `curl -s -x http://127.0.0.1:10809 --max-time 20 "https://baliforum.ru/api/v1/events?defaultList=1&page=${page}"`,
    { maxBuffer: 1 << 28 },
  );
  return JSON.parse(out.toString('utf8'));
}
for (let page = 1; page <= 4; page++) {
  const evs = feed(page).data || [];
  if (!evs.length) break;
  for (const e of evs) {
    if (!(e.title || '').toLowerCase().includes(needle)) continue;
    const ds = (e.eventDates || []).map((d) => `${String(d.startAt).slice(0, 16)}→${d.endAt ? String(d.endAt).slice(0, 16) : 'null'}`);
    console.log(`\n${e.title} | slug ${e.slug} | дат ${ds.length}`);
    console.log(ds.slice(0, 12).join('\n'));
  }
}
