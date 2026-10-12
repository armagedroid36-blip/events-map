// Юнит-проверка времени-заглушки Балифорума (scripts/start-time-stub.mjs).
import { cleanStartTime, isStubTime } from './start-time-stub.mjs';

let ok = 0;
let fail = 0;
function check(name, got, want) {
  const pass = JSON.stringify(got) === JSON.stringify(want);
  if (pass) { ok++; console.log('OK  ', name); } else { fail++; console.log('FAIL', name, '— получили', JSON.stringify(got), 'ждали', JSON.stringify(want)); }
}

check('заглушка 23:59:59 (лента, пробел)', cleanStartTime('2026-10-12 23:59:59'), null);
check('заглушка 23:59:59 (ISO)', cleanStartTime('2026-10-12T23:59:59'), null);
check('заглушка 23:59 без секунд', cleanStartTime('2026-10-12 23:59'), null);
check('реальное 09:00', cleanStartTime('2026-10-09 09:00:00'), '09:00');
check('реальное 19:30 (диапазон источника)', cleanStartTime('2026-10-14 19:30:00'), '19:30');
check('полночь 00:00 не трогаем (дизайн сайта)', cleanStartTime('2026-10-19 00:00:00'), '00:00');
check('пусто → null', cleanStartTime(null), null);
check('мусор → null', cleanStartTime('не дата'), null);
check('isStubTime 23:59:59', isStubTime('2026-10-12 23:59:59'), true);
check('isStubTime 22:59:59', isStubTime('2026-10-12 22:59:59'), false);
check('isStubTime null', isStubTime(null), false);

console.log(`\nИтог: ${ok}/${ok + fail} OK`);
process.exit(fail ? 1 : 0);
