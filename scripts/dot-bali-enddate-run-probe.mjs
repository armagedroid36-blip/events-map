// Читающий зонд: проверка ПРАВКИ сборщика Бали — end_date теперь берётся из непрерывного
// ряда дат ленты (у многодневных событий Балифорум ставит каждый день отдельной записью
// с endAt=null). Импортирует РЕАЛЬНЫЕ функции сборщика, чтобы проверялась правка, а не копия.
// Запуск: node --env-file=.env scripts/dot-bali-enddate-run-probe.mjs
import { execSync } from 'node:child_process';
import { pickDate, endDateOf } from './collect-bali.mjs';

function feed(page) {
  const out = execSync(
    `curl -s -x http://127.0.0.1:10809 --max-time 20 "https://baliforum.ru/api/v1/events?defaultList=1&page=${page}"`,
    { maxBuffer: 1 << 28 },
  );
  return JSON.parse(out.toString('utf8'));
}

const WATCH = ['сават', 'circa', 'body remembers', 'йога', 'йог'];
let events = 0, withEnd = 0, multiWithEnd = 0, multi = 0;
const rows = [];
for (let page = 1; page <= 4; page++) {
  const evs = feed(page).data || [];
  if (!evs.length) break;
  for (const e of evs) {
    events++;
    const dates = (e.eventDates || []).length;
    const when = pickDate(e.eventDates);
    if (!when) continue;
    const end = endDateOf(when);
    if (dates > 1) multi++;
    if (end) {
      withEnd++;
      if (dates > 1) multiWithEnd++;
    }
    const t = String(e.title || '');
    if (WATCH.some((w) => t.toLowerCase().includes(w)) || (dates > 1 && end && end !== String(when.raw.startAt).slice(0, 10))) {
      rows.push(`  ${String(when.raw.startAt).slice(0, 10)} → ${end || 'НЕТ'} (записей ${dates}) | ${t.slice(0, 46)}`);
    }
  }
}
console.log(`событий ленты (4 стр.): ${events}, с несколькими датами: ${multi}`);
console.log(`получили end_date: ${withEnd} (из них многодневных по ленте: ${multiWithEnd})`);
console.log('контрольные события:');
console.log(rows.slice(0, 20).join('\n') || '  нет');
