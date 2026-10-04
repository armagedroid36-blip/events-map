// Аудит «одно фото на разные события»: если URL фото у активных карточек повторяется,
// а названия событий разные — это картинка страницы-списка/канала/заглушка сайта,
// а не фото события. Серии одного события (одно название, разные даты) не трогаем.
// Сухой прогон: node --env-file=.env scripts/dot-photo-dupe-audit.mjs
// Записать:     APPLY=1 node --env-file=.env scripts/dot-photo-dupe-audit.mjs
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const APPLY = process.env.APPLY === '1';
const SKIP = (process.env.SKIP_SUBSTR || '').split(',').filter(Boolean);
const db = createClient(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, {
  auth: { persistSession: false },
});
const PLACEHOLDER = /og-default|placeholder|favicon|\/logo|logo\.|sprite|no-?image|default\.(png|jpg|jpeg|webp)/i;

const toks = (t) =>
  String(t || '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 2 && !/^\d+$/.test(w));

// «то же событие»: первые 3 значимых слова названия совпадают
const sameEvent = (a, b) => {
  const A = toks(a).slice(0, 3).join(' ');
  const B = toks(b).slice(0, 3).join(' ');
  return A && B && A === B;
};

const rows = await selectAll(db, 'events', 'id,status,title,city,start_date,photos,website');
const act = rows.filter((r) => r.status === 'active' && (r.photos || []).length);
console.log('active с фото:', act.length, '| режим:', APPLY ? 'APPLY' : 'dry');

const byUrl = new Map();
for (const r of act) {
  const u = r.photos[0];
  if (!byUrl.has(u)) byUrl.set(u, []);
  byUrl.get(u).push(r);
}

const bogus = [];
let keep = 0;
for (const [url, list] of byUrl.entries()) {
  const first = list[0].title;
  const allSame = list.every((r) => sameEvent(first, r.title));
  const skipped = SKIP.some((s) => url.includes(s));
  const bad = !skipped && list.length > 1 && !allSame;
  const ph = PLACEHOLDER.test(url) && list.length === 1;
  if (!list.length || (list.length === 1 && !ph)) {
    keep++;
    continue;
  }
  if (bad || ph) {
    console.log(`\nЗАГЛУШКА${ph ? ' (шаблон)' : ''} | карточек ${list.length} | ${url.slice(0, 95)}`);
    for (const r of list) console.log(`    ${r.id.slice(0, 8)} ${r.city} ${r.start_date} | ${r.title.slice(0, 55)}`);
    bogus.push(...list.map((r) => r.id));
  } else {
    keep++;
    if (list.length > 1) console.log(`ок (серия одного события, ${list.length} карточек): ${first.slice(0, 45)}`);
  }
}

console.log('\nк очистке карточек:', bogus.length, '| групп-серий оставлено:', keep);
if (APPLY && bogus.length) {
  const { data, error } = await db.from('events').update({ photos: [] }).in('id', bogus).select('id');
  if (error) throw error;
  console.log('очищено:', (data || []).length, '| ожидалось:', bogus.length);
} else if (bogus.length) {
  console.log('(сухой прогон — база не тронута)');
}
