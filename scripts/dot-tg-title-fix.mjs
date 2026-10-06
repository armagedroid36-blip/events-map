// Ремонт заголовков TG-карточек, где в название попала служебная строка поста
// (приветствие/зачин). Проверено: только пары с цитатой из поста-источника.
// node --env-file=.env scripts/dot-tg-title-fix.mjs [--apply]
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const APPLY = process.argv.includes('--apply');
const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE;
if (!url || !key) { console.error('Нужны SUPABASE_URL и SUPABASE_SERVICE_ROLE'); process.exit(1); }
const db = createClient(url, key, { auth: { persistSession: false } });

// id → новый заголовок + цитата источника (страница поста t.me/s/)
const TARGETS = [
  {
    id: '577fc414',
    title: 'Завтрак с расстановками',
    src: 'https://t.me/s/danang_afisha/5718',
    quote: 'Приглашаю вас на завтрак с расстановками / 29 встреча / 📅 09.10 🕰️ 12:00 📍Ресторан 369',
    old: 'Всем привет!',
  },
];

let applied = 0, errors = 0;
const all = await selectAll(db, 'events', 'id,title,title_ru,city,start_date,start_time,address,status');
for (const t of TARGETS) {
  const data = all.find((r) => String(r.id).startsWith(t.id));
  if (!data) { console.error(`  [${t.id}] не найдено`); errors++; continue; }
  const cur = (data.title_ru || data.title || '').trim();
  if (cur !== t.old) { console.log(`  [${t.id}] пропуск: текущий заголовок «${cur}» != ожидаемый «${t.old}»`); continue; }
  console.log(`  [${t.id}] ${data.status} | «${cur}» -> «${t.title}» | ${t.src} | ${t.quote}`);
  if (!APPLY) continue;
  const { data: upd, error: uErr } = await db
    .from('events')
    .update({ title: t.title, title_ru: t.title })
    .eq('id', data.id)
    .select('id,title,title_ru');
  if (uErr) { console.error(`  [${t.id}] ошибка записи: ${uErr.message}`); errors++; continue; }
  if (!upd || !upd.length) { console.error(`  [${t.id}] запись не применилась (0 строк)`); errors++; continue; }
  applied++;
}
console.log(`\n${APPLY ? 'Применено' : 'DRY'}: ${applied}, ошибок: ${errors}`);
