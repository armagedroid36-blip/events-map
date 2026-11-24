// Юнит cleanEndTime: окончание раньше начала. Запуск: node scripts/dot-end-time-guard-check.mjs
import { cleanEndTime } from './end-time-guard.mjs';

const cases = [
  // [описание, вход, ожидание]
  ['20:30 -> 19:00 в другой день (гастрольный endDate)', { start_date: '2026-11-27', start_time: '20:30:00', end_date: '2026-12-13', end_time: '19:00:00' }, null],
  ['21:00 -> 14:00 в другой день (фестиваль-интервал)', { start_date: '2026-12-04', start_time: '19:30:00', end_date: '2026-12-06', end_time: '14:00:00' }, null],
  ['23:00 -> 22:59 (минута-заглушка)', { start_date: '2026-11-25', start_time: '23:00:00', end_date: '2026-11-26', end_time: '22:59:00' }, null],
  ['вечеринка 23:00 -> 07:00 законна', { start_date: '2026-12-24', start_time: '23:00:00', end_date: '2026-12-25', end_time: '07:00:00' }, '07:00:00'],
  ['вечеринка 22:00 -> 09:00 законна', { start_date: '2026-12-25', start_time: '22:00:00', end_date: '2026-12-26', end_time: '09:00:00' }, '09:00:00'],
  ['дневной спектакль 17:00 -> 11:30 = брак', { start_date: '2027-03-06', start_time: '17:00:00', end_date: '2027-03-07', end_time: '11:30:00' }, null],
  ['ночной переход 23:00 -> 05:00 законен', { start_date: '2026-11-25', start_time: '23:00:00', end_date: '2026-11-26', end_time: '05:00:00' }, '05:00:00'],
  ['ночной переход 22:00 -> 02:00 законен', { start_date: '2026-11-25', start_time: '22:00:00', end_date: '2026-11-26', end_time: '02:00:00' }, '02:00:00'],
  ['нормальный интервал не трогаем', { start_date: '2026-11-25', start_time: '19:30:00', end_date: '2026-11-25', end_time: '21:00:00' }, '21:00:00'],
  ['тот же день 20:30 -> 19:00 снимается (старое правило)', { start_date: '2026-11-25', start_time: '20:30:00', end_date: '2026-11-25', end_time: '19:00:00' }, null],
  ['без начала окончание не судим', { start_date: '2026-11-25', start_time: null, end_date: '2026-11-25', end_time: '19:00:00' }, '19:00:00'],
  ['пусто -> null', { start_date: '2026-11-25', start_time: '19:00:00', end_date: '2026-11-25', end_time: null }, null],
];

let ok = 0;
for (const [name, input, want] of cases) {
  const got = cleanEndTime(input);
  const pass = got === want;
  if (pass) ok++;
  console.log(`${pass ? 'OK  ' : 'FAIL'} ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
}
console.log(`ИТОГ ${ok}/${cases.length}`);
process.exit(ok === cases.length ? 0 : 1);
