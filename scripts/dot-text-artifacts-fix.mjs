// Ремонт живых карточек: невидимые символы (U+200B/U+FEFF/U+2060/U+200E/U+200F/U+00AD)
// и двойные пробелы в title/description/address.
// DRY по умолчанию (печатает, что изменится); APPLY=1 — записать.
// Страховки: карточка живая (active/moderation), значение реально меняется чисткой,
// чистое значение непустое (иначе поле не трогаем), запись проверяется .select('id').
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
import { cleanCardText, hasInvisible } from './text-safe.mjs';

const APPLY = process.env.APPLY === '1';
const FIELDS = ['title', 'title_ru', 'title_en', 'description', 'description_ru', 'description_en', 'address'];
const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
const rows = await selectAll(db, 'events', ['id', 'status', 'city', ...FIELDS].join(','), {
  filter: (q) => q.in('status', ['active', 'moderation']),
});

let changed = 0;
let skipped = 0;
let errors = 0;
for (const r of rows) {
  const patch = {};
  for (const f of FIELDS) {
    const v = r[f];
    if (v === null || v === undefined) continue;
    const s = String(v);
    if (!s.trim()) continue;
    const clean = cleanCardText(s);
    if (clean === s) continue;
    if (!clean) { skipped++; continue; } // чистка обнулила поле — не рискуем
    const why = hasInvisible(s) ? 'невидимые' : 'двойные пробелы';
    console.log(`${APPLY ? 'ЗАПИСЬ' : 'DRY  '} ${String(r.id).slice(0, 8)} ${r.status} ${r.city} | ${f} (${why})`);
    console.log(`      было:  ${JSON.stringify(s.slice(0, 120))}`);
    console.log(`      стало: ${JSON.stringify(clean.slice(0, 120))}`);
    patch[f] = clean;
  }
  if (!Object.keys(patch).length) continue;
  changed++;
  if (APPLY) {
    const { data, error } = await db.from('events').update(patch).eq('id', r.id).select('id');
    if (error || !data || !data.length) {
      errors++;
      console.log(`      ОШИБКА записи: ${error?.message || 'ни одна строка не обновлена'}`);
    }
  }
}

console.log(`\nИтог: карточек к правке ${changed}, пропущено полей ${skipped}, ошибок ${errors} (${APPLY ? 'APPLY' : 'DRY'})`);
process.exitCode = errors ? 1 : 0;
