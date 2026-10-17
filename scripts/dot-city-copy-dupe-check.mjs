// Юнит близнецов «одно событие — две карточки» (scripts/city-copy-key.mjs).
// Кейсы из разбора run 297 (реальные пары Cyprus.BZ ↔ Cyprus Now) + границы фильтров.
// Запуск: node scripts/dot-city-copy-dupe-check.mjs
import { twinMatch, twinPairs, timeDiffMin, commonWords } from './city-copy-key.mjs';

let ok = 0, fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { ok += 1; console.log(`ok   ${name}`); } else { fail += 1; console.log(`FAIL ${name} ${extra}`); }
};

// Реальная пара run 297: bz «The Little Prince on Ice» (Pattichio Theatre) ↔ CN «Little Prince» (тот же зал, 33 м).
const bz = { id: '797e6d96', status: 'active', title: 'The Little Prince on Ice', title_ru: 'Шоу на льду «Маленький принц»',
  city: 'Лимасол, Кипр', address: 'Pattichio Theatre, Limassol', lat: 34.6812, lng: 33.0437, start_date: '2026-12-06', start_time: '18:30' };
const cn = { id: '6374b736', status: 'active', title: 'Little Prince', title_ru: 'Маленький принц',
  city: 'Лимасол, Кипр', address: 'Pattihio Municipal Theatre', lat: 34.6814, lng: 33.044, start_date: '2026-12-06', start_time: '18:30' };

const m = twinMatch(bz, cn);
check('реальная пара run 297 распознана', !!m, JSON.stringify(m));
check('общие слова little/prince (уровень A)', !!m && m.tier === 'A' && m.common.length >= 2, m && `${m.tier} ${m.common.join(',')}`);
check('keep — карточка с более полным адресом', !!m && m.keep === '797e6d96' && m.drop === '6374b736', m && `${m.keep}/${m.drop}`);
check('порядок аргументов не важен', !!twinMatch(cn, bz) && twinMatch(cn, bz).keep === '797e6d96');

// Реальная пара: bz «Октябрьское музыкальное полнолуние» 19:30 ↔ CN 16:10 — намеренно НЕ кандидат.
const moonA = { ...bz, id: 'e893b921', title: 'Октябрьское музыкальное полнолуние на набережной', start_time: '19:30' };
const moonB = { ...cn, id: '4b708b73', title: 'ΜΟΥΣΙΚΗ ΠΑΝΣΕΛΗΝΟΣ ΠΡΟΚΥΜΑΙΑ', title_ru: 'Музыкальное полнолуние на набережной', start_time: '16:10' };
check('расхождение времени 3 ч 20 м — не кандидат', twinMatch(moonA, moonB) === null);
check('timeDiffMin 19:30↔16:10 = 200', timeDiffMin(moonA, moonB) === 200, String(timeDiffMin(moonA, moonB)));
check('timeDiffMin без времени = null', timeDiffMin({ start_time: '' }, { start_time: '10:00' }) === null);

// Уровень B: переведённое название (общих слов нет), но тот же зал в 40 м.
const ruTwin = { ...cn, id: 'cccccccc', title: 'Балет Спартак', title_ru: null, title_en: null, lat: 34.6813, lng: 33.0438 };
const b = twinMatch({ ...bz, id: 'bbbbbbbb', title: 'Spartacus Ballet', title_ru: null }, ruTwin);
check('перевод названия + 40 м — уровень B', !!b && b.tier === 'B', JSON.stringify(b));
check('два городских адреса, уровень A — пара находится, keep — карточка с залом', (() => {
  const x = twinMatch({ ...bz, address: 'Лимасол, Кипр' }, cn);
  return !!x && x.tier === 'A' && x.keep === '6374b736';
})());
// Одно общее слово, но 5 км — не пара.
check('одно слово и 5 км — не кандидат', twinMatch({ ...bz, title: 'Ice Show' }, { ...cn, title: 'Little Prince', title_ru: null, lat: 34.6853, lng: 33.12 }) === null);
// Разные дни / без времени / без гео / архивная копия / та же карточка.
check('разные дни — не кандидат', twinMatch(bz, { ...cn, start_date: '2026-12-07' }) === null);
check('без времени — не кандидат', twinMatch(bz, { ...cn, start_time: null }) === null);
check('без координат — не кандидат', twinMatch(bz, { ...cn, lat: null }) === null);
check('архивная копия — не кандидат', twinMatch(bz, { ...cn, status: 'archived' }) === null);
check('одна и та же карточка — не кандидат', twinMatch(bz, bz) === null);
check('commonWords не падает на пустых названиях', commonWords({ title: '' }, { title: 'x' }).length === 0);

// Групповой проход: две пары в разных днях, порядок — сначала уровень A.
const rows = [bz, cn,
  { ...bz, id: 'aaaaaaaa', title: 'Spartacus Ballet', title_ru: null, address: 'Nicosia Municipal Theatre',
    city: 'Никосия, Кипр', start_date: '2026-11-27', start_time: '19:30', lat: 35.1677, lng: 33.3622 },
  { ...cn, id: 'dddddddd', title: 'Балет Спартак в Никосии', title_ru: null, address: 'Никосия, Кипр',
    city: 'Никосия, Кипр', start_date: '2026-11-27', start_time: '19:35', lat: 35.1678, lng: 33.3623 }];
const pairs = twinPairs(rows);
check('twinPairs находит обе пары', pairs.length === 2, String(pairs.length));
check('первой идёт пара уровня A', pairs.length === 2 && pairs[0].tier === 'A', pairs.map((p) => p.tier).join(','));
check('city-копия в паре не становится keep', pairs.every((p) => {
  const keep = p.keep === p.a.id ? p.a : p.b;
  return String(keep.address || '') !== 'Никосия, Кипр' || String((p.keep === p.a.id ? p.b : p.a).address || '') === 'Никосия, Кипр';
}));

console.log(`\nИтог: ok ${ok}, FAIL ${fail}`);
process.exit(fail ? 1 : 0);
