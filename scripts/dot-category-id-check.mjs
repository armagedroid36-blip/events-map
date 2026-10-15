// Инвариант: любой id, который LLM-судья (category-llm.mjs) может вернуть, обязан
// существовать в таблице categories. Иначе вставка события падает на FK
// events_category_id_fkey и событие теряется молча (кейс 15.10.2026:
// «A Poem Is Being Written by a Landscape», лента Cyprus Now → «Culture & Community»,
// судья ответил «выставки» вместо id).
// Запуск: node --env-file=.env scripts/dot-category-id-check.mjs
import { createClient } from '@supabase/supabase-js';
import { CATEGORY_IDS, CATEGORY_LABELS, normalizeCategory } from './category-llm.mjs';

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });

const { data, error } = await db.from('categories').select('id,name_ru,name_en');
if (error) {
  console.error('ошибка чтения categories:', error.message);
  process.exit(2);
}
const dbIds = new Set((data || []).map((c) => c.id));
console.log(`категорий в базе: ${dbIds.size} | разрешённых у судьи: ${CATEGORY_IDS.size} | названий в карте: ${Object.keys(CATEGORY_LABELS).length}`);

const missing = [...CATEGORY_IDS].filter((id) => !dbIds.has(id));
for (const id of [...dbIds].filter((id) => !CATEGORY_IDS.has(id))) {
  const row = (data || []).find((c) => c.id === id);
  console.log(`  вне списка судьи (но есть в базе): ${id} — ${row?.name_ru || ''}`);
}
console.log(missing.length ? `ФЕЙЛ: нет в базе: ${missing.join(', ')}` : 'OK: все id судьи существуют в categories (FK не сломается)');

// Карта названий обязана покрывать названия категорий из таблицы (RU+EN).
const norm = (s) => String(s || '').trim().toLowerCase().replace(/ё/g, 'е').replace(/[«»"'`]/g, '');
const uncovered = [];
for (const c of data || []) {
  if (c.id === '422eec7b-b448-4bad-a0d9-2b6b44340651') continue; // «Другое», UUID
  for (const label of [c.name_ru, c.name_en]) {
    if (!label) continue;
    const got = CATEGORY_LABELS[norm(label)];
    if (got !== c.id) uncovered.push(`${label} (${c.id}) -> ${got ?? 'нет в карте'}`);
  }
}
console.log(uncovered.length ? `ФЕЙЛ: названия без верного маппинга: ${uncovered.join('; ')}` : 'OK: каждое название категории из базы сводится к своему id');

// Контроль «мусорных» значений: ярлыки лент больше не пропускаются.
const junk = ['Culture & Community', 'art', 'Dance', 'visual-arts', 'other'];
const leaked = junk.filter((j) => normalizeCategory(j));
console.log(leaked.length ? `ФЕЙЛ: пропускаются мусорные ярлыки: ${leaked.join(', ')}` : 'OK: ярлыки лент (Culture & Community, Dance, art) не пропускаются');
// Контроль ответа, который ронял вставку: русское название обязано стать id.
const labelFix = normalizeCategory('выставки');
console.log(labelFix === 'exhibition' ? 'OK: «выставки» -> exhibition (кейс 15.10.2026 закрыт)' : `ФЕЙЛ: «выставки» -> ${labelFix}`);
process.exit(missing.length || leaked.length || uncovered.length || labelFix !== 'exhibition' ? 1 : 0);
