// Юнит-проверка фильтра ярлыков-описаний и повторов заголовка на РЕАЛЬНЫХ строках базы + синтетика.
// Запуск: node --env-file=.env scripts/dot-desc-junk-check.mjs
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
import { isJunkDescription, isTitleEcho, cleanDescription } from './desc-junk.mjs';

const JUNK = ['Balletto di Milano', 'Lineup', 'TBA', 'Состав', 'Dance', 'Music'];
const REAL = [
  'Balletto di Milano привозит «Шехеразаду» — вечер балета в двух отделениях.',
  'Соревнования по теннису для спортсменов до 16 лет, на которых ожидается около 100 спортсменов.',
  'Ежегодный фестиваль вина: дегустации, кухня, музыка до поздней ночи',
  'Join us for a guided walk through the historic centre of Limassol.',
];
// Пары «описание == заголовок» (Cyprus Now дублирует название в description).
const ECHO = [
  ['CHASING LIFE | COLLECTIVE FRAMES', 'CHASING LIFE | COLLECTIVE FRAMES'],
  ['Bachata – Beginner Course Thursdays in Limassol', 'Bachata – Beginner Course Thursdays in Limassol'],
  ['Bachata – Beginner Course Thursdays in Limassol ', 'bachata – beginner course thursdays in limassol'],
];
// Пары «описание != заголовок, трогать нельзя».
const NOT_ECHO = [
  ['CHASING LIFE | COLLECTIVE FRAMES', 'CHASING LIFE'],
  ['Ежегодный фестиваль вина: дегустации, кухня, музыка до поздней ночи', 'Фестиваль вина'],
];

let fail = 0;
for (const s of JUNK) {
  if (!isJunkDescription(s)) {
    console.log('FAIL: ярлык не отсечён →', JSON.stringify(s));
    fail++;
  }
}
for (const s of REAL) {
  if (isJunkDescription(s)) {
    console.log('FAIL: настоящее описание отсечено →', JSON.stringify(s.slice(0, 60)));
    fail++;
  }
}
for (const [d, t] of ECHO) {
  if (!isTitleEcho(d, t) || cleanDescription(d, t) !== '') {
    console.log('FAIL: повтор заголовка не отсечён →', JSON.stringify(d));
    fail++;
  }
}
for (const [d, t] of NOT_ECHO) {
  if (isTitleEcho(d, t) || cleanDescription(d, t) === '') {
    console.log('FAIL: настоящее описание отсечено как повтор заголовка →', JSON.stringify(d));
    fail++;
  }
}
const total = JUNK.length + REAL.length + ECHO.length + NOT_ECHO.length;
console.log(`синтетика: ${total - fail}/${total} OK`);

const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
const rows = await selectAll(db, 'events', 'id,title,title_ru,title_en,description,description_ru,description_en,status', {
  filter: (q) => q.eq('status', 'active'),
});
const live = rows.map((r) => ({
  id: String(r.id).slice(0, 8),
  t: r.title_ru || r.title || '',
  alt: [r.title, r.title_ru, r.title_en].filter(Boolean),
  d: String(r.description_ru || r.description || '').trim(),
  descs: [r.description, r.description_ru, r.description_en].filter(Boolean),
}));
const junk = live.filter((r) => isJunkDescription(r.d));
const eqTitle = live.filter((r) => r.descs.some((d) => r.alt.some((t) => isTitleEcho(d, t))));
console.log(`живых ${live.length}: описаний-ярлыков ${junk.length}, описаний == заголовку ${eqTitle.length}`);
for (const r of junk) console.log(`   ${r.id} ${JSON.stringify(r.d)} | ${String(r.t).slice(0, 60)}`);
for (const r of eqTitle) console.log(`   ЭХО ${r.id} ${JSON.stringify(r.d)} | ${String(r.t).slice(0, 60)}`);
process.exit(fail ? 1 : 0);
