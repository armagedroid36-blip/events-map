// Юнит: слова площадки в заголовке НЕ доказывают, что событие одно.
// Кейс из прогона 381 (расписной 20:15Z, 10.10): «Lubimaya – ION at Dusty Munky»
// и «Jepe at Dusty Munky» — разные вечера одного клуба, адрес у обеих «Dusty Munky»;
// ключ «2 общих слова + адрес~» склеивал их и архивировал живую карточку.
import { liveAbbrevMatch, liveDupeMatch, liveLangPlaceMatch } from './live-dupe-key.mjs';

const mk = (o) => ({
  id: o.id, title: o.title, title_ru: o.title_ru || null, title_en: o.title_en || null,
  city: o.city || 'Лимасол, Кипр', address: o.address || null,
  lat: o.lat ?? 34.6796979, lng: o.lng ?? 33.0461632,
  start_date: o.start_date || '2026-10-16', start_time: o.start_time || '20:00:00',
  end_date: o.end_date || null,
});

const cases = [
  { name: 'ЛОЖНАЯ: два вечера одного клуба (Dusty Munky)', a: mk({ id: 'a', title: 'Lubimaya – ION at Dusty Munky' }), b: mk({ id: 'b', title: 'Jepe at Dusty Munky' }), want: null },
  { name: 'ВЕРНАЯ: тот же артист, два источника (Clayderman)', a: mk({ id: 'c', title: 'RICHARD CLAYDERMAN - For the first time in Cyprus', address: 'Monte Caputo, Limassol', start_date: '2026-11-19', lat: 34.7187, lng: 33.1887 }), b: mk({ id: 'd', title: 'Richard Clayderman: Live Piano Concert in Limassol', address: 'Monte Caputo', start_date: '2026-11-19', lat: 34.7187, lng: 33.1887 }), want: 'match' },
  // Кейс из прогона 38133851150 (расписной 10:58Z, 11.10): TG-афиша Нячанга даёт в RU-псевдониме
  // город кириллицей («Цигун в Нячанге»), в EN — латиницей («Qigong in Nha Trang»), поэтому
  // 2 общих слова nha/trang + общий токен адреса «trang» (сам город) склеили занятие 07:00
  // и вечер в караоке 20:00 в 614 м.
  {
    name: 'ЛОЖНАЯ: город в названии двух алфавитах (Нячанг: цигун 07:00 ↔ вечер 20:00)',
    a: mk({ id: 'e', title: 'Цигун в Нячанге', title_en: 'Qigong in Nha Trang', city: 'Нячанг', address: 'LKUA-15, Đường 2F, An Viên, Phường Nam Nha Trang, Нячанг', start_date: '2026-10-11', start_time: '07:00:00', lat: 12.19569, lng: 109.206839 }),
    b: mk({ id: 'f', title: 'Воскресенье (11 октября) Нячанг', title_en: 'Sunday (October 11) Nha Trang', city: 'Нячанг', address: 'Кафе-Караоке Голос, 84A Trần Phú, Nha Trang, Khánh Hòa', start_date: '2026-10-11', start_time: '20:00:00', lat: 12.1986, lng: 109.2117 }),
    want: null,
  },
  // Кейс из прогона 38248519181 (расписной 12:21Z, 12.10): «женский завтрак❣️» (ZAI cafe,
  // 12:00–15:00, 11/12/15.10) и «Женский завтрак и рисование нейрографики» (Murmur lounge
  // restaurant, 12:00–13:00, 12/13/14.10) — 2 общих слова + общий токен адреса «kuta»
  // (район, а не площадка), 1017 м → правило архивировало живую карточку сразу после сбора.
  {
    name: 'ЛОЖНАЯ: два завтрака одного района (Чангу: ZAI cafe 15:00 ↔ Murmur lounge 13:00)',
    a: mk({ id: 'g', title: 'женский завтрак', title_en: "women's breakfast", city: 'Чангу, Bali', address: 'Jl. Pantai Batu Bolong, Canggu, Kec. Kuta Utara, Kabupaten Badung', start_date: '2026-10-12', start_time: '12:00:00', lat: -8.6451, lng: 115.1414 }),
    b: mk({ id: 'h', title: 'Женский завтрак и рисование нейрографики', title_en: 'Women breakfast and neurographics drawing', city: 'Чангу, Bali', address: 'Jl. Pantai Berawa Gang The Beji, Canggu, Kec. Kuta Utara, Kabupaten Badung', start_date: '2026-10-12', start_time: '12:00:00', lat: -8.6540, lng: 115.1397 }),
    want: null,
  },
  // Кейс из прогона 38282590591 (dispatch 17:11Z, 12.10): две РАЗНЫЕ йоги в Нячанге
  // (Orhideya Ballet Studio 08:00–10:30 ↔ 6-й этаж здания Атласа 09:30, 219 м) были
  // склеены веткой «имя 3сл», потому что англ. псевдонимы дали yoga/those/who —
  // из них два слова служебные. Служебные слова (FUNC) теперь не доказывают тождество.
  {
    name: 'ЛОЖНАЯ: две разные йоги Нячанга (Orhideya 08:00 ↔ Атлас 09:30, 219 м)',
    a: mk({ id: 'i', title: 'Йога у ОКЕАНУСА для тех, кто хочет результат', title_en: 'Yoga at OKEANUS for those who want results', city: 'Нячанг', address: 'в здании Атласа на 6 этаже', start_date: '2026-10-13', start_time: '09:30:00', lat: 12.273779, lng: 109.202092 }),
    b: mk({ id: 'j', title: 'ЙОГА ДЛЯ ТЕХ, КОМУ «ПРОСТО ПОТЯНУТЬСЯ» НЕДОСТАТОЧНО', title_en: 'YOGA FOR THOSE WHO NEED MORE THAN "JUST A STRETCH"', city: 'Нячанг', address: 'Orhideya Ballet Studio, 46 Hòn Chồng, Bắc Nha Trang, Khánh Hòa 650000', start_date: '2026-10-13', start_time: '08:00:00', lat: 12.2744037, lng: 109.2001794 }),
    want: null,
  },
  // Кейс из окна прогона 38601237058 (14.10 16:49Z): «Занятие по Робототехнике в Unicorns»
  // (16:00) и «Занятие по рисованию в Unicorns» (12:00) — один адрес, 2 общих слова
  // (занятие = тип, unicorns = площадка), но РАЗЛИЧАЮЩЕЕ слово разное → ложный архив.
  {
    name: 'ЛОЖНАЯ: два занятия одной студии (Unicorns: робототехника 16:00 ↔ рисование 12:00)',
    a: mk({ id: 'k', title: 'Занятие по Робототехнике в Unicorns', title_en: 'Robotics class at Unicorns', city: 'Чангу, Bali', address: 'Jl. Baru Indah, Tibubeneng, Kec. Kuta Utara, Kabupaten Badung, Bali, Индонезия', start_date: '2026-10-14', start_time: '16:00:00', lat: -8.6284384, lng: 115.1676003 }),
    b: mk({ id: 'l', title: 'Занятие по рисованию в Unicorns', title_en: 'Drawing class at Unicorns', city: 'Чангу, Bali', address: 'Jl. Baru Indah, Tibubeneng, Kec. Kuta Utara, Kabupaten Badung, Bali, Индонезия', start_date: '2026-10-14', start_time: '12:00:00', lat: -8.6284384, lng: 115.1676003 }),
    want: null,
  },
];

let ok = 0, bad = 0;
for (const c of cases) {
  const r = liveAbbrevMatch(c.a, c.b) || liveDupeMatch(c.a, c.b) || liveLangPlaceMatch(c.a, c.b);
  const pass = c.want === null ? r === null : r !== null;
  console.log(`${pass ? 'OK  ' : 'FAIL'} ${c.name} -> ${r === null ? 'НЕ склеено' : 'склеено: ' + r}`);
  pass ? ok++ : bad++;
}
console.log(`итог: ${ok}/${cases.length}, провалов ${bad}`);
