// Юнит правила «страна вместо улицы — не адрес» (cardAddress в collect-cyprus.mjs).
// Класс 14.11.2026: у cyprus.bz location.name/addressLocality = «Cyprus», и
// карточка печатала адрес «Cyprus, Cyprus» (9 живых). Проверяем, что заглушка
// не доезжает до поля address, а законные адреса не портятся.
// Запуск: DRY_RUN=1 node scripts/dot-cy-address-stub-check.mjs
process.env.DRY_RUN = '1';
const { cardAddress } = await import('./collect-cyprus.mjs');

const cases = [
  // [части, фолбэк, ожидаемый адрес, ярлык]
  [['Cyprus', 'Cyprus'], 'Никосия, Кипр', 'Никосия, Кипр', 'страна+страна → фолбэк-город'],
  [['Cyprus', 'Cyprus'], null, null, 'страна без фолбэка → null'],
  [['Unknown', 'Cyprus'], 'Лимасол, Кипр', 'Лимасол, Кипр', 'Unknown тоже заглушка'],
  [['Markideio Theatre', '28 Oktovriou, Paphos'], null, 'Markideio Theatre, 28 Oktovriou, Paphos', 'настоящий адрес не режется'],
  [['Ayia Napa, Famagusta 5330', 'Cyprus'], null, 'Ayia Napa, Famagusta 5330', 'хвост-страна снимается'],
  [['Nicosia', 'Nicosia'], null, 'Nicosia', 'повтор снимается, название остаётся'],
  [['Пафос, Кипр'], null, 'Пафос', 'в части страна снимается'],
  [null, null, null, 'пусто → null'],
  [['Cyprus'], 'Cyprus', null, 'фолбэк-заглушка тоже не адрес'],
];

let ok = 0;
const fails = [];
for (const [parts, fb, want, label] of cases) {
  const got = cardAddress(parts, fb);
  if (got === want) ok++;
  else fails.push(`${label}: ожидали ${JSON.stringify(want)}, получили ${JSON.stringify(got)}`);
}

console.log(fails.length ? `ПРОВАЛ ${ok}/${cases.length}` : `OK ${ok}/${cases.length}`);
for (const f of fails) console.log(' -', f);
process.exit(fails.length ? 1 : 0);
