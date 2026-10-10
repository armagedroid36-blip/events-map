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
];

let ok = 0, bad = 0;
for (const c of cases) {
  const r = liveAbbrevMatch(c.a, c.b) || liveDupeMatch(c.a, c.b) || liveLangPlaceMatch(c.a, c.b);
  const pass = c.want === null ? r === null : r !== null;
  console.log(`${pass ? 'OK  ' : 'FAIL'} ${c.name} -> ${r === null ? 'НЕ склеено' : 'склеено: ' + r}`);
  pass ? ok++ : bad++;
}
console.log(`итог: ${ok}/${cases.length}, провалов ${bad}`);
