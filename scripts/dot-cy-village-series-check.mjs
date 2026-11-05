// Юнит правила «недельные записи деревни под сезонным агрегатом» (класс 687).
// Запуск: node scripts/dot-cy-village-series-check.mjs
import {
  translitGreek, villageTokens, sameVillage, commonPrefix,
  buildVillageAggregates, coveredByVillageSeries,
} from './village-series.mjs';

let pass = 0;
let fail = 0;
function ok(name, cond, extra = '') {
  if (cond) { pass += 1; console.log(`  ok  ${name}`); }
  else { fail += 1; console.log(`  FAIL ${name} ${extra}`); }
}

// --- транслит ---
ok('Φικάρδου → fikardou', translitGreek('Φικάρδου') === 'fikardou', translitGreek('Φικάρδου'));
ok('Καλοπαναγιώτη → kalopanayioti', translitGreek('Καλοπαναγιώτη') === 'kalopanayioti', translitGreek('Καλοπαναγιώτη'));
ok('Λευκάρων → lefkaron', translitGreek('Λευκάρων') === 'lefkaron', translitGreek('Λευκάρων'));

// --- ключи деревень ---
ok('Фикарду: токен деревни', villageTokens('Χριστουγεννιάτικο Χωριό Φικάρδου').includes('fikardou'),
  JSON.stringify(villageTokens('Χριστουγεννιάτικο Χωριό Φικάρδου')));
ok('Fikardou агрегат: токен деревни', villageTokens('Fikardou Christmas Village: Festive Season 2026–2027').includes('fikardou'),
  JSON.stringify(villageTokens('Fikardou Christmas Village: Festive Season 2026–2027')));
ok('Калоpanагиотис агрегат: kalopanayioti*', villageTokens('Fairytale Christmas Village at Kalopanayiotis').some((t) => t.startsWith('kalopanayioti')),
  JSON.stringify(villageTokens('Fairytale Christmas Village at Kalopanayiotis')));
ok('Λακατάμεια: транслит-токен деревни', villageTokens('Χριστουγεννιάτικο Χωριό Δήμου Λακατάμειας').includes('lakatamias'),
  JSON.stringify(villageTokens('Χριστουγεννιάτικο Χωριό Δήμου Λακατάμειας')));

// --- сопоставление деревень ---
ok('Фикарду = Fikardou', sameVillage(villageTokens('Χριστουγεννιάτικο Χωριό Φικάρδου'), villageTokens('Fikardou Christmas Village')));
ok('Калопанаятис = Kalopanayiotis', sameVillage(villageTokens('Χριστουγεννιάτικο Χωριό Καλοπαναγιώτη'), villageTokens('Kalopanayiotis Christmas Village')));
ok('Фикарду ≠ Калопанагиотис', !sameVillage(villageTokens('Χριστουγεννιάτικο Χωριό Φικάρδου'), villageTokens('Kalopanayiotis Christmas Village')));
ok('Агроу = Агрос (отличие в последней букве)', sameVillage(villageTokens('Χριστουγεννιάτικο Χωριό Αγρού'), villageTokens('Agros Christmas Village')));
ok('Лефкара ≠ Лофу (соседние деревни)', !sameVillage(villageTokens('Χριστουγεννιάτικο Χωριό Λευκάρων'), villageTokens('Lofou Christmas Village')));
ok('чужой корень: префикс 0', commonPrefix('madari', 'kipseli') === 0);
ok('равенство токенов — совпадение', sameVillage(['kato'], ['kato']));
ok('короткий общий корень (<6) не совпадение', !sameVillage(['pano'], ['panagia']));

// --- агрегаты и накрытие ---
const rows = [
  { status: 'active', title: 'Fikardou Christmas Village: Festive Season 2026–2027', start_date: '2026-11-21', end_date: '2027-01-06' },
  { status: 'active', title: 'Fairytale Christmas Village at Kalopanayiotis', start_date: '2026-11-21', end_date: '2027-01-06' },
  { status: 'active', title: 'Lefkara Christmas Village 2026', start_date: '2026-11-21', end_date: '2027-01-06' },
  { status: 'archived', title: 'Agros Christmas Village 2026', start_date: '2026-11-21', end_date: '2027-01-06' },
];
const aggs = buildVillageAggregates(rows);
ok('агрегатов 3 (архивный не считается)', aggs.length === 3, String(aggs.length));

const cand = (title, start_date, end_date) => ({ title, start_date, end_date: end_date || start_date });
ok('Фикарду 28–29.11 внутри агрегата → копия', coveredByVillageSeries(aggs, cand('Χριστουγεννιάτικο Χωριό Φικάρδου', '2026-11-28', '2026-11-29')));
ok('Калопанагиотис 05–06.12 внутри агрегата → копия', coveredByVillageSeries(aggs, cand('Χριστουγεννιάτικο Χωριό Καλοπαναγιώτη', '2026-12-05', '2026-12-06')));
ok('Агрос архивный агрегат не накрывает', !coveredByVillageSeries(aggs, cand('Χριστουγεννιάτικο Χωριό Αγρού', '2026-11-28', '2026-11-29')));
ok('дата до начала сезона не накрыта', !coveredByVillageSeries(aggs, cand('Χριστουγεννιάτικο Χωριό Φικάρδου', '2026-11-14', '2026-11-15')));
ok('дата после конца сезона не накрыта', !coveredByVillageSeries(aggs, cand('Χριστουγεννιάτικο Χωριό Φικάρδου', '2027-01-09', '2027-01-10')));
ok('не рождественская деревня не трогается', !coveredByVillageSeries(aggs, cand('Φεστιβάλ Ζιβανίας στο Πελένδρι', '2026-11-28')));
ok('чужой округ/деревня не трогается', !coveredByVillageSeries(aggs, cand('Χριστουγεννιάτικο Χωριό Στατού', '2026-11-28', '2026-11-29')));

console.log(`\n${pass}/${pass + fail} ok`);
process.exit(fail ? 1 : 0);
