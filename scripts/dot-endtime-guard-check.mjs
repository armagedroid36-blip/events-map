// Юнит проверки cleanEndTime (scripts/end-time-guard.mjs) на реальных формах
// данных источников: заглушка снимается, настоящее окончание остаётся.
import { cleanEndTime } from './end-time-guard.mjs';

const cases = [
  // [вход, ожидание, описание]
  [{ start_date: '2026-10-18', start_time: '16:00', end_date: '2026-10-18', end_time: '00:00' }, null,
    'Cyprus Now: полночь того же дня = окончания нет (4576efc3)'],
  [{ start_date: '2026-11-07', start_time: '14:00', end_date: '2026-11-07', end_time: '12:00' }, null,
    'окончание раньше начала того же дня = заглушка'],
  [{ start_date: '2026-10-20', start_time: '18:00', end_date: '2026-10-20', end_time: '09:00' }, null,
    'cyprus.bz endDate=startDate (dfe6ba57)'],
  [{ start_date: '2026-10-24', start_time: '19:00', end_date: '2026-10-24', end_time: '14:00' }, null,
    'Балифорум UTC-полночь (af61ca24)'],
  [{ start_date: '2026-10-10', start_time: '09:00', end_date: '2026-10-11', end_time: '00:00' }, '00:00',
    'многодневное: полночь ПОСЛЕДНЕГО дня — настоящее окончание, оставляем'],
  [{ start_date: '2026-10-10', start_time: '13:00', end_date: '2026-10-10', end_time: '15:00' }, '15:00',
    'настоящий диапазон в один день'],
  [{ start_date: '2026-10-10', start_time: '23:00', end_date: '2026-10-11', end_time: '20:59' }, '20:59',
    'ночной переход через полночь (Historic Limassol Walk, 0863b0c6)'],
  [{ start_date: '2026-10-10', start_time: null, end_date: '2026-10-10', end_time: '00:00' }, '00:00',
    'начала нет — не догадываемся'],
  [{ start_date: '2026-10-10', start_time: '20:00', end_date: '2026-10-10', end_time: null }, null,
    'окончания нет'],
];

let ok = 0;
for (const [input, want, desc] of cases) {
  const got = cleanEndTime(input);
  const pass = got === want;
  if (pass) ok++;
  console.log(`${pass ? 'OK  ' : 'FAIL'} ${desc} -> ${JSON.stringify(got)} (ждали ${JSON.stringify(want)})`);
}
console.log(`\nИтог: ${ok}/${cases.length}`);
process.exit(ok === cases.length ? 0 : 1);
