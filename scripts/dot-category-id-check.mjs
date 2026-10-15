// Инвариант: любой id, который LLM-судья (category-llm.mjs) может вернуть, обязан
// существовать в таблице categories. Иначе вставка события падает на FK
// events_category_id_fkey и событие теряется молча (кейс 15.10.2026:
// «A Poem Is Being Written by a Landscape», лента Cyprus Now → «Culture & Community»).
// Запуск: node --env-file=.env scripts/dot-category-id-check.mjs
import { createClient } from '@supabase/supabase-js';
import { CATEGORY_IDS } from './category-llm.mjs';

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });

const { data, error } = await db.from('categories').select('id,name_ru');
if (error) {
  console.error('ошибка чтения categories:', error.message);
  process.exit(2);
}
const dbIds = new Set((data || []).map((c) => c.id));
console.log(`категорий в базе: ${dbIds.size} | разрешённых у судьи: ${CATEGORY_IDS.size}`);

const missing = [...CATEGORY_IDS].filter((id) => !dbIds.has(id));
const extra = [...dbIds].filter((id) => !CATEGORY_IDS.has(id));
for (const id of extra) {
  const row = (data || []).find((c) => c.id === id);
  console.log(`  вне списка судьи (но есть в базе): ${id} — ${row?.name_ru || ''}`);
}
console.log(missing.length ? `ФЕЙЛ: нет в базе: ${missing.join(', ')}` : 'OK: все id судьи существуют в categories (FK не сломается)');

// Контроль «мусорных» значений, которые роняли вставку: их больше не пропускаем.
const junk = ['Culture & Community', 'art', 'Dance', 'visual-arts', 'other'];
const leaked = junk.filter((j) => CATEGORY_IDS.has(j));
console.log(leaked.length ? `ФЕЙЛ: пропускаются мусорные id: ${leaked.join(', ')}` : 'OK: ярлыки лент (Culture & Community, Dance, art) не пропускаются');
process.exit(missing.length || leaked.length ? 1 : 0);
