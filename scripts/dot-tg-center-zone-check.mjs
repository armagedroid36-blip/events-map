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

// 6. La Villa (176/3 Hùng Vương, Нячанг): пин одной площадки не должен гулять —
//    адрес обязан находиться в словаре (Nominatim по имени даёт []).
const lv1 = lookup('La Villa Art hotel & restaurant, 176/3 Hùng Vương, Нячанг, Вьетнам');
t('адрес La Villa находит точку дома 176/3 Hùng Vương', !!lv1, JSON.stringify(lv1));
t('точка La Villa = 12.2342796,109.1955115',
  lv1 && Math.abs(lv1.lat - 12.2342796) < 1e-6 && Math.abs(lv1.lng - 109.1955115) < 1e-6,
  lv1 ? `${lv1.lat},${lv1.lng}` : 'нет');
t('«La Villa» без адреса тоже находит точку', !!lookup('La Villa, Нячанг'));

// 6b. CCCP Cafe (Нячанг, Tô Hiến Thành): у сети два филиала, словарь обязан
//     различать их — иначе пин клуба снова уедет на центровую константу/чужой филиал.
const cc1 = lookup('CCCP Cafe, Нячанг');
t('адрес «CCCP Cafe» находит точку клуба', !!cc1, JSON.stringify(cc1));
t('точка CCCP Cafe = 12.23997,109.1922089',
  cc1 && Math.abs(cc1.lat - 12.23997) < 1e-6 && Math.abs(cc1.lng - 109.1922089) < 1e-6,
  cc1 ? `${cc1.lat},${cc1.lng}` : 'нет');
const cc2 = lookup('CCCP COFFEE HỒNG BÀNG, 112 Đ. Hồng Bàng, Нячанг');
t('филиал «CCCP COFFEE HỒNG BÀNG» НЕ попадает на точку клуба',
  !cc2 || Math.abs(cc2.lat - 12.23997) > 1e-6, cc2 ? `${cc2.lat},${cc2.lng}` : 'нет');

// 7. Порядок в geocode: словарь обязан проверяться ДО вариантов Nominatim,
//    иначе геокодер перебивает подтверждённую точку (кейс 705).
const gStart = src.indexOf('async function geocode(');
const gBody = gStart >= 0 ? src.slice(gStart, gStart + 1500) : '';
const iDict = gBody.indexOf('placeCoords(address)');
const iNom = gBody.indexOf('await nominatim(');
t('geocode зовёт словарь раньше Nominatim', iDict > 0 && iNom > iDict, `dict@${iDict} nom@${iNom}`);

console.log(`\n${fail === 0 ? 'ВСЕ ОК' : 'ЕСТЬ ОШИБКИ'}: ${ok}/${ok + fail}`);
process.exit(fail === 0 ? 0 : 1);
