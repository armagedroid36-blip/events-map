import * as L from './live-dupe-key.mjs';
const mk = (o) => ({ title: '', title_ru: null, title_en: null, address: '', ...o });
const cases = [
  ['Handstand vs Vinyasa (разное время)', mk({ title: 'Handstand Workshop - Vivienne Zeng', address: 'Padang Linjong, Canggu', city: 'Чангу, Bali', start_date: '2026-11-23', start_time: '11:15:00', lat: -8.65, lng: 115.13 }),
   mk({ title: 'Vinyasa Flow - Vivienne Zeng', address: 'Padang Linjong, Canggu', city: 'Чангу, Bali', start_date: '2026-11-23', start_time: '09:30:00', lat: -8.65, lng: 115.13 })],
  ['Poseidon vs Azure (разные туры, одно время/пирс)', mk({ title: 'Poseidon Voyage - Sport Fishing + 4 Spots Snorkeling at Nusa Penida', address: 'Sanur Beach, Sanur', city: 'Санур, Bali', start_date: '2026-11-20', start_time: '07:00:00', lat: -8.69, lng: 115.26 }),
   mk({ title: 'Azure Odyssey - Land Tour Nusa Penida + Snorkeling at Manta Point', address: 'Sanur Beach, Sanur', city: 'Санур, Bali', start_date: '2026-11-20', start_time: '07:00:00', lat: -8.69, lng: 115.26 })],
  ['КОНТРОЛЬ: та же программа двух источников (должна склеиться)', mk({ title: 'CHAMBER MUSIC 1 Violin Trio', title_ru: 'Камерная музыка 1: Трио скрипок', address: 'Pallas Theatre, 24 Rigainis, Nicosia', city: 'Никосия, Кипр', start_date: '2026-11-26', start_time: '20:00:00', lat: 35.1731, lng: 33.3576 }),
   mk({ title: 'Καмерная музыка 1 — Τρίο Βιολιών', address: 'Pallas Theatre, 24 Rigainis, Nicosia', city: 'Никосия, Кипр', start_date: '2026-11-26', start_time: '20:00:00', lat: 35.1732, lng: 33.3573 })],
];
for (const [name, a, b] of cases) {
  const r = L.liveDupeMatch(a, b) || L.liveAbbrevMatch(a, b) || L.liveLangPlaceMatch(a, b);
  console.log(`${r ? 'СКЛЕЕНО' : 'не склеено'} [${r || '-'}] — ${name}`);
}
// prefixKey-подобная проверка для мастерских Pangolin
const pref = (e) => L.words(e.title_ru || e.title).slice(0, 2).join(' ');
const p1 = mk({ title: 'Творческая мастерская Pangolin: Magic Paper Canvas Workshop' });
const p2 = mk({ title: 'Творческая мастерская Pangolin: Bracelet Making Workshop' });
console.log('Pangolin prefix:', JSON.stringify(pref(p1)), 'vs', JSON.stringify(pref(p2)), pref(p1) === pref(p2) ? 'СОВПАЛ (плохо)' : 'разные (ок)');
