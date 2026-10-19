// Юнит правила «интервальная карточка накрывает дату кандидата».
// Запуск: node scripts/dot-interval-cover-check.mjs
import { buildIntervalIndex, coveredByInterval, titleKey, cityKey } from './interval-cover.mjs';

let ok = 0;
let fail = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) { ok++; console.log(`  ok ${name}`); }
  else { fail++; console.log(`  FAIL ${name}: получили ${a}, ждали ${e}`); }
}

const leptos = {
  title: 'Leptos Cyprus International 4-day Challenge – 26-29.11.2026',
  city: 'Пафос, Кипр',
  start_date: '2026-11-26',
  end_date: '2026-11-29',
  status: 'active',
};
const index = buildIntervalIndex([leptos]);

// 1. копия внутри интервала (та самая CN-запись 08.11 — до начала не накрывается,
//    а запись 27.11 — накрывается)
check('копия внутри интервала', coveredByInterval(index, {
  title: 'Leptos Cyprus International 4-day Challenge', city: 'Пафос, Кипр', start_date: '2026-11-27',
}), true);

// 2. дата ДО начала интервала — не копия (08.11 запись = отдельная дата гонки)
check('дата раньше интервала', coveredByInterval(index, {
  title: 'Leptos Cyprus International 4-day Challenge', city: 'Пафос, Кипр', start_date: '2026-11-08',
}), false);

// 3. дата после конца интервала
check('дата позже интервала', coveredByInterval(index, {
  title: 'Leptos Cyprus International 4-day Challenge', city: 'Пафос, Кипр', start_date: '2026-11-30',
}), false);

// 3b. дата ровно на конце интервала — не копия (у тура конец = показ в другом городе)
check('дата = конец интервала', coveredByInterval(index, {
  title: 'Leptos Cyprus International 4-day Challenge', city: 'Пафос, Кипр', start_date: '2026-11-29',
}), false);

// 4. границы: сам start_date не считается копией (это та же карточка по ключу)
check('start_date интервала', coveredByInterval(index, {
  title: 'Leptos Cyprus International 4-day Challenge', city: 'Пафос, Кипр', start_date: '2026-11-26',
}), false);

// 5. другой город
check('другой город', coveredByInterval(index, {
  title: 'Leptos Cyprus International 4-day Challenge', city: 'Лимасол, Кипр', start_date: '2026-11-27',
}), false);

// 6. другое название
check('другое название', coveredByInterval(index, {
  title: 'Lefkara Classic 2026', city: 'Пафос, Кипр', start_date: '2026-11-27',
}), false);

// 7. серия вечеров (end_date = start_date) НЕ создаёт интервала
const series = buildIntervalIndex([{
  title: 'Μια νύκτα στον παράδεισο', city: 'Пафос, Кипр',
  start_date: '2027-01-22', end_date: '2027-01-22', status: 'active',
}]);
check('серия без интервала', coveredByInterval(series, {
  title: 'Μια νύκτα στον παραδείσιο', city: 'Пафос, Кипр', start_date: '2027-01-23',
}), false);

// 8. архивная карточка в индекс не попадает
const arch = buildIntervalIndex([{ ...leptos, status: 'archived' }]);
check('архив не индексируется', coveredByInterval(arch, {
  title: leptos.title, city: leptos.city, start_date: '2026-11-27',
}), false);

// 9. интервал длиннее 30 дней не индексируется (фестивальный сезон — не «одно событие»)
const long = buildIntervalIndex([{
  title: 'Christmas Villages', city: 'Никосия, Кипр',
  start_date: '2026-11-21', end_date: '2027-01-06', status: 'active',
}]);
check('интервал > 30 дней', coveredByInterval(long, {
  title: 'Christmas Villages', city: 'Никосия, Кипр', start_date: '2026-12-20',
}), false);

// 10. нормализация: регистр, пунктуация и суффикс страны не мешают
check('нормализация названия', titleKey('LEPTOS  Cyprus International, 4 Day!'), 'leptos cyprus international 4 day');
check('нормализация города', cityKey('Пафос, Кипр'), 'пафос');

console.log(`\nитог: ok ${ok} | FAIL ${fail}`);
if (fail) process.exit(1);
