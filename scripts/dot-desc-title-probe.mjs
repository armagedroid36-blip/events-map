// Читающий зонд: живые карточки, где description == title (класс «описание = заголовок»).
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
import { isJunkDescription } from './desc-junk.mjs';

const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);

const norm = (s) => String(s || '').trim().toLowerCase().replace(/[«»"'`.,!?]/g, '').replace(/\s+/g, ' ');

const rows = await selectAll(
  db,
  'events',
  'id,title,title_ru,title_en,description,description_ru,description_en,status,city,start_date,website,source_type',
  { filter: (q) => q.eq('status', 'active') },
);
console.log('живых:', rows.length);

const same = [];
for (const r of rows) {
  const titles = [r.title, r.title_ru, r.title_en].filter(Boolean).map(norm);
  const descs = [r.description, r.description_ru, r.description_en].filter(Boolean).map(norm);
  if (!descs.length) continue;
  if (descs.some((d) => titles.includes(d))) same.push(r);
}
console.log('description == title:', same.length);
for (const r of same) {
  console.log(`\n--- ${String(r.id).slice(0, 8)} | ${r.start_date} | ${r.city} | ${r.source_type}`);
  console.log('  title:', JSON.stringify(r.title));
  console.log('  desc :', JSON.stringify(r.description));
  console.log('  site :', r.website);
  console.log('  junk?', isJunkDescription(r.description), isJunkDescription(r.description_ru));
}
