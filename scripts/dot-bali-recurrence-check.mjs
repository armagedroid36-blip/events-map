// Юнит правила повтора Балифорума (scripts/bali-recurrence.mjs)
import { recurrenceOf } from './bali-recurrence.mjs';

const cases = [
  ['еженедельно по субботам', ['2026-10-24', '2026-10-31', '2026-11-07'], { freq: 'weekly', days: [6] }],
  ['ежедневно', ['2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23'], { freq: 'daily' }],
  ['Пн и Чт', ['2026-10-19', '2026-10-22', '2026-10-26'], { freq: 'weekly', days: [1, 4] }],
  ['две даты — не серия', ['2026-10-24', '2026-10-25'], null],
  ['одна дата', ['2026-10-24'], null],
  ['пусто', [], null],
  ['мусор', [null, '', 'abc', '2026-10-24'], null],
  ['разный шаг', ['2026-10-20', '2026-10-23', '2026-11-05'], null],
  ['дубли дат схлопываются', ['2026-10-24', '2026-10-24', '2026-10-31', '2026-11-07'], { freq: 'weekly', days: [6] }],
];

let ok = 0;
for (const [name, input, want] of cases) {
  const got = recurrenceOf(input);
  const pass = JSON.stringify(got) === JSON.stringify(want);
  if (pass) ok++;
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${name}: ${JSON.stringify(got)} (ждали ${JSON.stringify(want)})`);
}
console.log(`${ok}/${cases.length} ok`);
process.exit(ok === cases.length ? 0 : 1);
