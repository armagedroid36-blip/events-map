// Юнит словаря пинов Megatix (запуск 943): адрес площадки даёт её пин, незнакомый — null.
import assert from 'node:assert';
import { megatixPinForAddress, MEGATIX_VENUE_PINS, normAddr } from './megatix-venue-pins.mjs';

let ok = 0;
const cases = [
  // полное совпадение адреса из базы (Samadi, 3 карточки в одной точке)
  ['Jalan Padang Linjong 39, Canggu, Samadi Yoga & Wellness Center', true],
  // пунктуация и регистр не мешают
  ['KU DE TA,  SEMINYAK, Ku De Ta', true],
  // незнакомый адрес — пин не выдумываем (центр района)
  ['Jl. No Such Street 1, Ubud, Unknown', false],
  ['', false],
];

for (const [addr, expectHit] of cases) {
  const pin = megatixPinForAddress(addr);
  assert.strictEqual(Boolean(pin), expectHit, `адрес «${addr}» → ${JSON.stringify(pin)}`);
  if (pin) {
    assert.ok(Number.isFinite(pin.lat) && Number.isFinite(pin.lng), 'координаты числовые');
    assert.ok(pin.lat < -8 && pin.lat > -9.2, 'широта в пределах Бали');
    assert.ok(pin.lng > 114.4 && pin.lng < 115.8, 'долгота в пределах Бали');
  }
  ok++;
}

// Контроль: ключи словаря уже нормализованы — иначе lookup молча не срабатывает.
for (const key of MEGATIX_VENUE_PINS.keys()) assert.strictEqual(key, normAddr(key), `ключ не нормализован: ${key}`);
ok++;

// Известных площадок не меньше, чем было геокодировано в 941 без фолбэков.
assert.ok(MEGATIX_VENUE_PINS.size >= 20, `словарь подозрительно пуст: ${MEGATIX_VENUE_PINS.size}`);
ok++;

console.log(`ИТОГ OK ${ok}/${ok}, площадок в словаре ${MEGATIX_VENUE_PINS.size}`);

// Каждый адрес словаря обязан разрешаться в СВОЙ пин (иначе lookup молча промахивается).
let selfOk = 0;
for (const [addr, pin] of MEGATIX_VENUE_PINS) {
  const got = megatixPinForAddress(addr);
  assert.ok(got && Math.abs(got.lat - pin.lat) < 1e-9 && Math.abs(got.lng - pin.lng) < 1e-9, `самопроверка промахнулась: ${addr}`);
  selfOk++;
}
console.log(`Самопроверка словаря: ${selfOk}/${MEGATIX_VENUE_PINS.size}`);
