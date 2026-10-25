// Юнит: зона события по ТЕКСТУ поста (findEventZone/locationText, city-zones.mjs).
// Класс run 463: backfill-zones брал только поле address, поэтому карточка, где
// часть города названа в тексте поста, оставалась на центровом фолбэке.
// Запуск: node scripts/dot-zone-text-check.mjs
import { findEventZone, locationText } from './city-zones.mjs';

const cases = [
  ['текст называет север', 'Нячанг', { address: null, title: 'САУНДХИЛИНГ', description: 'КОГДА И ГДЕ: 📍 Локация: север' }, 'north'],
  ['адрес важнее текста', 'Нячанг', { address: 'пляж Нячанга', title: 'Флаг-футбол', description: '📍 Локация: север' }, 'beach'],
  ['центр по тексту не применяем', 'Нячанг', { address: null, title: 'Встреча', description: '📍 Нячанг, центр' }, null],
  ['слово «центр» вне строки про место', 'Нячанг', { address: null, title: 'Лекция', description: 'Собираемся в центре внимания к деталям' }, null],
  ['юг по тексту', 'Нячанг', { address: 'студия Prime', title: 'Танцы', description: '📍 Южный Нячанг, студия Prime' }, 'south'],
  ['Дананг: Нгу Хань Шон', 'Дананг', { address: '', title: 'Йога', description: 'Где: район Нгу Хань Шон' }, 'south'],
  ['пустые поля', 'Нячанг', { address: null, title: 'X', description: '' }, null],
  ['город вне словаря', 'Москва', { address: null, title: 'X', description: '📍 север' }, null],
];

let ok = 0;
for (const [name, city, ev, want] of cases) {
  const got = findEventZone(city, ev);
  const gotZone = got ? got.zone : null;
  const pass = gotZone === want;
  if (pass) ok++;
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${name}: got ${gotZone}, want ${want}`);
}

const lt = locationText('Первая строка\n📍 Локация: север\nЦена 200к');
console.log(`${lt.includes('север') && !lt.includes('Первая') && !lt.includes('Цена') ? 'ok  ' : 'FAIL'} locationText берёт только строку про место: «${lt}»`);
if (lt.includes('север') && !lt.includes('Первая') && !lt.includes('Цена')) ok++;
console.log(`Итого: ${ok}/${cases.length + 1}`);
process.exit(ok === cases.length + 1 ? 0 : 1);
