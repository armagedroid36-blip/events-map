// Ремонт данных: описания-ярлыки («Balletto di Milano», «Vienna Mozart Orchestra») и
// описания, повторяющие заголовок, -> пусто.
// Страховки: карточка active, текущее description РОВНО ожидаемое, фильтр считает его мусором.
// DRY по умолчанию, APPLY=1 для записи.
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
import { isJunkDescription, isTitleEcho } from './desc-junk.mjs';

const APPLY = process.env.APPLY === '1';
const TARGETS = [
  // id-префикс | ожидаемое описание | обоснование
  ['a1adde4d', 'Vienna Mozart Orchestra', 'Cyprus Now: описание = имя оркестра (строка состава)'],
  ['c4955c62', 'Balletto di Milano', 'Cyprus Now/страница события: «About this event» = строка состава'],
  ['c934bdec', 'Balletto di Milano', 'то же (Лимасол)'],
  ['ea7d0490', 'Balletto di Milano', 'то же (Пафос)'],
  ['22db6523', 'CHASING LIFE | COLLECTIVE FRAMES', 'Cyprus Now: description == title (API отдаёт название дважды)'],
  ['73505e28', 'Bachata – Beginner Course Thursdays in Limassol', 'Cyprus Now: description == title'],
];

const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
const rows = await selectAll(db, 'events', 'id,status,title,description,description_ru,description_en');
let applied = 0;
let skipped = 0;
let errors = 0;

for (const [prefix, expected, why] of TARGETS) {
  const card = rows.find((r) => String(r.id).toLowerCase().startsWith(prefix));
  if (!card) {
    console.log(`ПРОПУСК ${prefix}: карточка не найдена`);
    skipped++;
    continue;
  }
  if (card.status !== 'active') {
    console.log(`ПРОПУСК ${prefix}: статус ${card.status}`);
    skipped++;
    continue;
  }
  const cur = String(card.description_ru || card.description || '').trim();
  if (cur !== expected) {
    console.log(`ПРОПУСК ${prefix}: описание в базе «${cur.slice(0, 60)}» != ожидаемого`);
    skipped++;
    continue;
  }
  if (!isJunkDescription(cur) && !isTitleEcho(cur, card.title)) {
    console.log(`ПРОПУСК ${prefix}: фильтр не считает описание мусором`);
    skipped++;
    continue;
  }
  console.log(`${APPLY ? 'ПИШУ' : 'СУХО'} ${prefix}: description «${cur}» -> '' (${why})`);
  if (!APPLY) continue;
  const { data, error } = await db
    .from('events')
    .update({ description: '', description_ru: '', description_en: '' })
    .eq('id', card.id)
    .select('id');
  if (error || !data?.length) {
    console.log(`ОШИБКА ${prefix}: ${error?.message || 'записано 0 строк'}`);
    errors++;
    continue;
  }
  applied++;
}

console.log(`Итог: применено ${applied}, пропущено ${skipped}, ошибок ${errors}${APPLY ? '' : ' (сухой прогон)'}`);
