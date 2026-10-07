// Юнит правила «адрес = название города» (address-junk.isCityAddress).
import { isCityAddress, cleanAddress } from './address-junk.mjs';
const YES = [
  ['Нячанг', 'Нячанг'], ['Дананг', 'Дананг'], ['Дананг, Вьетнам', 'Дананг'],
  ['г. Нячанг', 'Нячанг'], ['нячанг.', 'Нячанг'],
];
const NO = [
  ['Nha Trang, Vietnam', 'Нячанг'],
  ['Prime, 27 Đ. Số 7, Khu đô thị Hà Quang 2', 'Нячанг'],
  ['Dragon Bar — 10 этаж, Satya Hotel; An Thuong by Night', 'Дананг'],
  ['кофейня в районе My An', 'Дананг'],
  ['', 'Нячанг'], [null, 'Нячанг'],
];
let ok = 0, bad = 0;
for (const [a, c] of YES) { if (isCityAddress(a, c)) ok++; else { bad++; console.log('НЕ отсеклось:', a, '|', c); } }
for (const [a, c] of NO) { if (!isCityAddress(a, c)) ok++; else { bad++; console.log('ЛОЖНО отсеклось:', a, '|', c); } }
console.log(`юнит: ${ok}/${YES.length + NO.length} OK, провалов ${bad}`);
console.log('контроль cleanAddress не сломан:', cleanAddress('Где: Ресторан 369') === 'Ресторан 369');
