// Юнит: метка района Бали. Канон из адреса СИЛЬНЕЕ реестра площадок (который собран из базы
// и накапливает её исторические ошибки). Кейс-эталон: «Jl. Batu Mejan No.8, Canggu, Kec. Kuta Utara»
// хранилась в базе как «Кута» и реестр возвращал «Кута», хотя адрес называет Чангу.
// Запуск: node scripts/dot-bali-district-registry-check.mjs
import { addressDistrict, districtFor, districtForBali, missingCenterLabels } from './bali-districts.mjs';

let ok = 0;
let fail = 0;
function eq(name, got, want) {
  if (got === want) {
    ok++;
    console.log(`ok   ${name}`);
  } else {
    fail++;
    console.log(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  }
}

const mej = 'Jl. Batu Mejan No.8, Canggu, Kec. Kuta Utara, Kabupaten Badung';
eq('адрес Batu Mejan называет Чангу', addressDistrict(mej), 'Чангу');
eq('реестр «Кута» не перебивает адрес', districtForBali(mej, 'Кута', 'Кута'), 'Чангу');
eq('districtFor по тому же адресу = Чангу', districtFor(mej, 'Кута'), 'Чангу');
eq('Seminyak сильнее реестра', districtForBali('Jl. Kayu Aya, Seminyak', 'Кута', 'Кута'), 'Семиньяк');
eq('адрес без канона → реестр', districtForBali('Jl. Raya Sibang Kaja', 'Убуд', 'Керобокан'), 'Керобокан');
eq('адрес без канона и без реестра → districtName', districtForBali('Jl. Raya Sibang Kaja', 'Убуд', null), 'Убуд');
eq('реестр вне Бали (Джакарта) игнорируется', districtForBali('Jl. Sudirman', 'Убуд', 'Джакарта'), 'Убуд');
eq('пустой адрес не ломает', districtForBali(null, null, null), 'Bali');
const missing = missingCenterLabels();
eq('у каждого канона есть центр района', missing.length, 0);
if (missing.length) console.log('каноны без центра:', missing.join(', '));

console.log(`\n${ok}/${ok + fail}`);
process.exit(fail ? 1 : 0);
