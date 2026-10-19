// Юнит зонда «издание серии потеряно из-за правила интервала» (запуск 334).
// Запуск: node scripts/dot-archived-edition-check.mjs
import { findLostEditions } from './archived-editions.mjs';

let ok = 0, fail = 0;
function t(name, cond) { if (cond) { ok++; console.log(`ok   ${name}`); } else { fail++; console.log(`FAIL ${name}`); } }

const TODAY = '2026-10-19';
const base = (o) => ({ id: Math.random().toString(36).slice(2), city: 'Никосия, Кипр', status: 'active', website: 'x', ...o });

// 1. Кейс 333: архивное издание внутри живого интервала → потеря
{
  const rows = [
    base({ title: 'Official Nicosia Christmas Market 2026', start_date: '2026-11-28', end_date: '2026-12-21' }),
    base({ title: 'Official Nicosia Christmas Market 2026', start_date: '2026-12-12', end_date: '2026-12-13', status: 'archived' }),
  ];
  const r = findLostEditions(rows, TODAY);
  t('издание внутри интервала → найдено', r.length === 1 && r[0].row.start_date === '2026-12-12');
  t('накрывающая карточка указана', r[0].cover && r[0].cover.status === 'active');
}

// 2. Та же пара, но издание в ПРОШЛОМ → не потеря (archive-past законен)
{
  const rows = [
    base({ title: 'Tango Course', start_date: '2026-10-14', end_date: '2026-10-21' }),
    base({ title: 'Tango Course', start_date: '2026-10-18', end_date: '2026-10-18', status: 'archived' }),
  ];
  t('прошедшая дата не считается потерей', findLostEditions(rows, TODAY).length === 0);
}

// 3. Есть живой близнец по названию+дате → не потеря
{
  const rows = [
    base({ title: 'Leptos Cyprus International 4-day Challenge', start_date: '2026-11-26', end_date: '2026-11-29' }),
    base({ title: 'Leptos Cyprus International 4-day Challenge', start_date: '2026-11-27', end_date: '2026-11-27', status: 'archived' }),
    base({ title: 'Leptos Cyprus International 4-day Challenge', start_date: '2026-11-27', end_date: '2026-11-27' }),
  ];
  t('живой близнец исключает кандидата', findLostEditions(rows, TODAY).length === 0);
}

// 4. Архивная карточка вне интервала → не потеря
{
  const rows = [
    base({ title: 'Regatta of Champions', start_date: '2026-11-08', end_date: '2026-11-15' }),
    base({ title: 'Regatta of Champions', start_date: '2026-12-01', end_date: '2026-12-01', status: 'archived' }),
  ];
  t('дата вне интервала не считается', findLostEditions(rows, TODAY).length === 0);
}

// 5. Другой город → не потеря
{
  const rows = [
    base({ title: 'Lords of the Sound', start_date: '2027-01-19', end_date: '2027-01-23', city: 'Пафос, Кипр' }),
    base({ title: 'Lords of the Sound', start_date: '2027-01-21', end_date: '2027-01-21', status: 'archived', city: 'Лимасол, Кипр' }),
  ];
  t('другой город не считается', findLostEditions(rows, TODAY).length === 0);
}

// 6. Накрывающая карточка сама архивная → не потеря (нет живого интервала)
{
  const rows = [
    base({ title: 'Christmas Fair', start_date: '2026-12-01', end_date: '2026-12-20', status: 'archived' }),
    base({ title: 'Christmas Fair', start_date: '2026-12-05', end_date: '2026-12-05', status: 'archived' }),
  ];
  t('архивный интервал не накрывает', findLostEditions(rows, TODAY).length === 0);
}

// 7. Разные события (разные ядра названия) в одном интервале → не потеря
{
  const rows = [
    base({ title: 'Christmas Villages 2026', start_date: '2026-11-21', end_date: '2026-12-06' }),
    base({ title: 'German Christmas Market', start_date: '2026-12-06', end_date: '2026-12-06', status: 'archived' }),
  ];
  t('другое событие не склеивается', findLostEditions(rows, TODAY).length === 0);
}

console.log(`\n${fail === 0 ? 'ВСЁ ОК' : 'ЕСТЬ ОШИБКИ'}: ${ok}/${ok + fail} ok`);
process.exit(fail === 0 ? 0 : 1);
