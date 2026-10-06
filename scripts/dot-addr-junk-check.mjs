// Юнит-проверка фильтра мусорных адресов на РЕАЛЬНЫХ строках из базы (dot-events).
// node scripts/dot-addr-junk-check.mjs
import { isJunkAddress, cleanAddress } from './address-junk.mjs';

const JUNK_CASES = [
  'Где: Центр, локация при записи ❤️',
  'Где: уточняйте у организаторов',
  'Где: локация при записи',
  'север',
  'мост на западе',
  'кольцо около Скении',
  'север (адрес отправим после записи)',
  'Север',
  'уточняйте у организаторов',
  'адрес отправим после записи',
];

const OK_CASES = [
  'Nhà hát Trưng Vương, 86 Hùng Vương, Q. Hải Châu',
  'Yen Garden Bistro',
  'Ресторан 369',
  'Где: Ресторан 369',
  'Локация: M-Bar Sushi (Maple Hotel 25 этаж), 16 Tô…',
  'Livadero Park, Palaichori',
  'Кинематотеатр Acropol Lympia, Никосия',
  'Halloween Party at Camelot Park',
];

let pass = 0;
let fail = 0;
for (const s of JUNK_CASES) {
  const got = isJunkAddress(s);
  if (got) { pass++; } else { fail++; console.log(`FAIL (должно быть мусором): "${s}"`); }
}
for (const s of OK_CASES) {
  const got = isJunkAddress(s);
  if (!got) { pass++; } else { fail++; console.log(`FAIL (должно быть адресом): "${s}"`); }
}
console.log(`юнит: пройдено ${pass}/${pass + fail}, провалов ${fail}`);
console.log(`cleanAddress("Где: уточняйте у организаторов") = ${JSON.stringify(cleanAddress('Где: уточняйте у организаторов'))}`);
console.log(`cleanAddress("Где: Ресторан 369") = ${JSON.stringify(cleanAddress('Где: Ресторан 369'))}`);
process.exit(fail ? 1 : 0);
