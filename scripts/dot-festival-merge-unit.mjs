// Юнит: правило «живой дубль» не склеивает РАЗНЫЕ события одной программы фестиваля.
// Повод — прогон 38024912841 (10.10.2026): «ΙΔΑΙΟΝ PROJECT» и «Andreas Krambias Quintet»
// (обе 24.10 19:00, Nicosia Municipal Theatre) склеились по греческому псевдониму
// (3 общих слова διεθνές/φεστιβάλ/λευκωσίας) + одинаковый адрес; карточка дня ушла
// в archived в том же прогоне, где была создана.
import { liveDupeMatch } from './live-dupe-key.mjs';

const base = { city: 'Никосия, Кипр', address: 'Nicosia Municipal Theatre', lat: 35.17277, lng: 33.3547068, start_date: '2026-10-24', start_time: '19:00' };
const idaeon = { ...base, title: 'ΙΔΑΙΟΝ PROJECT – Διεθνές Φεστιβάλ Λευκωσίας 2026', title_ru: 'МЕЖДУНАРОДНЫЙ ПРОЕКТ – Международный фестиваль Никосии 2026', title_en: 'IDAEON PROJECT – Nicosia International Festival 2026' };
const krambias = { ...base, title: 'Andreas Krambias – Quintet – Διεθνές Φεστιβάλ Λευκωσίας 2026', title_ru: 'Андреас Крамбьяс – Квинтет – Международный фестиваль Никосии 2026', title_en: 'Andreas Krambias – Quintet – Nicosia International Festival 2026' };

const gran = { city: 'Убуд, Bali', address: 'Paradiso Ubud, Jl. Goutama', lat: -8.5078, lng: 115.2632, start_date: '2026-10-09', start_time: '17:00', title: 'Кинопоказ Gran Torino в Paradiso Ubud 9 октября', title_ru: 'Кинопоказ Gran Torino в Paradiso Ubud 9 октября' };
const brave = { ...gran, title: 'Кинопоказ Brave в Paradiso Ubud 9 октября', title_ru: 'Кинопоказ Brave в Paradiso Ubud 9 октября' };

const cases = [
  ['разные концерты программы фестиваля — НЕ дубль', idaeon, krambias, false],
  ['разные фильмы одного кинотеатра — НЕ дубль', gran, brave, false],
  ['та же карточка (дубль) — по-прежнему дубль', idaeon, { ...idaeon, id: 'x' }, true],
];

let ok = 0;
for (const [name, a, b, want] of cases) {
  const got = Boolean(liveDupeMatch(a, b)) === want;
  console.log(`${got ? 'OK  ' : 'ПЛОХО'} ${name} (вердикт: ${liveDupeMatch(a, b) || 'null'})`);
  if (got) ok++;
}
console.log(`ЮНИТ: ${ok}/${cases.length} OK`);
process.exit(ok === cases.length ? 0 : 1);
