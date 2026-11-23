// Точка «События»: маркер повтора в тексте поста (hasRecurrenceMarker).
// Ветка «продление серии» в collect-tg.mjs делает карточку вечным weekly —
// это можно только если пост САМ говорит о повторе. Кейсы 1030/1031: два
// разовых поста получили weekly и не снимались archive-past никогда.
process.env.COLLECT_TG_NO_RUN = '1';
const { hasRecurrenceMarker } = await import('./collect-tg.mjs');

const CASES = [
  // разовые посты — маркера быть не должно
  { t: 'Друзья, приглашаю вас на практику хатха-йоги завтра в 11:00\n⏰ Суббота, 11:00\n📍 Дананг', expect: false },
  { t: 'ЙОГА в Дананге\n🗓 8 ноября суббота\n#дата: 8.11\nНачало в 8:00', expect: false },
  { t: 'Лекция «Архитектура Бали»\n19 ноября, четверг, 19:00\nВход свободный', expect: false },
  { t: 'Каждый день новые впечатления — приходите на завтрак в кафе', expect: false }, // «каждый день» ≠ weekly
  { t: '', expect: false },
  // настоящие серии — маркер обязателен
  { t: 'Табата по понедельникам в 18:00, Nha Trang', expect: true },
  { t: 'Каждую субботу — пиклбол на G4, Дананг, 8:00', expect: true },
  { t: 'Расписание практик на неделю: вторник 9:00, четверг 19:00, суббота 10:00', expect: true },
  { t: 'English club — еженедельно по средам, 19:00', expect: true },
  { t: 'Sunrise yoga every Saturday at 6:30, Canggu', expect: true },
  { t: 'Weekly quiz night at Deus Cafe, 19:30', expect: true },
  { t: 'Медитация раз в неделю, воскресенье 10:00', expect: true },
];

let ok = 0;
for (const c of CASES) {
  const got = hasRecurrenceMarker(c.t);
  const pass = got === c.expect;
  if (pass) ok++;
  console.log(pass ? 'OK  ' : 'FAIL', JSON.stringify(c.t.slice(0, 55)), '->', got);
}
console.log(`${ok}/${CASES.length} OK`);
if (ok !== CASES.length) process.exitCode = 1;
