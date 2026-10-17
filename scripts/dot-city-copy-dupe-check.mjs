// Юнит класса «городская карточка-копия» (scripts/city-copy-key.mjs).
// Кейсы взяты из разбора run 297 (реальные пары Cyprus.BZ ↔ Cyprus Now) + границы фильтров.
// Запуск: node scripts/dot-city-copy-dupe-check.mjs
import { cityCopyMatch, cityCopyPairs, timeDiffMin, commonWords } from './city-copy-key.mjs';

let ok = 0, fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { ok += 1; console.log(`ok   ${name}`); } else { fail += 1; console.log(`FAIL ${name} ${extra}`); }
};

// Реальная пара run 297: The Little Prince on Ice (bz, зал) ↔ Little Prince (CN, адрес уровня города).
const bz = { id: '797e6d96', status: 'active', title: 'The Little Prince on Ice', title_ru: 'Шоу на льду «Маленький принц»',
  city: 'Лимасол, Кипр', address: 'Pattichio Theatre, Лимасол, Кипр', lat: 34.6814, lng: 33.044, start_date: '2026-12-06', start_time: '18:30' };
const cn = { id: '6374b736', status: 'active', title: 'Little Prince', title_ru: 'Маленький принц',
  city: 'Лимасол, Кипр', address: 'Лимасол, Кипр', lat: 34.6853, lng: 33.0333, start_date: '2026-12-06', start_time: '18:30' };

const m = cityCopyMatch(bz, cn);
check('реальная пара run 297 распознана', !!m, JSON.stringify(m));
check('общие слова little/prince (минимум 2)', !!m && m.common.length >= 2, m && m.common.join(','));
check('keep — карточка с площадкой, drop — городская копия', !!m && m.keep === '797e6d96' && m.drop === '6374b736', m && `${m.keep}/${m.drop}`);
check('порядок аргументов не важен', !!cityCopyMatch(cn, bz) && cityCopyMatch(cn, bz).keep === '797e6d96');

// Время расходится на 3 ч 20 м (пара «полнолуние», намеренно НЕ кандидат).
const moonA = { ...bz, id: 'e893b921', title: 'Октябрьское музыкальное полнолуние на набережной', start_time: '19:30' };
const moonB = { ...cn, id: '4b708b73', title: 'ΜΟΥΣΙΚΗ ΠΑΝΣΕΛΗΝΟΣ ΠΡΟΚΥΜΑΙΑ', title_ru: 'Музыкальное полнолуние на набережной', start_time: '16:10' };
check('расхождение времени 3 ч 20 м — не кандидат', cityCopyMatch(moonA, moonB) === null);
check('timeDiffMin 19:30↔16:10 = 200', timeDiffMin(moonA, moonB) === 200, String(timeDiffMin(moonA, moonB)));
check('timeDiffMin без времени = null', timeDiffMin({ start_time: '' }, { start_time: '10:00' }) === null);

// Оба адреса — уровень города: не наш класс (там работают другие ветки дедупа).
check('два городских адреса — не кандидат', cityCopyMatch({ ...bz, address: 'Лимасол, Кипр' }, cn) === null);
// Оба адреса называют площадку: адреса разные, но это не «городская копия».
check('две площадки — не кандидат', cityCopyMatch({ ...cn, address: 'Rialto Theatre' }, { ...bz, address: 'Pattichio Theatre' }) === null);
// Одно общее слово (только «лимасол» в названии города) — мало.
check('одно общее слово — не кандидат', cityCopyMatch({ ...bz, title: 'Ice Show', title_ru: null }, { ...cn, title: 'Little Prince', title_ru: null }) === null);
// Разные дни / города.
check('разные дни — не кандидат', cityCopyMatch(bz, { ...cn, start_date: '2026-12-07' }) === null);
check('разные города — не кандидат', cityCopyMatch(bz, { ...cn, city: 'Пафос, Кипр' }) === null);
// Пин дальше 1500 м.
check('пин 5 км — не кандидат', cityCopyMatch(bz, { ...cn, lat: 34.6853, lng: 33.12 }) === null);
// Архивная копия не участвует (дедуп уже отработал).
check('архивная копия — не кандидат', cityCopyMatch(bz, { ...cn, status: 'archived' }) === null);
// Без гео.
check('без координат — не кандидат', cityCopyMatch(bz, { ...cn, lat: null }) === null);
// Та же карточка дважды.
check('одна и та же карточка — не кандидат', cityCopyMatch(bz, bz) === null);

// Групповой проход: две пары в одном дне не должны схлопнуться в одну, дубликатов нет.
const rows = [bz, cn, { ...bz, id: 'aaaaaaaa', title: 'Spartacus Ballet', title_ru: 'Балет Спартак', address: 'Nicosia Municipal Theatre',
  city: 'Никосия, Кипр', start_date: '2026-11-27', start_time: '19:30' },
{ ...cn, id: 'bbbbbbbb', title: 'Балет Спартак в Никосии', title_ru: null, address: 'Никосия, Кипр', city: 'Никосия, Кипр',
  start_date: '2026-11-27', start_time: '19:35' }];
const pairs = cityCopyPairs(rows);
check('cityCopyPairs находит обе пары', pairs.length === 2, String(pairs.length));
check('ни одна пара не про архивные строки', pairs.every((p) => p.a.status !== 'archived' && p.b.status !== 'archived'));
check('commonWords не падает на пустых названиях', commonWords({ title: '' }, { title: 'x' }).length === 0);

console.log(`\nИтог: ok ${ok}, FAIL ${fail}`);
process.exit(fail ? 1 : 0);
