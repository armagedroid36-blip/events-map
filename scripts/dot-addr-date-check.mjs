// Юнит: «адрес» = только дата/время поста (кейс 1052, карточка 1e7707ff «25.11.26 в 13:00»).
// Проверка: node --env-file=.env scripts/dot-addr-date-check.mjs
import { isJunkAddress } from './address-junk.mjs';

const MUST_JUNK = [
  '25.11.26 в 13:00',
  '25.11 в 19:30',
  '8 ноября 18:00',
  'Суббота, 22.11 в 11:00',
  'вторник 3.12 19:00',
  '#дата: 11.11.2026',
  '13.12.2026',
];
const MUST_PASS = [
  '28 Oktovriou 259, Limassol',
  '115 Đặng Vũ Hỷ, An Hải',
  'Jl. Raya Ubud No.8, Ubud',
  '10 Yersin, Nha Trang',
  '32 Cao Văn Bé',
  '8 ноября 18:00, Тбилиси',
  'Pavilion Hall, 2 Avraam Antoniou, Nicosia',
  '25 Novembriou 12',
];

let ok = 0;
const bad = [];
for (const s of MUST_JUNK) (isJunkAddress(s) ? ok++ : bad.push(`НЕ отсечён: ${s}`));
for (const s of MUST_PASS) (!isJunkAddress(s) ? ok++ : bad.push(`ЛОЖНО отсечён: ${s}`));

console.log(`ИТОГ ${ok}/${MUST_JUNK.length + MUST_PASS.length}`);
for (const b of bad) console.log('  ' + b);
process.exit(bad.length ? 1 : 0);
