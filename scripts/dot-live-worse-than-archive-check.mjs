// Юнит зонда «живая копия хуже архивной» (dot-live-worse-than-archive.mjs).
// Проверяет чистую функцию findWorsePairs на фикстурах, без базы.
import { findWorsePairs, isStubPin } from './dot-live-worse-than-archive.mjs';

const NIC = [35.1856, 33.3823]; // константа Никосии
const REAL = [35.175563, 33.3703569]; // реальная точка (Old Town), 1.56 км от константы

const row = (o) => ({
  id: o.id, status: o.status || 'active', start_date: o.start_date || '2026-10-16',
  title: o.title || '', title_ru: o.title_ru || null, title_en: o.title_en || null,
  city: o.city || 'Никосия, Кипр', address: o.address || '', lat: o.lat, lng: o.lng, start_time: o.start_time || null,
});

const cases = [];
const expect = (name, rows, want, opts) => {
  const got = findWorsePairs(rows, opts).length;
  cases.push({ name, got, want, ok: got === want });
};

// 1. реальный кандидат: живая на константе, архивная на реальной точке
expect('живая на константе ↔ архив с реальной точкой', [
  row({ id: 'live1', title: 'ArtCargo Performing Arts Festival', lat: NIC[0], lng: NIC[1] }),
  row({ id: 'arch1', status: 'archived', title: 'ArtCargo Performing Arts Festival', lat: REAL[0], lng: REAL[1] }),
], 1);

// 2. обе на константах — координату взять неоткуда, не дефект
expect('обе на константах', [
  row({ id: 'live2', title: 'Stub Twin Event', lat: NIC[0], lng: NIC[1] }),
  row({ id: 'arch2', status: 'archived', title: 'Stub Twin Event', lat: NIC[0], lng: NIC[1] }),
], 0);

// 3. живая уже на реальной точке — не дефект
expect('живая не на константе', [
  row({ id: 'live3', title: 'Fine Already', lat: REAL[0], lng: REAL[1] }),
  row({ id: 'arch3', status: 'archived', title: 'Fine Already', lat: 35.1665, lng: 33.3615 }),
], 0);

// 4. сдвиг меньше порога (400 м) — не кандидат
expect('сдвиг 0.4 км < 1 км', [
  row({ id: 'live4', title: 'Short Shift', lat: NIC[0], lng: NIC[1] }),
  row({ id: 'arch4', status: 'archived', title: 'Short Shift', lat: NIC[0] + 0.0036, lng: NIC[1] }),
], 0);

// 5. разные даты — не одно событие
expect('разные даты', [
  row({ id: 'live5', title: 'Different Day', lat: NIC[0], lng: NIC[1], start_date: '2026-10-16' }),
  row({ id: 'arch5', status: 'archived', title: 'Different Day', lat: REAL[0], lng: REAL[1], start_date: '2026-10-17' }),
], 0);

// 6. сопоставление по псевдониму (title_ru живой == title архивной)
expect('псевдоним названия (RU ↔ EN)', [
  row({ id: 'live6', title: 'Фестиваль', title_ru: 'Фестиваль искусств Никосии', lat: NIC[0], lng: NIC[1] }),
  row({ id: 'arch6', status: 'archived', title: 'Фестиваль искусств Никосии', lat: REAL[0], lng: REAL[1] }),
], 1);

// 7. moderation считается живой (не archived)
expect('moderation — тоже живая', [
  row({ id: 'live7', status: 'moderation', title: 'Pending Event', lat: NIC[0], lng: NIC[1] }),
  row({ id: 'arch7', status: 'archived', title: 'Pending Event', lat: REAL[0], lng: REAL[1] }),
], 1);

// 8. без координат — не пара
expect('без гео у живой', [
  row({ id: 'live8', title: 'No Geo', lat: null, lng: null }),
  row({ id: 'arch8', status: 'archived', title: 'No Geo', lat: REAL[0], lng: REAL[1] }),
], 0);

// 9. isStubPin: ровно на константе → город; 300 м в сторону → null
const stubOk = isStubPin(NIC[0], NIC[1]) === 'Никосия';
const stubOff = isStubPin(NIC[0] + 0.004, NIC[1]) === null;

let fail = 0;
for (const c of cases) {
  if (!c.ok) fail++;
  console.log(`${c.ok ? 'ok' : 'FAIL'} | ${c.name}: получили ${c.got}, ждали ${c.want}`);
}
if (!stubOk || !stubOff) fail++;
console.log(`${stubOk && stubOff ? 'ok' : 'FAIL'} | isStubPin: константа=${stubOk ? 'ok' : 'FAIL'}, сдвиг 300м=${stubOff ? 'ok' : 'FAIL'}`);
console.log(`итог: ${cases.filter((c) => c.ok).length}/${cases.length} кейсов ok, isStubPin ${stubOk && stubOff ? 'ok' : 'FAIL'}`);
process.exit(fail === 0 ? 0 : 1);
