// Юнит: квота на город внутри бюджета прогона (scripts/city-quota.mjs).
// Приёмка 917: при backlog 916 (Лимасол 44, Никосия 67, Ларнака 11, Пафос 12, восток 1-3)
// и budget=120 два прохода адаптивной квоты обязаны добрать заметно больше 59 карточек
// (старая фиксированная доля 18 на город).
import { cityQuota } from './city-quota.mjs';

let ok = 0;
let fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) {
    ok++;
    console.log(`  OK   ${name}`);
  } else {
    fail++;
    console.log(`  FAIL ${name} ${extra}`);
  }
};

// 1. Равная доля, когда бюджет не просит больше
check('budget 105 / 7 городов → 15', cityQuota(105, 0, 7) === 15, `= ${cityQuota(105, 0, 7)}`);
check('budget 120 / 7 городов → 18', cityQuota(120, 0, 7) === 18, `= ${cityQuota(120, 0, 7)}`);

// 2. Минимум на город сохраняется, пока бюджет позволяет
check('малые города: остаток 60 / 4 → 15', cityQuota(120, 60, 4) === 15, `= ${cityQuota(120, 60, 4)}`);
check('последний город забирает остаток', cityQuota(120, 90, 1) === 30, `= ${cityQuota(120, 90, 1)}`);

// 3. Границы
check('бюджет исчерпан → 0', cityQuota(120, 120, 3) === 0, `= ${cityQuota(120, 120, 3)}`);
check('перебор → 0', cityQuota(120, 130, 3) === 0, `= ${cityQuota(120, 130, 3)}`);
check('городов не осталось → 0', cityQuota(120, 0, 0) === 0, `= ${cityQuota(120, 0, 0)}`);
check('квота не больше остатка', cityQuota(10, 5, 1) === 5, `= ${cityQuota(10, 5, 1)}`);

// 4. Симуляция прогона: порядок как в сборщике (восток первым), лента ограничена backlog-ом
const CITIES = ['famagusta', 'protaras', 'paralimni', 'larnaca', 'paphos', 'limassol', 'nicosia'];
const BACKLOG = { famagusta: 3, protaras: 1, paralimni: 1, larnaca: 11, paphos: 12, limassol: 44, nicosia: 67 };
function simulate(budget, passes, fixedQuota = null) {
  let added = 0;
  const taken = Object.fromEntries(CITIES.map((c) => [c, 0]));
  for (let pass = 0; pass < passes; pass++) {
    for (let idx = 0; idx < CITIES.length; idx++) {
      if (added >= budget) return { added, taken };
      const city = CITIES[idx];
      const quota = fixedQuota ?? (pass === 0 ? cityQuota(budget, added, CITIES.length - idx) : budget - added);
      const free = BACKLOG[city] - taken[city];
      const take = Math.max(0, Math.min(quota, free));
      taken[city] += take;
      added += take;
    }
  }
  return { added, taken };
}

const oldRun = simulate(120, 1, 18);
const newRun = simulate(120, 2);
check('старая модель (доля 18) даёт ≈ 64 из 134', oldRun.added >= 60 && oldRun.added <= 68, `= ${oldRun.added}`);
check('новая модель добирает ≥ 92 из 134', newRun.added >= 92, `= ${newRun.added}`);
check('новая модель не выходит за бюджет', newRun.added <= 120, `= ${newRun.added}`);
check('восточные города получили свою долю', newRun.taken.famagusta >= 3 && newRun.taken.protaras >= 1,
  JSON.stringify(newRun.taken));
check('крупные города забрали остаток', newRun.taken.limassol + newRun.taken.nicosia > 18 + 18,
  `Л ${newRun.taken.limassol} / Н ${newRun.taken.nicosia}`);

console.log(`\n${fail === 0 ? 'ИТОГ OK' : 'ИТОГ FAIL'} ${ok}/${ok + fail}`);
if (fail > 0) process.exit(1);
