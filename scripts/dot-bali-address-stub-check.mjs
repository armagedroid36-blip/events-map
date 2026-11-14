// Юнит санитайзера адреса Бали (scripts/bali-address.mjs).
// Главное свойство: настоящий адрес возвращается БАЙТ-В-БАЙТ (ключ дедупа
// `city|title+address` не должен расходиться с уже собранными строками).
import { cardAddressBali } from './bali-address.mjs';

let ok = 0;
let bad = 0;
function eq(name, got, want) {
  if (got === want) { ok++; console.log(`OK  ${name}`); }
  else { bad++; console.log(`FAIL ${name}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); }
}

const FB = 'Убуд, Bali';
eq('страна+остров → фолбэк', cardAddressBali('Bali, Indonesia', FB), FB);
eq('только страна → фолбэк', cardAddressBali('Indonesia', FB), FB);
eq('кириллицей → фолбэк', cardAddressBali('Бали, Индонезия', FB), FB);
eq('пусто → null (адрес не выдумываем)', cardAddressBali('', FB), null);
eq('null → null', cardAddressBali(null, FB), null);
eq('Unknown → фолбэк', cardAddressBali('Unknown', FB), FB);
eq('фолбэк-заглушка → null', cardAddressBali('Bali, Indonesia', 'Bali'), null);

const real = 'Jl. Sri Wedari No.24, Tegallalang, Kabupaten Gianyar, Bali 80571, Indonesia';
eq('настоящий адрес не режется', cardAddressBali(real, FB), real);
eq('хвостовая страна сохраняется (ключ дедупа)',
  cardAddressBali('Ubud Palace, Jl. Raya Ubud No. 8, Ubud, Bali', FB),
  'Ubud Palace, Jl. Raya Ubud No. 8, Ubud, Bali');
eq('повторы частей не убираются (ключ дедупа)',
  cardAddressBali('Canggu, Kuta Utara, Canggu', FB), 'Canggu, Kuta Utara, Canggu');
eq('имя площадки вместо адреса сохраняется', cardAddressBali('Savaya Bali', FB), 'Savaya Bali');
eq('пробелы схлопываются', cardAddressBali('  Jl.  Kajeng ,  Ubud ', FB), 'Jl. Kajeng , Ubud');

console.log(`\n${bad === 0 ? 'OK' : 'FAIL'} ${ok}/${ok + bad}`);
process.exit(bad === 0 ? 0 : 1);
