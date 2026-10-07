// Ремонт класса «заголовок с эмодзи-мусором» (Балифорум кладёт пиктограммы поста в название).
// Страховки: карточка active, текущий заголовок ровно ожидаемый, после очистки есть буквы,
// запись проверяется перечитыванием (.select('id')). DRY по умолчанию, APPLY=1 — применять.
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
import { cleanTitle } from './collect-bali.mjs';

const APPLY = process.env.APPLY === '1';
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}\u{20E3}]/u;

// ——— юнит-проверка ———
const CASES = [
  ['Игра-квиз Мозгобойня Бали💜 4 года вместе🏝️', 'Игра-квиз Мозгобойня Бали 4 года вместе'],
  ['🍞Всемирный День Хлеба в Unicorns✨', 'Всемирный День Хлеба в Unicorns'],
  ['Женский завтрак экспатов на Буките ❣️', 'Женский завтрак экспатов на Буките'],
  ['🎙️ Импровизационное шоу | Чангу', 'Импровизационное шоу | Чангу'],
  ['Katy Tsunami — Shine Bright Like a Star', 'Katy Tsunami — Shine Bright Like a Star'],
];
let unitOk = 0;
for (const [inp, want] of CASES) {
  const got = cleanTitle(inp);
  if (got === want) unitOk++;
  else console.log(`  ЮНИТ FAIL: ${JSON.stringify(inp)} -> ${JSON.stringify(got)} (ждали ${JSON.stringify(want)})`);
}
console.log(`Юнит cleanTitle: ${unitOk}/${CASES.length} OK`);

const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);

const prefix = (id) => String(id).slice(0, 8);
const rows = await selectAll(db, 'events', 'id,title,title_ru,title_en,status,city', {
  filter: (q) => q.eq('status', 'active'),
});
const targets = rows.filter((r) => EMOJI.test(String(r.title_ru || r.title || '')));

console.log(`Живых с эмодзи в заголовке: ${targets.length} (из ${rows.length})`);
let applied = 0;
let skipped = 0;
let errors = 0;
for (const r of targets) {
  const id = String(r.id);
  const t = String(r.title || '');
  const tRu = String(r.title_ru || '');
  const tEn = String(r.title_en || '');
  const newTitle = cleanTitle(t);
  const newRu = cleanTitle(tRu);
  const newEn = cleanTitle(tEn);
  if (!newRu.replace(/[^\p{L}\p{N}]/gu, '')) {
    console.log(`  ПРОПУСК ${prefix(id)}: после очистки нет текста (${JSON.stringify(tRu)})`);
    skipped++;
    continue;
  }
  const patch = {};
  if (t !== newTitle) patch.title = newTitle;
  if (tRu !== newRu) patch.title_ru = newRu;
  if (tEn !== newEn) patch.title_en = newEn;
  if (!Object.keys(patch).length) {
    skipped++;
    continue;
  }
  console.log(`  ${APPLY ? '[apply]' : '[dry]'} ${prefix(id)} ${r.city} | ${JSON.stringify(tRu)} -> ${JSON.stringify(newRu)}`);
  if (!APPLY) continue;
  const { data, error } = await db.from('events').update(patch).eq('id', id).select('id,title,title_ru,title_en');
  if (error) {
    console.log(`    ОШИБКА: ${error.message}`);
    errors++;
    continue;
  }
  const back = (data || [])[0];
  if (!back || EMOJI.test(String(back.title_ru || back.title || ''))) {
    console.log('    ОШИБКА: перечитывание не подтвердило очистку');
    errors++;
    continue;
  }
  applied++;
}
console.log(`Итог: ${APPLY ? `применено ${applied}, ` : ''}пропущено ${skipped}, ошибок ${errors}`);

if (APPLY) {
  const after = await selectAll(db, 'events', 'id,title,title_ru,status', { filter: (q) => q.eq('status', 'active') });
  const left = after.filter((r) => EMOJI.test(String(r.title_ru || r.title || '')));
  console.log(`Контроль: живых с эмодзи в заголовке ${targets.length} -> ${left.length}`);
  for (const r of left) console.log(`   остаток ${prefix(r.id)} ${JSON.stringify(r.title_ru || r.title)}`);
}
