// Юнит-проверка кросс-источникового дедупа (греческий источник ↔ RU/EN агрегатор).
//
// 5 положительных пар — реальные дубли с прода (22.11.2026), 5 отрицательных
// контролей — события, которые склеивать НЕЛЬЗЯ (разные дни серии, разные даты,
// разные районы одного города).
//
// Запуск: node scripts/dot-dedupe-lang-check.mjs → exit 0 при полном совпадении.
import { liveCrossSourceMatch } from './live-dupe-key.mjs';

const base = {
  status: 'active',
  title: '',
  title_ru: '',
  title_en: '',
  city: 'Никосия, Кипр',
  address: '',
  lat: null,
  lng: null,
  start_date: '2026-12-06',
  start_time: '16:00:00',
  category_id: 'cat',
};

const ev = (o) => ({ ...base, ...o });

const positives = [
  [
    'Детский рождественский фестиваль в Ахериту (Фамагуста)',
    ev({
      id: 'p1a',
      title: 'Χριστουγεννιάτικο Φεστιβάλ Παιδιού στον Αχερίτου 2026',
      title_ru: 'Детский рождественский фестиваль в Ахериту',
      title_en: "Children's Christmas Festival in Acheritou",
      city: 'Фамагуста, Кипр',
      address: 'Κεντρική Πλατεία Αχερίτου',
      lat: 35.0996644,
      lng: 33.8613357,
      start_time: '16:00:00',
      category_id: 'festival',
    }),
    ev({
      id: 'p1b',
      title: 'Χριστουγεννιάτικο Φεστιβάλ Παιδιού στο δημοτικό Διαμέρισμα Αχερίτου',
      title_ru: 'Детский рождественский фестиваль в муниципальном районе Ахериту',
      title_en: "Children's Christmas Festival in the municipal district of Acheritou",
      city: 'Фамагуста, Кипр',
      address: 'Фамагуста, Кипр',
      lat: 35.1205,
      lng: 33.9432,
      start_time: '16:00:00',
      category_id: 'festival',
    }),
  ],
  [
    'Звуковые ландшафты (Никосия, музей)',
    ev({
      id: 'p2a',
      title: 'Τοπία Ήχου: Συνομιλία με τους Πίνακες στη Λευκωσία',
      title_ru: 'Звуковые ландшафты: Беседа с картинами в Никосии',
      title_en: 'Soundscapes: A Conversation with the Paintings',
      address: 'Μουσείο Μοντέρνας, Σύγχρονης Τέχνης',
      lat: 35.1722517,
      lng: 33.355388,
      start_time: '16:00:00',
      category_id: 'concert',
    }),
    ev({
      id: 'p2b',
      title: 'Ландшафты звука: беседа с картинами',
      title_ru: 'Ландшафты звука: беседа с картинами',
      title_en: 'Soundscapes: A Conversation with Paintings',
      address: 'Музей модернистского и современного искусства, Никосия',
      lat: 35.1746436,
      lng: 33.3706898,
      start_time: '16:00:00',
      category_id: 'concert',
    }),
  ],
  [
    'Edgar Allan Poe × Amy Winehouse (театр Сатирико)',
    ev({
      id: 'p3a',
      title: 'Edgar Allan Poe × Amy Winehouse: театр в Никосии',
      title_ru: 'Edgar Allan Poe × Amy Winehouse: театр в Никосии',
      title_en: 'Edgar Allan Poe × Amy Winehouse: theater in Nicosia',
      address: 'Театр «Сатирико» Никосия, Никосия',
      lat: 35.1632112,
      lng: 33.3864655,
      start_date: '2026-11-26',
      start_time: '20:00:00',
      category_id: 'theatre',
    }),
    ev({
      id: 'p3b',
      title: 'Edgar Allan Poe × Amy Winehouse: Theatre in Nicosia',
      title_ru: 'Эдгар Аллан По × Эми Уайнхаус: Театр в Никосии',
      title_en: 'Edgar Allan Poe × Amy Winehouse: Theatre in Nicosia',
      address: 'Σατιρικό Θέατρο',
      lat: 35.1289906,
      lng: 33.3441035,
      start_date: '2026-11-26',
      start_time: '20:00:00',
      category_id: 'theatre',
    }),
  ],
  [
    'Candlelight: Рождественская классика (время-заглушка 00:00)',
    ev({
      id: 'p4a',
      title: 'Candlelight: Χριστουγεννιάτικα Κλασικά',
      title_ru: 'Candlelight: Рождественская классика',
      title_en: 'Candlelight: Christmas Classics',
      city: 'Лимасол, Кипр',
      address: 'The GrandResort Limited Edition by Leonardo Hotels',
      lat: 34.7136119,
      lng: 33.1626284,
      start_date: '2026-12-18',
      start_time: '00:00:00',
      category_id: 'concert',
    }),
    ev({
      id: 'p4b',
      title: 'Candlelight: Рождественская классика (Лимассол)',
      title_ru: 'Candlelight: Рождественская классика (Лимассол)',
      title_en: 'Candlelight: Christmas Classics (Limassol)',
      city: 'Лимасол, Кипр',
      address: 'The Grand Resort, Лимассол',
      lat: 34.7071,
      lng: 33.0226,
      start_date: '2026-12-18',
      start_time: '20:30:00',
      category_id: 'concert',
    }),
  ],
  [
    'Вечная борьба добра и зла (Айос-Георгиос Силику)',
    ev({
      id: 'p5a',
      title: 'Вечная борьба добра и зла в Agios Georgios Silikon',
      title_ru: 'Вечная борьба добра и зла в Agios Georgios Silikon',
      title_en: 'The eternal struggle between good and evil in Agios Georgios Silikou',
      city: 'Лимасол, Кипр',
      address: 'Лимасол, Кипр',
      lat: 34.7071,
      lng: 33.0226,
      start_date: '2026-11-22',
      start_time: '10:00:00',
      category_id: 'workshop',
    }),
    ev({
      id: 'p5b',
      title: 'Αέναη πάλη καλού και κακού στον Άγιο Γεώργιο Σιλίκου',
      title_ru: 'Вечная борьба добра и зла в Айос-Георгиос Силику',
      title_en: 'Eternal struggle between good and evil in Agios Georgios Silikou',
      city: 'Лимасол, Кипр',
      address: 'Άγιος Γεώργιος Σιλίκου',
      lat: 34.8151304,
      lng: 32.8984644,
      start_date: '2026-11-22',
      start_time: '10:00:00',
      category_id: 'workshop',
    }),
  ],
];

const negatives = [
  [
    'Tien Sa Show — разные дни серии',
    ev({ id: 'n1a', title: 'Tien Sa Show', title_en: 'Tien Sa Show', city: 'Дананг, Вьетнам', address: 'Cầu Sông Hàn', start_date: '2026-12-05', start_time: '20:00:00', category_id: 'show' }),
    ev({ id: 'n1b', title: 'Tien Sa Show', title_en: 'Tien Sa Show', city: 'Дананг, Вьетнам', address: 'Cầu Sông Hàn', start_date: '2026-12-06', start_time: '20:00:00', category_id: 'show' }),
  ],
  [
    'Networking «Pro-dvizhenie» — разные даты',
    ev({ id: 'n2a', title: 'Networking "Pro-dvizhenie" in Ubud', city: 'Бали, Индонезия', address: 'Ubud', start_date: '2026-11-12', start_time: '18:00:00', category_id: 'meetup' }),
    ev({ id: 'n2b', title: 'Networking "Pro-dvizhenie" in Ubud', city: 'Бали, Индонезия', address: 'Ubud', start_date: '2026-11-19', start_time: '18:00:00', category_id: 'meetup' }),
  ],
  [
    'Квиз — разные районы (Букит vs Чангу)',
    ev({ id: 'n3a', title: 'Квиз, плиз! Букит', city: 'Бали, Индонезия', address: 'Bukit, Jimbaran', start_date: '2026-12-01', start_time: '19:00:00', category_id: 'games' }),
    ev({ id: 'n3b', title: 'Квиз, плиз! Чангу', city: 'Бали, Индонезия', address: 'Canggu', start_date: '2026-12-01', start_time: '19:00:00', category_id: 'games' }),
  ],
  [
    'LAST LIGHT в Savaya — разные даты',
    ev({ id: 'n4a', title: 'LAST LIGHT в Savaya', city: 'Бали, Индонезия', address: 'Savaya Bali', start_date: '2026-12-13', start_time: '22:00:00', category_id: 'party' }),
    ev({ id: 'n4b', title: 'LAST LIGHT в Savaya', city: 'Бали, Индонезия', address: 'Savaya Bali', start_date: '2026-12-20', start_time: '22:00:00', category_id: 'party' }),
  ],
  [
    'Вечная борьба — разные даты',
    ev({ id: 'n5a', title: 'Вечная борьба добра и зла в Agios Georgios Silikon', city: 'Лимасол, Кипр', address: 'Άγιος Γεώργιος Σιλίκου', start_date: '2026-11-22', start_time: '10:00:00', category_id: 'workshop' }),
    ev({ id: 'n5b', title: 'Вечная борьба добра и зла в Agios Georgios Silikon', city: 'Лимасол, Кипр', address: 'Άγιος Γεώργιος Σιλίκου', start_date: '2026-11-29', start_time: '10:00:00', category_id: 'workshop' }),
  ],
];

let fails = 0;
console.log('=== положительные (должны склеиваться) ===');
positives.forEach(([name, a, b], i) => {
  const r = liveCrossSourceMatch(a, b);
  console.log(`${r ? 'ok  ' : 'FAIL'} #${i + 1} ${name}${r ? ` — ${r}` : ' — пары нет'}`);
  if (!r) fails += 1;
});
console.log('=== отрицательные (не должны склеиваться) ===');
negatives.forEach(([name, a, b], i) => {
  const r = liveCrossSourceMatch(a, b);
  console.log(`${r ? 'FAIL' : 'ok  '} #${i + 1} ${name}${r ? ` — ЛОЖНАЯ ПАРА (${r})` : ''}`);
  if (r) fails += 1;
});
console.log(fails === 0 ? '\nвсе кейсы совпали: exit 0' : `\nрасхождений: ${fails}`);
process.exit(fails === 0 ? 0 : 1);
