// Юнит: зона `center` не должна ставить пин по слову «центр», а словарь
// известных мест обязан отдавать точку Prime Space (27 Đ. Số 7, Нячанг).
// Кейс: карточки «Кафе PRIME | Центр» получали пин у Neverland (40 Hồng Bàng),
// 1.2 км от кафе, потому что collect-tg звал findCityZone напрямую.
import { readFileSync } from 'node:fs';
import { findEventZone } from './city-zones.mjs';

let ok = 0, fail = 0;
const t = (name, cond, extra = '') => {
  if (cond) { ok++; console.log('  ok  ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' → ' + extra : '')); }
};

// 1. «Центр» в строке локации НЕ даёт зону (якорь зоны — конкретное здание).
const z1 = findEventZone('Нячанг', {
  address: '',
  title: 'Мастер-класс',
  description: '📍 Нячанг | Кафе PRIME | Центр',
});
t('«Центр» не ставит зону center', z1 === null, JSON.stringify(z1));

// 2. Направление по-прежнему работает (это законные зоны, не здание).
const z2 = findEventZone('Нячанг', {
  address: '',
  title: 'Йога',
  description: '📍 Нячанг, север, рядом с Океанусом',
});
t('«север» даёт зону north', z2 && z2.zone === 'north', JSON.stringify(z2));

// 3. Пляж важнее центра и остаётся.
const z3 = findEventZone('Нячанг', {
  address: 'набережная Trần Phú',
  title: 'Завтрак',
  description: '',
});
t('«набережная» даёт зону beach', z3 && z3.zone === 'beach', JSON.stringify(z3));

// 4. Словарь известных мест (читаем реальный массив из сборщика).
const src = readFileSync(new URL('./collect-tg.mjs', import.meta.url), 'utf8');
const m = src.match(/const PLACE_COORDS = (\[[\s\S]*?\n\]);/);
t('массив PLACE_COORDS найден', !!m);
let dict = [];
if (m) dict = new Function('return ' + m[1])();
const lookup = (addr) => {
  const low = String(addr).toLowerCase();
  for (const p of dict) if (low.includes(p.key)) return p;
  return null;
};
const p1 = lookup('Prime, 27 Đ. Số 7, Khu đô thị Hà Quang 2, Nam Nha Trang, Khánh Hòa 54000');
t('адрес 27 Đ. Số 7 находит точку Prime', !!p1, JSON.stringify(p1));
t('точка Prime = Đường số 7 (12.2461874,109.1783145)',
  p1 && Math.abs(p1.lat - 12.2461874) < 1e-6 && Math.abs(p1.lng - 109.1783145) < 1e-6,
  p1 ? `${p1.lat},${p1.lng}` : 'нет');
const p2 = lookup('Prime Space, 4 этаж, Нячанг');
t('«Prime Space» тоже находит точку', !!p2);

// 5. Чужие площадки не должны попасть на точку Prime.
t('«Prime and LULU, 23 Tháng 10» — отдельная площадка',
  !lookup('Prime and LULU, 23 Tháng 10, Нячанг'));

console.log(`\n${fail === 0 ? 'ВСЕ ОК' : 'ЕСТЬ ОШИБКИ'}: ${ok}/${ok + fail}`);
process.exit(fail === 0 ? 0 : 1);
