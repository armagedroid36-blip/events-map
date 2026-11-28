// Юнит правила townFromName: источник назвал ОКРУГ, а имя площадки — городок.
// Кейс-эталон (run 1121): Ayia Napa Marina в 5.3 км от центра Ая-Напы, порог
// snapDistrictLabel 3 км не достаёт, 7 карточек носили «Фамагуста» при 2 «Ая-Напа».
import { townFromName } from './cy-districts.mjs';

let fail = 0;
const t = (name, got, want) => {
  const ok = got === want;
  if (!ok) fail++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}: «${got}»${ok ? '' : ` (ждали «${want}»)`}`);
};

// срабатывает: округ + имя площадки называет городок того же округа
t('марина Ая-Напы (EN)', townFromName('Фамагуста, Кипр', 'Ayia Napa Marina'), 'Ая-Напа');
t('марина Ая-Напы (RU-транслит)', townFromName('Фамагуста, Кипр', 'Айя-Напа Марина'), 'Ая-Напа');
t('Агиа-Напа латиницей', townFromName('Фамагуста, Кипр', 'Agia Napa Harbour'), 'Ая-Напа');
t('Протарас в адресе', townFromName('Фамагуста, Кипр', 'Velissima, Protaras'), 'Протарас');
t('Паралимни в адресе', townFromName('Фамагуста, Кипр', 'Pinocchio Park, Paralimni'), 'Паралимни');
t('Полис в адресе (округ Пафос)', townFromName('Пафос, Кипр', 'Polis Chrysochous Square'), 'Полис');

// контроль подстроки: «Технополис» — не Полис (ложный матч чувствителен к границе слова)
t('Технополис 20 не Полис', townFromName('Пафос, Кипр', 'Технополис 20, Пафос'), 'Пафос, Кипр');
t('Technopolis 20 не Полис', townFromName('Пафос, Кипр', 'Technopolis 20'), 'Пафос, Кипр');
t('Polis Chrysochous — Полис', townFromName('Пафос, Кипр', 'Central Square, Polis Chrysochous'), 'Полис');

// молчит: чужая метка не переписывается
t('городок уже верный', townFromName('Ая-Напа, Кипр', 'Ayia Napa Marina'), 'Ая-Напа, Кипр');
t('округа в метке нет', townFromName('Лимасол, Кипр', 'Ayia Napa Marina'), 'Лимасол, Кипр');
t('чужой округ: Протарас при Пафосе', townFromName('Пафос, Кипр', 'Protaras Beach'), 'Пафос, Кипр');
t('пустой текст', townFromName('Фамагуста, Кипр', ''), 'Фамагуста, Кипр');
t('пустая метка', townFromName('', 'Ayia Napa Marina'), '');
t('Фамагуста-город не переименовывается', townFromName('Фамагуста, Кипр', 'Famagusta Old Town'), 'Фамагуста, Кипр');
// контроль сенсора: та же геометрия snapDistrictLabel даёт округ — почему правило и нужно
t('метка без округа не трогается', townFromName('Никосия, Кипр', 'Ayia Napa Marina 27'), 'Никосия, Кипр');

console.log(fail ? `\nПРОВАЛОВ: ${fail}` : '\nВСЕ ПРОШЛИ');
process.exit(fail ? 1 : 0);
